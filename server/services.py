import os
import sys
import time
import uuid
import re
import base64
import logging
import io
import asyncio
import threading
from typing import Set, Dict, List, Optional
from fastapi import WebSocket
import httpx
from PIL import Image, ImageDraw, ImageFont, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS

from .database import get_db, DB_DIR, log_event

logger = logging.getLogger("pycasa.services")

# Supported image extensions
IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic", ".heif"
}

# -------------------------------------------------------------------------
# Notification Service
# -------------------------------------------------------------------------
class NotificationService:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    def register(self, websocket: WebSocket):
        self.active_connections.add(websocket)
        logger.debug(f"WebSocket client connected (total: {len(self.active_connections)})")

    def unregister(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.debug(f"WebSocket client disconnected (total: {len(self.active_connections)})")

    def broadcast(self, type_: str, payload: dict):
        ts = int(time.time() * 1000)

        # Persist non-progress events to SQLite
        is_progress = type_.endswith(":progress") or type_ == "scan:cancelling"
        if not is_progress:
            try:
                message = self._build_message(type_, payload)
                detail = self._build_detail(payload)
                notif_id = "notif_" + uuid.uuid4().hex

                with get_db() as conn:
                    conn.execute(
                        "INSERT INTO notifications (id, event_type, message, detail, ts, read) VALUES (?, ?, ?, ?, ?, ?)",
                        (notif_id, type_, message, detail, ts, 0)
                    )
            except Exception as e:
                logger.warning(f"Failed to persist notification '{type_}': {e}")

        # Broadcast to all live WS clients
        if not self.active_connections:
            return

        msg = {
            "type": type_,
            "payload": payload,
            "ts": ts
        }

        if self.loop:
            asyncio.run_coroutine_threadsafe(self._send_to_sockets(msg), self.loop)

    async def _send_to_sockets(self, msg: dict):
        import json
        json_str = json.dumps(msg)
        for ws in list(self.active_connections):
            try:
                await ws.send_text(json_str)
            except Exception:
                self.active_connections.discard(ws)

    def _build_message(self, type_: str, payload: dict) -> str:
        if type_ == "scan:started":
            return "Folder scan started"
        elif type_ == "scan:completed":
            return f"Scan complete — {payload.get('total', 0)} images indexed"
        elif type_ == "scan:error":
            return f"Scan error: {payload.get('message', 'unknown')}"
        elif type_ in ("scan:folder:started", "scan:folder:completed", "scan:folder:complete", "scan:folder:cancelled", "scan:folder:error"):
            return str(payload.get("message", "Folder scan update"))
        elif type_ == "ai:started":
            return f"AI analysis started — {payload.get('total', 0)} images"
        elif type_ == "ai:completed":
            return f"AI analysis complete — {payload.get('analysed', 0)} images analysed"
        elif type_ == "ai:error":
            return f"AI error: {payload.get('message', 'unknown')}"
        elif type_ == "folder-delete:started":
            return str(payload.get("message", "Removing location…"))
        elif type_ == "folder-delete:completed":
            return str(payload.get("message", "Location removed"))
        elif type_ == "folder-delete:error":
            return f"Remove failed: {payload.get('message', 'unknown')}"
        return str(payload.get("message", type_))

    def _build_detail(self, payload: dict) -> Optional[str]:
        if "detail" in payload:
            return str(payload["detail"])
        if "current_file" in payload:
            return str(payload["current_file"])
        return None


notification_service = NotificationService()


# -------------------------------------------------------------------------
# Folder Scan Service
# -------------------------------------------------------------------------
class FolderScanState:
    def __init__(self, folder_id: str, label: str, force: bool):
        self.folder_id = folder_id
        self.label = label
        self.force = force
        self.cancelled = False
        self.scanned = 0
        self.total = 0
        self.last_broadcast = 0.0

# Geocoding cache and coordinate helpers
_GEOCODE_CACHE = {}

def _get_gps_decimal(gps_coords, ref):
    if not gps_coords or not ref:
        return None
    try:
        if len(gps_coords) < 3:
            return None

        def to_float(val):
            if hasattr(val, "numerator") and hasattr(val, "denominator"):
                return float(val.numerator) / float(val.denominator)
            if isinstance(val, (tuple, list)) and len(val) == 2:
                return float(val[0]) / float(val[1])
            return float(val)

        d = to_float(gps_coords[0])
        m = to_float(gps_coords[1])
        s = to_float(gps_coords[2])

        decimal = d + (m / 60.0) + (s / 3600.0)
        if ref in ['S', 'W', 's', 'w']:
            decimal = -decimal
        return decimal
    except Exception as e:
        logger.warning(f"Error parsing GPS coordinate {gps_coords} {ref}: {e}")
        return None

def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    cache_key = (round(lat, 3), round(lon, 3))
    if cache_key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[cache_key]

    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&addressdetails=1"
    headers = {
        "User-Agent": "PycasaPersonalPhotoServer/1.0 (amith@pycasa.local)"
    }
    try:
        time.sleep(1.0) # Rate limit friendly
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                address = data.get("address", {})
                city_val = address.get("suburb") or address.get("city") or address.get("town") or address.get("village") or address.get("municipality") or address.get("hamlet")
                state_val = address.get("state") or address.get("county") or address.get("state_district")
                country_val = address.get("country")

                parts = [p for p in [city_val, state_val, country_val] if p]
                if parts:
                    loc_name = ", ".join(parts)
                    _GEOCODE_CACHE[cache_key] = loc_name
                    return loc_name
    except Exception as e:
        logger.warning(f"Failed to reverse geocode {lat}, {lon}: {e}")
    return None

class FolderScanService:
    def __init__(self):
        self.active_scans: Dict[str, FolderScanState] = {}
        self.lock = threading.Lock()

    def extract_metadata(self, file_path: str) -> dict:
        metadata = {
            "width": 0,
            "height": 0,
            "date_taken": None,
            "camera_make": None,
            "camera_model": None,
            "lens_model": None,
            "aperture": None,
            "shutter_speed": None,
            "iso": None,
            "focal_length": None,
            "latitude": None,
            "longitude": None,
            "location_name": None,
        }

        if not os.path.exists(file_path):
            return metadata

        try:
            with Image.open(file_path) as img:
                img = ImageOps.exif_transpose(img)
                metadata["width"] = img.width
                metadata["height"] = img.height

                exif = img.getexif()
                if not exif:
                    return metadata

                all_tags = {}
                for k, v in exif.items():
                    name = TAGS.get(k, k)
                    all_tags[name] = v

                # EXIF IFD (Tag 34665 / 0x8769)
                exif_ifd_data = exif.get_ifd(34665)
                if exif_ifd_data:
                    for k, v in exif_ifd_data.items():
                        name = TAGS.get(k, k)
                        all_tags[name] = v

                # Set values
                make = all_tags.get("Make")
                if make:
                    metadata["camera_make"] = str(make).strip()

                model = all_tags.get("Model")
                if model:
                    metadata["camera_model"] = str(model).strip()

                lens_model = all_tags.get("LensModel")
                if lens_model:
                    metadata["lens_model"] = str(lens_model).strip()

                f_number = all_tags.get("FNumber")
                if f_number is not None:
                    try:
                        metadata["aperture"] = f"f/{float(f_number):.1f}"
                    except (ValueError, TypeError):
                        metadata["aperture"] = f"f/{f_number}"

                exposure_time = all_tags.get("ExposureTime")
                if exposure_time is not None:
                    try:
                        exp_val = float(exposure_time)
                        if exp_val > 0:
                            if exp_val < 1.0:
                                den = round(1.0 / exp_val)
                                metadata["shutter_speed"] = f"1/{den} s"
                            else:
                                metadata["shutter_speed"] = f"{exp_val:.1f} s"
                    except Exception:
                        metadata["shutter_speed"] = f"{exposure_time} s"

                iso = all_tags.get("ISOSpeedRatings")
                if iso is not None:
                    try:
                        metadata["iso"] = int(iso)
                    except (ValueError, TypeError):
                        pass

                focal_length = all_tags.get("FocalLength")
                if focal_length is not None:
                    try:
                        metadata["focal_length"] = f"{float(focal_length):.2f} mm"
                    except (ValueError, TypeError):
                        metadata["focal_length"] = f"{focal_length} mm"

                date_str = all_tags.get("DateTimeOriginal") or all_tags.get("DateTime")
                if date_str:
                    date_str = str(date_str).strip()
                    if len(date_str) >= 19 and date_str[4] == ':' and date_str[7] == ':':
                        date_str = date_str[:4] + '-' + date_str[5:7] + '-' + date_str[8:]
                    metadata["date_taken"] = date_str

                # GPS Info (Tag 34853 / 0x8825)
                gps_info = exif.get_ifd(34853)
                if gps_info:
                    gps_data = {}
                    for k, v in gps_info.items():
                        name = GPSTAGS.get(k, k)
                        gps_data[name] = v

                    lat_val = gps_data.get("GPSLatitude")
                    lat_ref = gps_data.get("GPSLatitudeRef")
                    lon_val = gps_data.get("GPSLongitude")
                    lon_ref = gps_data.get("GPSLongitudeRef")

                    dec_lat = _get_gps_decimal(lat_val, lat_ref)
                    dec_lon = _get_gps_decimal(lon_val, lon_ref)

                    if dec_lat is not None and dec_lon is not None:
                        metadata["latitude"] = dec_lat
                        metadata["longitude"] = dec_lon

                        # Reverse Geocode
                        loc_name = reverse_geocode(dec_lat, dec_lon)
                        if loc_name:
                            metadata["location_name"] = loc_name

        except Exception as e:
            logger.warning(f"Error parsing metadata for {file_path}: {e}")

        return metadata

    def get_scan_status(self) -> dict:
        with self.lock:
            if not self.active_scans:
                return {"running": False, "scanned": 0, "total": 0}
            scanned = sum(s.scanned for s in self.active_scans.values())
            total = sum(s.total for s in self.active_scans.values())
            return {"running": True, "scanned": scanned, "total": total}

    def get_scanning_folder_ids(self) -> List[str]:
        with self.lock:
            return list(self.active_scans.keys())

    def is_scanning_folder(self, folder_id: str) -> bool:
        with self.lock:
            return folder_id in self.active_scans

    def trigger_scan(self):
        with get_db() as conn:
            cursor = conn.execute("SELECT id, path, label FROM monitored_folders")
            folders = cursor.fetchall()
        for f in folders:
            self.start_folder_scan(f["id"], f["path"], f["label"])

    def start_folder_scan(self, folder_id: str, path: str, label: str, force: bool = False):
        with self.lock:
            if folder_id in self.active_scans:
                return
            state = FolderScanState(folder_id, label, force)
            self.active_scans[folder_id] = state

        t = threading.Thread(target=self._do_folder_scan, args=(folder_id, path, state), daemon=True)
        t.start()

    def cancel_folder_scan(self, folder_id: str):
        with self.lock:
            if folder_id in self.active_scans:
                self.active_scans[folder_id].cancelled = True

    def _do_folder_scan(self, folder_id: str, path: str, state: FolderScanState):
        try:
            logger.info(f"Starting scan for folder {state.label} ({path})")

            # ── Phase 1: Discover all image files ─────────────────────────────
            files_to_index = []
            for root, dirs, files in os.walk(path):
                if state.cancelled:
                    logger.info(f"Scan cancelled (discovery) for folder {state.label}")
                    return
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in IMAGE_EXTENSIONS:
                        files_to_index.append(os.path.join(root, f))

            state.total = len(files_to_index)
            logger.info(f"Found {state.total} images to index in {state.label}")

            # Persist total to DB so the REST API can expose it immediately
            with get_db() as conn:
                conn.execute(
                    "UPDATE monitored_folders SET total_files = ? WHERE id = ?",
                    (state.total, folder_id)
                )

            # Announce total up-front so the UI progress bar has a denominator
            notification_service.broadcast(
                "scan:folder:started",
                {
                    "message": f"Scanning: {state.label}",
                    "folder_id": folder_id,
                    "folder_label": state.label,
                    "total": state.total,
                    "scanned": 0,
                    "current_file": ""
                }
            )

            # ── Phase 2: Index each file ───────────────────────────────────────
            for f_path in files_to_index:
                if state.cancelled:
                    logger.info(f"Scan cancelled for folder {state.label}")
                    return
                self._index_image(f_path, folder_id, state)
                state.scanned += 1

            self._cleanup_deleted_images(folder_id)
            logger.info(f"Finished scan for folder {state.label}")

            notification_service.broadcast(
                "scan:folder:completed",
                {
                    "message": f"Scan complete: {state.label}",
                    "detail": f"Indexed {state.scanned} images",
                    "folder_id": folder_id,
                    "folder_label": state.label,
                    "total": state.total,
                    "scanned": state.scanned
                }
            )
        except Exception as e:
            logger.exception(f"Scan failed for folder {folder_id}")
            notification_service.broadcast(
                "scan:folder:error",
                {
                    "message": f"Scan error: {state.label}",
                    "detail": str(e),
                    "folder_id": folder_id,
                    "folder_label": state.label
                }
            )
        finally:
            with self.lock:
                self.active_scans.pop(folder_id, None)

    def _index_image(self, file_path: str, folder_id: str, state: FolderScanState):
        try:
            stat = os.stat(file_path)
            file_size = stat.st_size
            modified_at = int(stat.st_mtime * 1000)
            created_at = int(stat.st_ctime * 1000)
            indexed_at = int(time.time() * 1000)

            # Extract EXIF and geocode location
            meta = self.extract_metadata(file_path)

            with get_db() as conn:
                cursor = conn.execute("SELECT id, file_size, modified_at FROM images WHERE file_path = ?", (file_path,))
                existing = cursor.fetchone()

                if existing:
                    if existing["file_size"] == file_size and abs(existing["modified_at"] - modified_at) <= 1000 and not state.force:
                        return # Skip if size and mtime match
                    conn.execute("DELETE FROM images WHERE id = ?", (existing["id"],))

                img_id = "img_" + uuid.uuid4().hex
                conn.execute(
                    """INSERT INTO images (
                        id, file_path, folder_id, file_size, modified_at, created_at, indexed_at, ai_analysed,
                        width, height, date_taken, camera_make, camera_model, lens_model,
                        aperture, shutter_speed, iso, focal_length, latitude, longitude, location_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        img_id, file_path, folder_id, file_size, modified_at, created_at, indexed_at,
                        meta.get("width"), meta.get("height"), meta.get("date_taken"),
                        meta.get("camera_make"), meta.get("camera_model"), meta.get("lens_model"),
                        meta.get("aperture"), meta.get("shutter_speed"), meta.get("iso"), meta.get("focal_length"),
                        meta.get("latitude"), meta.get("longitude"), meta.get("location_name")
                    )
                )

            if not existing:
                log_event("file:indexed", file_path=file_path, details="Discovered and indexed new image during folder scan")

            # Throttle WS updates to 500ms
            now = time.time()
            if now - state.last_broadcast > 0.5:
                state.last_broadcast = now
                filename = os.path.basename(file_path)
                notification_service.broadcast(
                    "scan:folder:progress",
                    {
                        "folder_id": folder_id,
                        "folder_label": state.label,
                        "scanned": state.scanned,
                        "total": state.total,
                        "current_file": filename
                    }
                )
        except Exception as e:
            logger.warning(f"Failed to index image {file_path}: {e}")

    def _cleanup_deleted_images(self, folder_id: str):
        try:
            with get_db() as conn:
                cursor = conn.execute("SELECT id, file_path FROM images WHERE folder_id = ?", (folder_id,))
                db_images = cursor.fetchall()

                deleted_count = 0
                for img in db_images:
                    if not os.path.exists(img["file_path"]):
                        conn.execute("DELETE FROM images WHERE id = ?", (img["id"],))
                        deleted_count += 1

                if deleted_count > 0:
                    logger.info(f"Cleaned up {deleted_count} stale image records for folder {folder_id}")
        except Exception as e:
            logger.warning(f"Cleanup failed for folder {folder_id}: {e}")


scan_service = FolderScanService()


# -------------------------------------------------------------------------
# AI Service
# -------------------------------------------------------------------------
class AiService:
    def __init__(self):
        self.analysing = False
        self.analysed = 0
        self.total = 0
        self.current_status = "idle"
        self.current_file = ""
        self.pause_requested = False
        self.lock = threading.Lock()

    # ── Pause / Resume helpers ──────────────────────────────────────────────

    def _read_paused_from_db(self) -> bool:
        try:
            with get_db() as conn:
                row = conn.execute("SELECT ai_paused FROM app_settings WHERE id = 'settings'").fetchone()
                return bool(row["ai_paused"]) if row else False
        except Exception:
            return False

    def _write_paused_to_db(self, paused: bool):
        try:
            with get_db() as conn:
                conn.execute(
                    "UPDATE app_settings SET ai_paused = ? WHERE id = 'settings'",
                    (1 if paused else 0,)
                )
        except Exception as e:
            logger.warning(f"Failed to persist ai_paused={paused}: {e}")

    def pause(self):
        """Signal the running batch to stop after the current image."""
        self._write_paused_to_db(True)
        with self.lock:
            self.pause_requested = True
            self.current_status = "pausing"
        db_total, db_analysed = self._get_db_stats()
        notification_service.broadcast(
            "ai:paused",
            {
                "message": "AI analysis paused",
                "analysed": self.analysed,
                "total": self.total,
                "db_total": db_total,
                "db_analysed": db_analysed
            }
        )

    def resume(self):
        """Clear the pause flag and restart batch analysis on unprocessed images."""
        self._write_paused_to_db(False)
        with self.lock:
            self.pause_requested = False
            if self.analysing:
                # Already running (shouldn't normally happen), nothing to do
                return
        self.trigger_batch_analysis(rerun=False)

    def get_analysis_status(self) -> dict:
        db_total = 0
        db_analysed = 0
        db_failed = 0
        try:
            with get_db() as conn:
                cursor_total = conn.execute("SELECT COUNT(*) as count FROM images WHERE trashed = 0")
                db_total = cursor_total.fetchone()["count"]
                cursor_analysed = conn.execute("SELECT COUNT(*) as count FROM images WHERE ai_analysed = 1 AND trashed = 0")
                db_analysed = cursor_analysed.fetchone()["count"]
                cursor_failed = conn.execute("SELECT COUNT(*) as count FROM images WHERE ai_failed = 1 AND trashed = 0")
                db_failed = cursor_failed.fetchone()["count"]
        except Exception as e:
            logger.warning(f"Failed to query overall AI stats: {e}")

        paused = self._read_paused_from_db()

        with self.lock:
            return {
                "running": self.analysing,
                "is_running": self.analysing,
                "paused": paused,
                "analysed": self.analysed,
                "processed_files": self.analysed,
                "total": self.total,
                "total_files": self.total,
                "status": self.current_status,
                "current_file": self.current_file,
                "db_total": db_total,
                "db_analysed": db_analysed,
                "db_failed": db_failed
            }

    def _get_db_stats(self) -> tuple:
        try:
            with get_db() as conn:
                total = conn.execute("SELECT COUNT(*) as count FROM images WHERE trashed = 0").fetchone()["count"]
                analysed = conn.execute("SELECT COUNT(*) as count FROM images WHERE ai_analysed = 1 AND trashed = 0").fetchone()["count"]
                failed = conn.execute("SELECT COUNT(*) as count FROM images WHERE ai_failed = 1 AND trashed = 0").fetchone()["count"]
                return total, analysed, failed
        except Exception as e:
            logger.warning(f"Failed to query database stats: {e}")
            return 0, 0, 0

    def trigger_batch_analysis(self, rerun: bool):
        with self.lock:
            if self.analysing:
                return
            self.analysing = True
            self.pause_requested = False
            self.current_status = "running"

        t = threading.Thread(target=self._do_batch_analysis, args=(rerun,), daemon=True)
        t.start()

    def _do_batch_analysis(self, rerun: bool):
        try:
            with get_db() as conn:
                if rerun:
                    cursor = conn.execute("SELECT * FROM images WHERE trashed = 0")
                else:
                    cursor = conn.execute("SELECT * FROM images WHERE ai_analysed = 0 AND trashed = 0")
                images = cursor.fetchall()

            with self.lock:
                self.total = len(images)
                self.analysed = 0

            db_total, db_analysed, db_failed = self._get_db_stats()
            notification_service.broadcast(
                "ai:started",
                {
                    "message": "AI analysis started",
                    "total": len(images),
                    "rerun": rerun,
                    "db_total": db_total,
                    "db_analysed": db_analysed,
                    "db_failed": db_failed
                }
            )

            # Retrieve settings
            with get_db() as conn:
                cursor = conn.execute("SELECT * FROM app_settings WHERE id = 'settings'")
                settings = cursor.fetchone()

            last_progress_broadcast = 0.0

            for img in images:
                # ── Check pause ───────────────────────────────────────────────
                with self.lock:
                    should_pause = self.pause_requested

                if should_pause:
                    logger.info("AI batch analysis paused by user request")
                    with self.lock:
                        self.current_status = "paused"
                    db_total, db_analysed, db_failed = self._get_db_stats()
                    notification_service.broadcast(
                        "ai:paused",
                        {
                            "message": "AI analysis paused",
                            "analysed": self.analysed,
                            "total": self.total,
                            "db_total": db_total,
                            "db_analysed": db_analysed,
                            "db_failed": db_failed
                        }
                    )
                    return  # Exit thread; resume() will start a new one

                file_path = img["file_path"]
                filename = os.path.basename(file_path)

                with self.lock:
                    self.current_file = filename

                try:
                    self.analyse_image(img["id"], file_path, settings)
                except Exception as e:
                    logger.warning(f"Failed to analyse image {file_path}: {e}")
                    try:
                        with get_db() as conn:
                            conn.execute("UPDATE images SET ai_failed = 1, ai_error = ? WHERE id = ?", (str(e), img["id"]))
                    except Exception as db_err:
                        logger.warning(f"Failed to update image error in DB: {db_err}")

                    db_total, db_analysed, db_failed = self._get_db_stats()

                    notification_service.broadcast(
                        "ai:error",
                        {
                            "message": f"Failed: {filename}",
                            "detail": str(e),
                            "db_total": db_total,
                            "db_analysed": db_analysed,
                            "db_failed": db_failed
                        }
                    )

                with self.lock:
                    self.analysed += 1
                    done = self.analysed

                # Throttle progress broadcasts to at most once per second
                now = time.time()
                if now - last_progress_broadcast >= 1.0:
                    last_progress_broadcast = now
                    db_total, db_analysed, db_failed = self._get_db_stats()
                    notification_service.broadcast(
                        "ai:progress",
                        {
                            "analysed": done,
                            "total": self.total,
                            "current_file": filename,
                            "db_total": db_total,
                            "db_analysed": db_analysed,
                            "db_failed": db_failed
                        }
                    )

            with self.lock:
                self.current_status = "completed"
                done = self.analysed

            # Clear the paused flag when we complete naturally
            self._write_paused_to_db(False)

            db_total, db_analysed, db_failed = self._get_db_stats()
            notification_service.broadcast(
                "ai:completed",
                {
                    "message": "AI analysis complete",
                    "analysed": done,
                    "total": self.total,
                    "db_total": db_total,
                    "db_analysed": db_analysed
                }
            )
        except Exception as e:
            with self.lock:
                self.current_status = "error"
            logger.exception("Batch analysis failed")
            notification_service.broadcast(
                "ai:error",
                {
                    "message": "Batch analysis failed",
                    "detail": str(e)
                }
            )
        finally:
            with self.lock:
                self.analysing = False
                self.current_file = ""

    def analyse_image(self, img_id: str, file_path: str, settings: dict):
        if not os.path.exists(file_path):
            return

        active_service = settings["active_ai_service"] or "ollama"
        if active_service == "ollama":
            self._analyse_with_ollama(img_id, file_path, settings)
        else:
            logger.info(f"AI service '{active_service}' not yet implemented, skipping {file_path}")

    def _normalize_url(self, url: Optional[str]) -> str:
        target = (url or "http://localhost:11434").strip()
        if not target:
            target = "http://localhost:11434"
        if not (target.startswith("http://") or target.startswith("https://")):
            target = "http://" + target
        return target.rstrip("/")

    def _analyse_with_ollama(self, img_id: str, file_path: str, settings: dict):
        ollama_url = self._normalize_url(settings["ollama_url"])
        vision_model = settings["vision_model"] or "llava"
        text_model = settings["text_model"] or "llama2"
        timeout_val = float(settings["ollama_timeout"] or 120)

        # --- Call 1: Describe image using vision model ---
        description_prompt = settings["image_analysis_prompt"] or "Describe this image in detail. Focus on the subjects, setting, colors, mood, and any notable elements."

        with Image.open(file_path) as img:
            img = ImageOps.exif_transpose(img)
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=90)
            img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        desc_payload = {
            "model": vision_model,
            "prompt": description_prompt,
            "images": [img_b64],
            "stream": False
        }

        # Make synchronous request with user configured timeout
        r = httpx.post(f"{ollama_url}/api/generate", json=desc_payload, timeout=timeout_val, follow_redirects=True)
        r.raise_for_status()
        description = r.json().get("response", "").strip()

        # --- Call 2: Generate tags from description ---
        tags_prompt = settings["tag_generation_prompt"] or (
            "Given the following image description, extract 5-10 relevant tags. "
            "Return only the tags as a comma-separated list with no additional text or explanation.\n\n"
            f"Description: {description}"
        )
        # If the settings prompt is custom, but does not embed description, we append description
        if settings["tag_generation_prompt"]:
            # If tag_generation_prompt is custom, we will append the description to the custom prompt
            tags_prompt = f"{settings['tag_generation_prompt']}\n\nDescription: {description}"

        tags_payload = {
            "model": text_model,
            "prompt": tags_prompt,
            "stream": False
        }

        r2 = httpx.post(f"{ollama_url}/api/generate", json=tags_payload, timeout=timeout_val, follow_redirects=True)
        r2.raise_for_status()
        tags_response = r2.json().get("response", "").strip()
        tags = self._parse_tags(tags_response)

        # Save to DB
        with get_db() as conn:
            conn.execute(
                "UPDATE images SET description = ?, ai_analysed = 1, ai_failed = 0, ai_error = NULL WHERE id = ?",
                (description, img_id)
            )
            # Clear old tags
            conn.execute("DELETE FROM image_tags WHERE image_id = ?", (img_id,))
            # Insert new tags
            for tag in tags:
                conn.execute(
                    "INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)",
                    (img_id, tag)
                )
        log_event("ai:analysed", file_path=file_path, details=f"Completed AI analysis using vision model '{vision_model}' and text model '{text_model}' (generated description and {len(tags)} tags)")

    def _parse_tags(self, response_text: str) -> List[str]:
        raw = response_text.strip()
        colon_idx = raw.lower().find("tags:")
        if colon_idx >= 0:
            raw = raw[colon_idx + 5:].strip()

        # split by commas or handle JSON arrays if model generated them
        tags = []
        if raw.startswith("[") and raw.endswith("]"):
            try:
                import json
                parsed_list = json.loads(raw)
                if isinstance(parsed_list, list):
                    for item in parsed_list:
                        clean = re.sub(r"[^a-z0-9\s\-]", "", str(item).strip().lower()).strip()
                        if clean:
                            tags.append(clean)
                    return tags
            except Exception:
                pass

        for t in raw.split(","):
            clean = re.sub(r"[^a-z0-9\s\-]", "", t.strip().lower()).strip()
            if clean:
                tags.append(clean)
        return tags

    def ping_ollama(self, url: str) -> bool:
        target = self._normalize_url(url)
        try:
            r = httpx.get(target, timeout=5.0, follow_redirects=True)
            return r.status_code == 200
        except Exception:
            return False

    def list_ollama_models(self, url: str) -> List[str]:
        target = self._normalize_url(url)
        try:
            r = httpx.get(f"{target}/api/tags", timeout=10.0, follow_redirects=True)
            if r.status_code == 200:
                models_list = r.json().get("models", [])
                return [m.get("name") for m in models_list if "name" in m]
            return []
        except Exception:
            return []


ai_service = AiService()


# -------------------------------------------------------------------------
# Helper functions for image analysis & thumbnails
# -------------------------------------------------------------------------
def generate_placeholder_thumbnail(dest: str, label: str):
    size = 300
    img = Image.new("RGB", (size, size), color=(30, 35, 46))
    draw = ImageDraw.Draw(img)

    # Subtle grid pattern
    grid_color = (40, 45, 56)
    for x in range(0, size, 20):
        draw.line([(x, 0), (x, size)], fill=grid_color)
    for y in range(0, size, 20):
        draw.line([(0, y), (size, y)], fill=grid_color)

    # File-type badge background
    badge_w, badge_h = 120, 44
    bx = (size - badge_w) // 2
    by = (size - badge_h) // 2
    draw.rounded_rectangle(
        [bx, by, bx + badge_w, by + badge_h],
        radius=12,
        fill=(60, 65, 80),
        outline=(100, 110, 130)
    )

    # Center Text
    # Pillow load_default has fixed size, but we can draw centered using anchor="mm"
    draw.text((size // 2, size // 2), label, fill=(180, 190, 210), anchor="mm")
    img.save(dest, "JPEG")
