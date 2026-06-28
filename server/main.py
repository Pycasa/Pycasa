import os
import sys
import uuid
import time
import asyncio
import logging
import subprocess
import shutil
from typing import Dict, List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect, Query, BackgroundTasks, Response, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from .database import get_db, init_db, DB_DIR, log_event
from .schemas import (
    LoginRequest, LoginResponse, SessionResponse, AddFolderRequest, FolderResponse,
    ImageRecordResponse, ImageDetailsResponse, UpdateMetadataRequest, AppSettingsSchema,
    NotificationResponse, UserSession, SessionInfo,
    CreateAlbumRequest, UpdateAlbumRequest, AlbumResponse, AddAlbumImagesRequest, RemoveAlbumImagesRequest, AlbumInfo
)
from .services import (
    notification_service, scan_service, ai_service, face_service, generate_placeholder_thumbnail
)

logger = logging.getLogger("pycasa.main")

from .admin import create_admin

app = FastAPI(title="Pycasa API", docs_url="/docs")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SQLAdmin (/db) — mounted at module level so it precedes the
# catch-all Vite proxy route registered at the bottom of this file.
create_admin(app)

# In-memory sessions token -> User
SESSIONS: Dict[str, dict] = {}

# -------------------------------------------------------------------------
# Event Handlers
# -------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    init_db()
    loop = asyncio.get_running_loop()
    notification_service.set_loop(loop)

# -------------------------------------------------------------------------
# Auth Dependency
# -------------------------------------------------------------------------
def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token"
        )
    token = authorization[7:]
    user = SESSIONS.get(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid"
        )
    return user

# Helper to map database rows to schemas
def row_to_image_record(row, tags: List[str] = [], albums: List[dict] = [], faces: List[dict] = []) -> dict:
    keys = row.keys() if hasattr(row, "keys") else []
    print(f"DEBUG row_to_image_record: {row['file_path']} | ai_analysed in DB: {row['ai_analysed']} | ai_failed in DB: {row['ai_failed'] if 'ai_failed' in keys else 'N/A'}")
    return {
        "id": row["id"],
        "file_path": row["file_path"],
        "folder_id": row["folder_id"],
        "description": row["description"],
        "tags": tags,
        "albums": albums or [],
        "faces": faces or [],
        "ocr_text": row["ocr_text"],
        "file_size": row["file_size"],
        "modified_at": row["modified_at"],
        "created_at": row["created_at"],
        "indexed_at": row["indexed_at"],
        "ai_analysed": bool(row["ai_analysed"]),
        "ai_failed": bool(row["ai_failed"]) if "ai_failed" in keys else False,
        "ai_error": row["ai_error"] if "ai_error" in keys else None,
        "face_analysed": bool(row["face_analysed"]) if "face_analysed" in keys else False,
        "face_failed": bool(row["face_failed"]) if "face_failed" in keys else False,
        "face_error": row["face_error"] if "face_error" in keys else None,
        "thumbnail_path": row["thumbnail_path"],
        "favorite": bool(row["favorite"]),
        "trashed": bool(row["trashed"]),
        "type": "image",
        "width": row["width"] if "width" in keys else None,
        "height": row["height"] if "height" in keys else None,
        "date_taken": row["date_taken"] if "date_taken" in keys else None,
        "camera_make": row["camera_make"] if "camera_make" in keys else None,
        "camera_model": row["camera_model"] if "camera_model" in keys else None,
        "lens_model": row["lens_model"] if "lens_model" in keys else None,
        "aperture": row["aperture"] if "aperture" in keys else None,
        "shutter_speed": row["shutter_speed"] if "shutter_speed" in keys else None,
        "iso": row["iso"] if "iso" in keys else None,
        "focal_length": row["focal_length"] if "focal_length" in keys else None,
        "latitude": row["latitude"] if "latitude" in keys else None,
        "longitude": row["longitude"] if "longitude" in keys else None,
        "location_name": row["location_name"] if "location_name" in keys else None,
    }

def get_image_albums(conn, image_id: str) -> List[dict]:
    cursor = conn.execute(
        "SELECT a.id, a.name FROM albums a JOIN album_images ai ON ai.album_id = a.id WHERE ai.image_id = ?",
        (image_id,)
    )
    return [{"id": r["id"], "name": r["name"]} for r in cursor.fetchall()]

# -------------------------------------------------------------------------
# Auth API
# -------------------------------------------------------------------------
@app.post("/api/auth/login", response_model=LoginResponse)
def login(req: LoginRequest):
    from .database import hash_password
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT * FROM users WHERE username = ?", (req.username,)
        )
        user = cursor.fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    computed_hash = hash_password(req.password)
    if user["password_hash"] != computed_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = uuid.uuid4().hex
    user_data = {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"] if user["name"] else user["username"],
        "email": user["email"] if user["email"] else ""
    }
    SESSIONS[token] = user_data

    session_info = {
        "access_token": token,
        "user": user_data
    }

    return {"session": session_info, "user": user_data}

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        SESSIONS.pop(token, None)
    return {"message": "Logged out"}

@app.get("/api/auth/session", response_model=SessionResponse)
def get_session(user: dict = Depends(get_current_user), authorization: Optional[str] = Header(None)):
    token = authorization[7:]
    session_info = {
        "access_token": token,
        "user": user
    }
    return {"session": session_info}

# -------------------------------------------------------------------------
# Health API
# -------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "pycasa"}

# -------------------------------------------------------------------------
# Folders API
# -------------------------------------------------------------------------
@app.get("/api/folders", response_model=List[FolderResponse])
def list_folders():
    folders_res = []
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM monitored_folders")
        folders = cursor.fetchall()
        for f in folders:
            # Count images in monitored folder that are not trashed
            cursor_cnt = conn.execute(
                "SELECT COUNT(*) as cnt FROM images WHERE folder_id = ? AND trashed = 0",
                (f["id"],)
            )
            img_count = cursor_cnt.fetchone()["cnt"]
            folders_res.append({
                "id": f["id"],
                "path": f["path"],
                "label": f["label"],
                "createdAt": f["created_at"],
                "imageCount": img_count
            })
    return folders_res

@app.post("/api/folders", response_model=FolderResponse)
def add_folder(req: AddFolderRequest):
    if not req.path:
        raise HTTPException(status_code=400, detail="path is required")
    if not os.path.exists(req.path) or not os.path.isdir(req.path):
        raise HTTPException(status_code=400, detail="Path does not exist or is not a directory")

    folder_id = "folder_" + uuid.uuid4().hex
    label = req.label if req.label else os.path.basename(req.path.rstrip(os.path.sep))
    created_at = int(time.time() * 1000)

    with get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO monitored_folders (id, path, label, created_at) VALUES (?, ?, ?, ?)",
                (folder_id, req.path, label, created_at)
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Folder already monitored")

    log_event("folder:added", folder_path=req.path, details=f"Added folder monitoring for '{label}'")
    scan_service.start_folder_scan(folder_id, req.path, label)
    return {
        "id": folder_id,
        "path": req.path,
        "label": label,
        "createdAt": created_at,
        "imageCount": 0
    }

@app.get("/api/folders/scanning")
def get_scanning_folders():
    return scan_service.get_scanning_folder_ids()

@app.post("/api/folders/{folder_id}/rescan")
def rescan_folder(folder_id: str):
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM monitored_folders WHERE id = ?", (folder_id,))
        folder = cursor.fetchone()

    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if scan_service.is_scanning_folder(folder_id):
        raise HTTPException(status_code=409, detail="Scan already running for this folder")

    log_event("folder:rescan_triggered", folder_path=folder["path"], details=f"Triggered rescan for '{folder['label']}'")
    scan_service.start_folder_scan(folder_id, folder["path"], folder["label"], force=True)
    return {"message": "Rescan started"}

def run_folder_delete_background(folder_id: str, label: str, path: str):
    try:
        # Cancel active scan first
        scan_service.cancel_folder_scan(folder_id)

        # Count total items for stats
        with get_db() as conn:
            cursor = conn.execute("SELECT COUNT(*) as count FROM images WHERE folder_id = ?", (folder_id,))
            total = cursor.fetchone()["count"]

        # Broadcast deletion start
        notification_service.broadcast(
            "folder-delete:started",
            {
                "message": f"Removing location: {label}",
                "folder_id": folder_id,
                "folder_path": path,
                "total": total
            }
        )

        # Progress deleted counts
        with get_db() as conn:
            cursor = conn.execute("SELECT id, thumbnail_path FROM images WHERE folder_id = ?", (folder_id,))
            images = cursor.fetchall()
            deleted = 0
            for img in images:
                # delete thumbnail file if cached
                if img["thumbnail_path"] and os.path.exists(img["thumbnail_path"]):
                    try:
                        os.remove(img["thumbnail_path"])
                    except Exception:
                        pass
                conn.execute("DELETE FROM images WHERE id = ?", (img["id"],))
                deleted += 1

                # broadcast progress every 5 images
                if deleted % 5 == 0 or deleted == total:
                    notification_service.broadcast(
                        "folder-delete:progress",
                        {
                            "folder_id": folder_id,
                            "deleted": deleted,
                            "total": total
                        }
                    )

            conn.execute("DELETE FROM monitored_folders WHERE id = ?", (folder_id,))

        log_event("folder:removed", folder_path=path, details=f"Removed monitored folder '{label}' (unindexed {total} images)")

        notification_service.broadcast(
            "folder-delete:completed",
            {
                "message": f"Location removed: {label}",
                "folder_id": folder_id,
                "folder_path": path,
                "total": total
            }
        )
    except Exception as e:
        logger.error(f"Failed to delete folder {folder_id}: {e}")
        notification_service.broadcast(
            "folder-delete:error",
            {
                "message": f"Failed to remove: {label}",
                "detail": str(e),
                "folder_id": folder_id
            }
        )

@app.delete("/api/folders/{folder_id}")
def remove_folder(folder_id: str, background_tasks: BackgroundTasks):
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM monitored_folders WHERE id = ?", (folder_id,))
        folder = cursor.fetchone()

    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    background_tasks.add_task(
        run_folder_delete_background, folder_id, folder["label"], folder["path"]
    )
    return {"message": "Folder removal started"}

@app.get("/api/folders/{folder_id}/hierarchy")
def get_hierarchy(folder_id: str):
    with get_db() as conn:
        cursor = conn.execute("SELECT path, label FROM monitored_folders WHERE id = ?", (folder_id,))
        folder = cursor.fetchone()

    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    def build_hierarchy(dir_path: str) -> dict:
        node = {
            "name": os.path.basename(dir_path.rstrip(os.path.sep)),
            "path": dir_path,
            "type": "directory",
            "children": []
        }
        try:
            for entry in sorted(os.scandir(dir_path), key=lambda e: e.name):
                if entry.is_dir() and not entry.name.startswith("."):
                    node["children"].append({
                        "name": entry.name,
                        "path": entry.path,
                        "type": "directory"
                    })
        except Exception:
            pass
        return node

    return build_hierarchy(folder["path"])

@app.get("/api/folders/list")
def list_dir(path: Optional[str] = None):
    target = path if path else os.path.expanduser("~")
    if not os.path.exists(target) or not os.path.isdir(target):
        raise HTTPException(status_code=400, detail="Not a valid directory")

    entries = []
    try:
        for entry in sorted(os.scandir(target), key=lambda e: e.name):
            if entry.is_dir() and not entry.name.startswith("."):
                entries.append({
                    "name": entry.name,
                    "path": entry.path,
                    "type": "directory"
                })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"path": target, "entries": entries}

@app.post("/api/folders/browse")
async def browse():
    async def browse_directory() -> Optional[str]:
        def run_picker():
            if sys.platform == 'darwin':
                applescript = 'POSIX path of (choose folder with prompt "Select Folder")'
                try:
                    proc = subprocess.run(['osascript', '-e', applescript], capture_output=True, text=True, check=True)
                    return proc.stdout.strip()
                except subprocess.CalledProcessError:
                    return None
            elif sys.platform == 'win32':
                ps_cmd = (
                    "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; "
                    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                    "$dialog.Description = 'Select Folder'; "
                    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }"
                )
                try:
                    proc = subprocess.run(['powershell', '-Command', ps_cmd], capture_output=True, text=True, check=True)
                    return proc.stdout.strip()
                except Exception:
                    pass
            # Tkinter fallback
            try:
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk()
                root.withdraw()
                path = filedialog.askdirectory(title="Select Folder")
                root.destroy()
                return path if path else None
            except Exception:
                return None
        return await asyncio.to_thread(run_picker)

    selected_path = await browse_directory()
    if not selected_path:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return {"path": selected_path}

@app.get("/api/folders/trash-path")
def get_trash_path():
    trash_path = os.path.join(DB_DIR, "trash")
    return {"path": trash_path}

@app.post("/api/folders/trash-path")
def update_trash_path():
    return {"message": "Trash path is managed automatically"}


# -------------------------------------------------------------------------
# Images API
# -------------------------------------------------------------------------
@app.get("/api/images", response_model=List[ImageRecordResponse])
def list_images(
    folder_id: Optional[str] = None,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    sort_by: str = "modified_at",
    sort_order: str = "DESC",
    page: int = 1,
    limit: int = 30,
    date_from: Optional[int] = None,
    date_to: Optional[int] = None,
    extensions: Optional[str] = None,
    size_min: Optional[int] = None,
    size_max: Optional[int] = None,
    favorite: Optional[bool] = None,
    trashed: bool = False,
    album_id: Optional[str] = None,
    ai_analysed: Optional[bool] = None,
    ai_failed: Optional[bool] = None,
    face_analysed: Optional[bool] = None,
    face_failed: Optional[bool] = None,
    person: Optional[str] = None,
    face_id: Optional[str] = None
):
    offset = (page - 1) * limit

    # Build SQL query dynamically
    query = "SELECT * FROM images WHERE 1=1"
    params = []

    if folder_id:
        query += " AND folder_id = ?"
        params.append(folder_id)

    if album_id:
        query += " AND id IN (SELECT image_id FROM album_images WHERE album_id = ?)"
        params.append(album_id)

    if search:
        query += " AND (file_path LIKE ? OR description LIKE ?)"
        lk = f"%{search.lower()}%"
        params.extend([lk, lk])

    if date_from:
        query += " AND modified_at >= ?"
        params.append(date_from)

    if date_to:
        query += " AND modified_at <= ?"
        params.append(date_to)

    if size_min is not None:
        query += " AND file_size >= ?"
        params.append(size_min)

    if size_max is not None:
        query += " AND file_size <= ?"
        params.append(size_max)

    if favorite is not None:
        query += " AND favorite = ?"
        params.append(1 if favorite else 0)

    if ai_analysed is not None:
        query += " AND ai_analysed = ?"
        params.append(1 if ai_analysed else 0)

    if ai_failed is not None:
        query += " AND ai_failed = ?"
        params.append(1 if ai_failed else 0)

    if face_analysed is not None:
        query += " AND face_analysed = ?"
        params.append(1 if face_analysed else 0)

    if face_failed is not None:
        query += " AND face_failed = ?"
        params.append(1 if face_failed else 0)

    if person:
        query += " AND id IN (SELECT image_id FROM faces WHERE name = ?)"
        params.append(person)

    if face_id:
        query += " AND id IN (SELECT image_id FROM faces WHERE id = ?)"
        params.append(face_id)

    # Trashed
    query += " AND trashed = ?"
    params.append(1 if trashed else 0)

    # Multi-tag filter
    if tags:
        tag_list = [t.strip().lower() for t in tags.split(",") if t.strip()]
        for t in tag_list:
            query += " AND id IN (SELECT image_id FROM image_tags WHERE tag = ?)"
            params.append(t)

    # Extension filter
    if extensions:
        ext_list = [e.strip().lower() for e in extensions.split(",") if e.strip()]
        # Add period if not present
        ext_list = [e if e.startswith(".") else f".{e}" for e in ext_list]
        # Filter using LIKE OR conditions
        or_conds = []
        for ext in ext_list:
            or_conds.append("file_path LIKE ?")
            params.append(f"%{ext}")
        if or_conds:
            query += f" AND ({' OR '.join(or_conds)})"

    # Sorting
    col = {
        "created_at": "created_at",
        "size": "file_size",
        "file_path": "file_path"
    }.get(sort_by, "modified_at")

    order = "ASC" if sort_order.upper() == "ASC" else "DESC"
    query += f" ORDER BY {col} {order} LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    images_res = []
    with get_db() as conn:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
        for row in rows:
            # Query tags for each image
            cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (row["id"],))
            img_tags = [t["tag"] for t in cursor_tags.fetchall()]
            # Query albums for each image
            cursor_albums = conn.execute(
                "SELECT a.id, a.name FROM albums a JOIN album_images ai ON ai.album_id = a.id WHERE ai.image_id = ?",
                (row["id"],)
            )
            img_albums = [{"id": r["id"], "name": r["name"]} for r in cursor_albums.fetchall()]
            # Query faces for each image
            cursor_faces = conn.execute(
                "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
                (row["id"],)
            )
            img_faces = [dict(f) for f in cursor_faces.fetchall()]
            images_res.append(row_to_image_record(row, img_tags, img_albums, img_faces))

    return images_res

@app.get("/api/images/geolocated")
def list_geolocated_images(limit: int = 5000):
    """Return all images that have GPS coordinates, for the Places map view."""
    with get_db() as conn:
        cursor = conn.execute(
            """SELECT id, file_path, latitude, longitude, location_name, date_taken
               FROM images
               WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                 AND trashed = 0
               ORDER BY date_taken DESC NULLS LAST
               LIMIT ?""",
            (limit,)
        )
        rows = cursor.fetchall()
    return [
        {
            "id": r["id"],
            "file_path": r["file_path"],
            "lat": r["latitude"],
            "lng": r["longitude"],
            "location_name": r["location_name"],
            "date_taken": r["date_taken"],
        }
        for r in rows
    ]

@app.get("/api/images/tags")
def get_tags():
    with get_db() as conn:
        cursor = conn.execute("SELECT DISTINCT tag FROM image_tags ORDER BY tag ASC")
        return [r["tag"] for r in cursor.fetchall()]

@app.get("/api/images/favorites", response_model=List[ImageRecordResponse])
def list_favorites(page: int = 1, limit: int = 50):
    return list_images(favorite=True, page=page, limit=limit)

@app.post("/api/images/{image_id}/favorite", response_model=ImageRecordResponse)
def toggle_favorite(image_id: str):
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,))
        img = cursor.fetchone()
        if not img:
            raise HTTPException(status_code=404, detail="Image not found")
        new_fav = 0 if img["favorite"] else 1
        conn.execute("UPDATE images SET favorite = ? WHERE id = ?", (new_fav, image_id))

        # Reload updated record
        cursor = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,))
        updated = cursor.fetchone()
        cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (image_id,))
        tags = [t["tag"] for t in cursor_tags.fetchall()]
        albums = get_image_albums(conn, image_id)
        # Query faces
        cursor_faces = conn.execute(
            "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
            (image_id,)
        )
        faces = [dict(f) for f in cursor_faces.fetchall()]

    event_type = "file:favorited" if new_fav == 1 else "file:unfavorited"
    log_event(event_type, file_path=img["file_path"], details="Marked image as favorite" if new_fav == 1 else "Removed image from favorites")

    return row_to_image_record(updated, tags, albums, faces)

@app.get("/api/images/metadata")
def get_metadata(
    path: Optional[str] = None,
    id: Optional[str] = None,
    folder_id: Optional[str] = None,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    date_from: Optional[int] = None,
    date_to: Optional[int] = None,
    extensions: Optional[str] = None,
    size_min: Optional[int] = None,
    size_max: Optional[int] = None,
    favorite: Optional[bool] = None,
    ai_analysed: Optional[bool] = None,
    ai_failed: Optional[bool] = None,
    face_analysed: Optional[bool] = None,
    face_failed: Optional[bool] = None,
    person: Optional[str] = None,
    face_id: Optional[str] = None
):
    if not path and not id:
        # Date counts aggregation with filters
        query = "SELECT modified_at FROM images WHERE 1=1"
        params = []

        if folder_id:
            query += " AND folder_id = ?"
            params.append(folder_id)

        if search:
            query += " AND (file_path LIKE ? OR description LIKE ?)"
            lk = f"%{search.lower()}%"
            params.extend([lk, lk])

        if date_from:
            query += " AND modified_at >= ?"
            params.append(date_from)

        if date_to:
            query += " AND modified_at <= ?"
            params.append(date_to)

        if size_min is not None:
            query += " AND file_size >= ?"
            params.append(size_min)

        if size_max is not None:
            query += " AND file_size <= ?"
            params.append(size_max)

        if favorite is not None:
            query += " AND favorite = ?"
            params.append(1 if favorite else 0)

        if ai_analysed is not None:
            query += " AND ai_analysed = ?"
            params.append(1 if ai_analysed else 0)

        if ai_failed is not None:
            query += " AND ai_failed = ?"
            params.append(1 if ai_failed else 0)

        if face_analysed is not None:
            query += " AND face_analysed = ?"
            params.append(1 if face_analysed else 0)

        if face_failed is not None:
            query += " AND face_failed = ?"
            params.append(1 if face_failed else 0)

        if person:
            query += " AND id IN (SELECT image_id FROM faces WHERE name = ?)"
            params.append(person)

        if face_id:
            query += " AND id IN (SELECT image_id FROM faces WHERE id = ?)"
            params.append(face_id)

        # Trashed is always 0 for active timeline
        query += " AND trashed = 0"

        # Multi-tag filter
        if tags:
            tag_list = [t.strip().lower() for t in tags.split(",") if t.strip()]
            for t in tag_list:
                query += " AND id IN (SELECT image_id FROM image_tags WHERE tag = ?)"
                params.append(t)

        # Extension filter
        if extensions:
            ext_list = [e.strip().lower() for e in extensions.split(",") if e.strip()]
            ext_list = [e if e.startswith(".") else f".{e}" for e in ext_list]
            or_conds = []
            for ext in ext_list:
                or_conds.append("file_path LIKE ?")
                params.append(f"%{ext}")
            if or_conds:
                query += f" AND ({' OR '.join(or_conds)})"

        counts = {}
        with get_db() as conn:
            cursor = conn.execute(query, params)
            for row in cursor.fetchall():
                mtime = row["modified_at"]
                if mtime > 0:
                    # Convert ms to date
                    date_str = time.strftime("%Y-%m-%d", time.localtime(mtime / 1000))
                    counts[date_str] = counts.get(date_str, 0) + 1
        # Sort in reverse chronological order
        sorted_counts = dict(sorted(counts.items(), reverse=True))
        return sorted_counts

    with get_db() as conn:
        if id:
            cursor = conn.execute("SELECT * FROM images WHERE id = ?", (id,))
        else:
            cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (path,))
        img = cursor.fetchone()

        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (img["id"],))
        tags = [t["tag"] for t in cursor_tags.fetchall()]
        albums = get_image_albums(conn, img["id"])
        # Query faces
        cursor_faces = conn.execute(
            "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
            (img["id"],)
        )
        faces = [dict(f) for f in cursor_faces.fetchall()]

    return row_to_image_record(img, tags, albums, faces)

@app.get("/api/images/details", response_model=ImageDetailsResponse)
def get_details(path: str):
    if not path:
        raise HTTPException(status_code=400, detail="path is required")

    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (path,))
        img = cursor.fetchone()
        if not img:
            raise HTTPException(status_code=404, detail="Image not found")
        cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (img["id"],))
        tags = [t["tag"] for t in cursor_tags.fetchall()]
        albums = get_image_albums(conn, img["id"])
        # Query faces
        cursor_faces = conn.execute(
            "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
            (img["id"],)
        )
        faces = [dict(f) for f in cursor_faces.fetchall()]

    record = row_to_image_record(img, tags, albums, faces)

    # Fallback to dynamic read if DB lacks dimensions
    if not record.get("width") or not record.get("height"):
        if os.path.exists(path):
            try:
                with Image.open(path) as pil_img:
                    record["width"], record["height"] = pil_img.size
            except Exception:
                pass

    return record

@app.patch("/api/images/metadata", response_model=ImageRecordResponse)
def update_metadata(req: UpdateMetadataRequest):
    img_id = req.id
    file_path = req.file_path

    details_parts = []
    with get_db() as conn:
        if img_id:
            cursor = conn.execute("SELECT * FROM images WHERE id = ?", (img_id,))
        else:
            cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (file_path,))
        img = cursor.fetchone()

        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        target_id = img["id"]
        target_path = img["file_path"]

        if req.description is not None:
            conn.execute("UPDATE images SET description = ? WHERE id = ?", (req.description, target_id))
            details_parts.append(f"description updated")

        if req.favorite is not None:
            conn.execute("UPDATE images SET favorite = ? WHERE id = ?", (1 if req.favorite else 0, target_id))
            details_parts.append("favorite toggled")

        if req.tags is not None:
            # Clear old and write new
            conn.execute("DELETE FROM image_tags WHERE image_id = ?", (target_id,))
            for tag in req.tags:
                conn.execute(
                    "INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)",
                    (target_id, tag.strip().lower())
                )
            details_parts.append(f"tags updated to {req.tags}")

        # Reload updated record
        cursor = conn.execute("SELECT * FROM images WHERE id = ?", (target_id,))
        updated = cursor.fetchone()
        cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (target_id,))
        tags = [t["tag"] for t in cursor_tags.fetchall()]
        albums = get_image_albums(conn, target_id)
        # Query faces
        cursor_faces = conn.execute(
            "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
            (target_id,)
        )
        faces = [dict(f) for f in cursor_faces.fetchall()]

    if details_parts:
        log_event("metadata:updated", file_path=target_path, details=", ".join(details_parts))

    return row_to_image_record(updated, tags, albums, faces)

@app.delete("/api/images")
def delete_image(folder_id: str, path: str):
    if not path:
        raise HTTPException(status_code=400, detail="path is required")

    event_type = None
    event_details = None
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (path,))
        img = cursor.fetchone()

        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        if img["trashed"]:
            # Permanent delete
            try:
                if os.path.exists(img["file_path"]):
                    os.remove(img["file_path"])
                if img["thumbnail_path"] and os.path.exists(img["thumbnail_path"]):
                    os.remove(img["thumbnail_path"])
            except Exception as e:
                logger.warning(f"Could not permanently delete files: {e}")
            conn.execute("DELETE FROM images WHERE id = ?", (img["id"],))
            event_type = "file:deleted"
            event_details = "Permanently deleted image file and database record"
        else:
            # Soft delete: move to trash folder
            trash_dir = os.path.join(DB_DIR, "trash")
            os.makedirs(trash_dir, exist_ok=True)
            src_file = img["file_path"]
            dest_name = os.path.basename(src_file)
            dest_file = os.path.join(trash_dir, dest_name)
            if os.path.exists(dest_file):
                dest_file = os.path.join(trash_dir, f"{int(time.time() * 1000)}_{dest_name}")

            new_path = src_file
            try:
                shutil.move(src_file, dest_file)
                new_path = os.path.abspath(dest_file)
            except Exception as e:
                logger.warning(f"Could not move image to trash: {e}")

            conn.execute(
                "UPDATE images SET file_path = ?, trashed = 1, favorite = 0 WHERE id = ?",
                (new_path, img["id"])
            )
            event_type = "file:trashed"
            event_details = f"Moved image to trash: {new_path}"

    if event_type:
        log_event(event_type, file_path=path, details=event_details)

    if event_type == "file:deleted":
        return {"message": "Image permanently deleted"}
    else:
        return {"message": "Image moved to trash"}

@app.post("/api/images/{image_id}/restore", response_model=ImageRecordResponse)
def restore_image(image_id: str):
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,))
        img = cursor.fetchone()

        if not img:
            raise HTTPException(status_code=404, detail="Image not found")
        if not img["trashed"]:
            raise HTTPException(status_code=400, detail="Image is not in trash")

        cursor_folder = conn.execute(
            "SELECT path FROM monitored_folders WHERE id = ?", (img["folder_id"],)
        )
        folder = cursor_folder.fetchone()

        new_path = img["file_path"]
        if folder:
            try:
                os.makedirs(folder["path"], exist_ok=True)
                # Strip out timestamp prefix if added
                raw_name = os.path.basename(img["file_path"])
                raw_name = re.sub(r"^\d+_", "", raw_name)
                dest_file = os.path.join(folder["path"], raw_name)
                shutil.move(img["file_path"], dest_file)
                new_path = os.path.abspath(dest_file)
            except Exception as e:
                logger.warning(f"Could not restore image file: {e}")

        conn.execute(
            "UPDATE images SET file_path = ?, trashed = 0 WHERE id = ?",
            (new_path, image_id)
        )

        cursor = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,))
        updated = cursor.fetchone()
        cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (image_id,))
        tags = [t["tag"] for t in cursor_tags.fetchall()]
        albums = get_image_albums(conn, image_id)
        # Query faces
        cursor_faces = conn.execute(
            "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
            (image_id,)
        )
        faces = [dict(f) for f in cursor_faces.fetchall()]

    log_event("file:restored", file_path=new_path, details=f"Restored image from trash to {new_path}")
    return row_to_image_record(updated, tags, albums, faces)

@app.get("/api/images/scan-status")
def get_scan_status():
    status_info = scan_service.get_scan_status()
    return {
        "running": status_info["running"],
        "is_scanning": status_info["running"],
        "scanned": status_info["scanned"],
        "total": status_info["total"],
        "files_found": status_info["scanned"]
    }

@app.post("/api/images/scan")
def trigger_scan():
    scan_service.trigger_scan()
    return {"message": "Scan triggered"}

@app.get("/api/images/raw")
def get_raw_image(path: str):
    if not path or not os.path.exists(path) or not os.path.isfile(path):
        raise HTTPException(status_code=404)
    # Add cache headers
    return FileResponse(path, headers={"Cache-Control": "max-age=86400"})

@app.get("/api/images/thumbnail")
def get_thumbnail(path: str):
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404)

    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (path,))
        img_record = cursor.fetchone()

    thumb_file = None
    if img_record:
        if img_record["thumbnail_path"]:
            thumb_file = img_record["thumbnail_path"]

        # Self-healing: check if file on disk has changed compared to DB
        if os.path.exists(path):
            actual_size = os.path.getsize(path)
            actual_mtime = int(os.path.getmtime(path) * 1000)
            if actual_size != img_record["file_size"] or abs(actual_mtime - img_record["modified_at"]) > 1000:
                logger.info(f"Detected modified file {path}. Resetting metadata and regenerating thumbnail.")
                if thumb_file and os.path.exists(thumb_file):
                    try:
                        os.remove(thumb_file)
                    except Exception as ex:
                        logger.warning(f"Failed to remove stale thumbnail: {ex}")
                thumb_file = None

                # Update DB record
                with get_db() as conn:
                    conn.execute(
                        "UPDATE images SET file_size = ?, modified_at = ?, ai_analysed = 0, ai_failed = 0, ai_error = NULL, description = NULL WHERE id = ?",
                        (actual_size, actual_mtime, img_record["id"])
                    )
                    # Clear tags
                    conn.execute("DELETE FROM image_tags WHERE image_id = ?", (img_record["id"],))

                # Re-fetch updated record
                with get_db() as conn:
                    cursor = conn.execute("SELECT * FROM images WHERE id = ?", (img_record["id"],))
                    img_record = cursor.fetchone()

    if not thumb_file or not os.path.exists(thumb_file):
        thumbs_dir = os.path.join(DB_DIR, "thumbs")
        os.makedirs(thumbs_dir, exist_ok=True)
        img_id = img_record["id"] if img_record else uuid.uuid4().hex
        thumb_name = f"{img_id}_thumb.jpg"
        thumb_file = os.path.join(thumbs_dir, thumb_name)

        if not os.path.exists(thumb_file):
            try:
                with Image.open(path) as pil_img:
                    pil_img = ImageOps.exif_transpose(pil_img)
                    pil_img.thumbnail((300, 300))
                    if pil_img.mode in ("RGBA", "P"):
                        pil_img = pil_img.convert("RGB")
                    pil_img.save(thumb_file, "JPEG")
            except Exception as decode_ex:
                logger.debug(f"Cannot decode {path} for thumbnail ({decode_ex}), generating placeholder")
                ext = os.path.splitext(path)[1].lstrip(".").upper()
                if not ext:
                    ext = "IMG"
                generate_placeholder_thumbnail(thumb_file, ext)

        if img_record and os.path.exists(thumb_file):
            with get_db() as conn:
                conn.execute(
                    "UPDATE images SET thumbnail_path = ? WHERE id = ?",
                    (thumb_file, img_record["id"])
                )

    return FileResponse(thumb_file, media_type="image/jpeg")


@app.post("/api/images/upload")
async def upload_images(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None
):
    upload_path = None
    with get_db() as conn:
        cursor = conn.execute("SELECT upload_path FROM app_settings WHERE id = 'settings'")
        row = cursor.fetchone()
        if row:
            upload_path = row["upload_path"]

    if not upload_path:
        upload_path = os.path.expanduser("~/.pycasa/uploads")

    os.makedirs(upload_path, exist_ok=True)

    saved_files = []
    indexed_count = 0

    for file in files:
        if not file.filename:
            continue

        file_path = os.path.join(upload_path, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        try:
            stat = os.stat(file_path)
            file_size = stat.st_size
            modified_at = int(stat.st_mtime * 1000)
            created_at = int(stat.st_ctime * 1000)
            indexed_at = int(time.time() * 1000)

            # Extract metadata from the uploaded image file
            meta = await asyncio.to_thread(scan_service.extract_metadata, file_path)

            with get_db() as conn:
                cursor = conn.execute("SELECT id FROM images WHERE file_path = ?", (file_path,))
                existing = cursor.fetchone()

                if existing:
                    img_id = existing["id"]
                    conn.execute(
                        """UPDATE images SET
                            file_size = ?, modified_at = ?, indexed_at = ?,
                            width = ?, height = ?, date_taken = ?,
                            camera_make = ?, camera_model = ?, lens_model = ?,
                            aperture = ?, shutter_speed = ?, iso = ?, focal_length = ?,
                            latitude = ?, longitude = ?, location_name = ?
                        WHERE id = ?""",
                        (
                            file_size, modified_at, indexed_at,
                            meta.get("width"), meta.get("height"), meta.get("date_taken"),
                            meta.get("camera_make"), meta.get("camera_model"), meta.get("lens_model"),
                            meta.get("aperture"), meta.get("shutter_speed"), meta.get("iso"), meta.get("focal_length"),
                            meta.get("latitude"), meta.get("longitude"), meta.get("location_name"),
                            img_id
                        )
                    )
                else:
                    img_id = "img_" + uuid.uuid4().hex
                    conn.execute(
                        """INSERT INTO images (
                            id, file_path, folder_id, file_size, modified_at, created_at, indexed_at, ai_analysed,
                            width, height, date_taken, camera_make, camera_model, lens_model,
                            aperture, shutter_speed, iso, focal_length, latitude, longitude, location_name
                        ) VALUES (?, ?, 'uploads', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            img_id, file_path, file_size, modified_at, created_at, indexed_at,
                            meta.get("width"), meta.get("height"), meta.get("date_taken"),
                            meta.get("camera_make"), meta.get("camera_model"), meta.get("lens_model"),
                            meta.get("aperture"), meta.get("shutter_speed"), meta.get("iso"), meta.get("focal_length"),
                            meta.get("latitude"), meta.get("longitude"), meta.get("location_name")
                        )
                    )

            saved_files.append({"id": img_id, "path": file_path})
            indexed_count += 1
            log_event("file:uploaded", file_path=file_path, details=f"Uploaded and indexed image file: {file.filename}")

            if background_tasks:
                with get_db() as conn:
                    cursor_settings = conn.execute("SELECT * FROM app_settings WHERE id = 'settings'")
                    settings = cursor_settings.fetchone()
                    if settings:
                        settings_dict = dict(settings)
                        background_tasks.add_task(
                            ai_service.analyse_image, img_id, file_path, settings_dict
                        )
                        background_tasks.add_task(
                            face_service.detect_faces_in_image, img_id, file_path
                        )
        except Exception as e:
            logger.warning(f"Failed to index uploaded file {file.filename}: {e}")

    notification_service.broadcast(
        "scan:completed",
        {"total": indexed_count}
    )

    return {"message": f"Successfully uploaded and indexed {indexed_count} files", "files": saved_files}


# -------------------------------------------------------------------------
# Settings API
# -------------------------------------------------------------------------
@app.get("/api/settings", response_model=AppSettingsSchema)
def get_settings():
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM app_settings WHERE id = 'settings'")
        settings = cursor.fetchone()
        if not settings:
            default_settings = AppSettingsSchema().dict()
            default_settings["upload_path"] = os.path.expanduser("~/.pycasa/uploads")
            return default_settings

        data = dict(settings)
        if not data.get("upload_path"):
            data["upload_path"] = os.path.expanduser("~/.pycasa/uploads")
        return data

@app.post("/api/settings", response_model=AppSettingsSchema)
def update_settings(req: AppSettingsSchema):
    fields = []
    params = []
    for k, v in req.dict(exclude_unset=True).items():
        fields.append(f"{k} = ?")
        params.append(v)

    if not fields:
        return get_settings()

    params.append("settings")
    query = f"UPDATE app_settings SET {', '.join(fields)} WHERE id = ?"
    with get_db() as conn:
        conn.execute(query, params)

    log_event("settings:updated", details=f"Updated application settings: {', '.join(req.dict(exclude_unset=True).keys())}")
    return get_settings()

# -------------------------------------------------------------------------
# Notifications API
# -------------------------------------------------------------------------
@app.get("/api/notifications", response_model=List[NotificationResponse])
def list_notifications(search: Optional[str] = None, event_type: Optional[str] = None):
    query = "SELECT * FROM notifications WHERE 1=1"
    params = []

    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)

    if search:
        query += " AND (message LIKE ? OR detail LIKE ? OR event_type LIKE ?)"
        lk = f"%{search.lower()}%"
        params.extend([lk, lk, lk])

    query += " ORDER BY ts DESC"
    with get_db() as conn:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

@app.get("/api/notifications/unread-count")
def unread_count():
    with get_db() as conn:
        cursor = conn.execute("SELECT COUNT(*) as count FROM notifications WHERE read = 0")
        return cursor.fetchone()["count"]

@app.patch("/api/notifications/{notif_id}/read", response_model=NotificationResponse)
def mark_read(notif_id: str):
    with get_db() as conn:
        conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", (notif_id,))
        cursor = conn.execute("SELECT * FROM notifications WHERE id = ?", (notif_id,))
        notif = cursor.fetchone()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return dict(notif)

@app.post("/api/notifications/mark-all-read")
def mark_all_read():
    with get_db() as conn:
        conn.execute("UPDATE notifications SET read = 1 WHERE read = 0")
    return {"message": "All marked read"}

@app.delete("/api/notifications/{notif_id}")
def delete_notification(notif_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM notifications WHERE id = ?", (notif_id,))
    return {"message": "Deleted"}

@app.delete("/api/notifications")
def delete_all_notifications():
    with get_db() as conn:
        conn.execute("DELETE FROM notifications")
    return {"message": "All deleted"}

# -------------------------------------------------------------------------
# Defaults API
# -------------------------------------------------------------------------
@app.get("/api/defaults/prompts")
def get_defaults():
    return {
        "image_analysis_prompt": "Analyze the provided image in comprehensive visual detail.",
        "tag_generation_prompt": 'Based on the following image description, generate a concise list of relevant tags. Return only a JSON array of lowercase strings, with no explanation. Example: ["outdoor","sunset","landscape","nature"]'
    }

# -------------------------------------------------------------------------
# AI API
# -------------------------------------------------------------------------
@app.get("/api/ai/analysis-status")
def get_analysis_status():
    return ai_service.get_analysis_status()

@app.post("/api/ai/batch-analyse")
def batch_analyse(body: dict):
    rerun = body.get("rerun", False)
    ai_service.trigger_batch_analysis(rerun)
    return {"message": "Batch analysis triggered"}

@app.post("/api/ai/pause")
def pause_ai():
    ai_service.pause()
    return {"message": "AI analysis pause requested", **ai_service.get_analysis_status()}

@app.post("/api/ai/resume")
def resume_ai():
    ai_service.resume()
    return {"message": "AI analysis resumed", **ai_service.get_analysis_status()}

@app.post("/api/ai/analyse", response_model=ImageRecordResponse)
def analyse_image_endpoint(body: dict):
    image_path = body.get("image_path")
    if not image_path:
        raise HTTPException(status_code=400, detail="image_path is required")

    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (image_path,))
        img = cursor.fetchone()
        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        cursor_settings = conn.execute("SELECT * FROM app_settings WHERE id = 'settings'")
        settings = cursor_settings.fetchone()
        if not settings:
            settings = {}

    try:
        ai_service.analyse_image(img["id"], image_path, settings)
        # Reload
        with get_db() as conn:
            cursor = conn.execute("SELECT * FROM images WHERE id = ?", (img["id"],))
            updated = cursor.fetchone()
            cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (img["id"],))
            tags = [t["tag"] for t in cursor_tags.fetchall()]
            cursor_faces = conn.execute(
                "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
                (img["id"],)
            )
            faces = [dict(f) for f in cursor_faces.fetchall()]
        return row_to_image_record(updated, tags, faces=faces)
    except Exception as e:
        try:
            with get_db() as conn:
                conn.execute("UPDATE images SET ai_failed = 1, ai_error = ? WHERE id = ?", (str(e), img["id"]))
        except Exception as db_err:
            logger.warning(f"Failed to update image error in DB: {db_err}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/face/detection-status")
def get_face_detection_status():
    return face_service.get_detection_status()

@app.post("/api/face/batch-detect")
def batch_detect_faces(body: dict):
    rerun = body.get("rerun", False)
    face_service.trigger_batch_detection(rerun)
    return {"message": "Batch face detection triggered"}

@app.post("/api/face/pause")
def pause_face_detection():
    face_service.pause()
    return {"message": "Face detection pause requested", **face_service.get_detection_status()}

@app.post("/api/face/resume")
def resume_face_detection():
    face_service.resume()
    return {"message": "Face detection resumed", **face_service.get_detection_status()}

@app.post("/api/face/detect", response_model=ImageRecordResponse)
def detect_image_faces_endpoint(body: dict):
    image_path = body.get("image_path")
    if not image_path:
        raise HTTPException(status_code=400, detail="image_path is required")

    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM images WHERE file_path = ?", (image_path,))
        img = cursor.fetchone()
        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

    try:
        face_service.detect_faces_in_image(img["id"], image_path)
        # Reload
        with get_db() as conn:
            cursor = conn.execute("SELECT * FROM images WHERE id = ?", (img["id"],))
            updated = cursor.fetchone()
            cursor_tags = conn.execute("SELECT tag FROM image_tags WHERE image_id = ?", (img["id"],))
            tags = [t["tag"] for t in cursor_tags.fetchall()]
            cursor_faces = conn.execute(
                "SELECT id, name, box_top, box_right, box_bottom, box_left FROM faces WHERE image_id = ?",
                (img["id"],)
            )
            faces = [dict(f) for f in cursor_faces.fetchall()]
        return row_to_image_record(updated, tags, faces=faces)
    except Exception as e:
        try:
            with get_db() as conn:
                conn.execute("UPDATE images SET face_failed = 1, face_error = ? WHERE id = ?", (str(e), img["id"]))
        except Exception as db_err:
            logger.warning(f"Failed to update image error in DB: {db_err}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/faces")
def list_faces():
    with get_db() as conn:
        cursor = conn.execute(
            """SELECT f.*, i.file_path FROM faces f
               JOIN images i ON f.image_id = i.id
               ORDER BY CASE WHEN f.name IS NULL OR f.name = '' THEN 1 ELSE 0 END ASC,
                        f.name ASC,
                        f.id DESC"""
        )
        return [dict(row) for row in cursor.fetchall()]

@app.patch("/api/faces/{face_id}")
def update_face_name(face_id: str, body: dict):
    name = body.get("name")
    with get_db() as conn:
        row = conn.execute("SELECT name FROM faces WHERE id = ?", (face_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Face not found")

        old_name = row["name"]
        if old_name and old_name.strip():
            conn.execute("UPDATE faces SET name = ? WHERE name = ?", (name, old_name))
        else:
            conn.execute("UPDATE faces SET name = ? WHERE id = ?", (name, face_id))
    return {"message": "Face name updated successfully"}

@app.get("/api/faces/{face_id}/thumbnail")
def get_face_thumbnail(face_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT thumbnail_path FROM faces WHERE id = ?", (face_id,)).fetchone()
    if not row or not row["thumbnail_path"] or not os.path.exists(row["thumbnail_path"]):
        raise HTTPException(status_code=404, detail="Face thumbnail not found")
    return FileResponse(row["thumbnail_path"], media_type="image/jpeg")

@app.get("/api/ai/models")
def list_models(url: Optional[str] = None):
    return ai_service.list_ollama_models(url)

@app.post("/api/ai/ping")
def ping_ai(body: dict):
    url = body.get("url")
    return ai_service.ping_ollama(url)

# -------------------------------------------------------------------------
# Albums API
# -------------------------------------------------------------------------
@app.get("/api/albums", response_model=List[AlbumResponse])
def list_albums():
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT a.id, a.name, a.description, a.created_at,
                   (SELECT COUNT(*) FROM album_images WHERE album_id = a.id) as image_count,
                   (SELECT i.thumbnail_path FROM images i
                    JOIN album_images ai ON ai.image_id = i.id
                    WHERE ai.album_id = a.id AND i.trashed = 0
                    ORDER BY i.modified_at DESC LIMIT 1) as cover_image_thumbnail
            FROM albums a
            ORDER BY a.name ASC
        """)
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r["description"],
                "created_at": r["created_at"],
                "image_count": r["image_count"],
                "cover_image_thumbnail": r["cover_image_thumbnail"]
            } for r in rows
        ]

@app.post("/api/albums", response_model=AlbumResponse)
def create_album(req: CreateAlbumRequest):
    import sqlite3
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Album name cannot be empty")

    album_id = "album_" + uuid.uuid4().hex
    created_at = int(time.time() * 1000)

    with get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO albums (id, name, description, created_at) VALUES (?, ?, ?, ?)",
                (album_id, req.name.strip(), req.description.strip() if req.description else None, created_at)
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="An album with this name already exists")

    return {
        "id": album_id,
        "name": req.name.strip(),
        "description": req.description.strip() if req.description else None,
        "created_at": created_at,
        "image_count": 0,
        "cover_image_thumbnail": None
    }

@app.patch("/api/albums/{album_id}", response_model=AlbumResponse)
def update_album(album_id: str, req: UpdateAlbumRequest):
    import sqlite3
    with get_db() as conn:
        cursor = conn.execute("SELECT * FROM albums WHERE id = ?", (album_id,))
        album = cursor.fetchone()
        if not album:
            raise HTTPException(status_code=404, detail="Album not found")

        updates = []
        params = []
        if req.name is not None:
            if not req.name.strip():
                raise HTTPException(status_code=400, detail="Album name cannot be empty")
            updates.append("name = ?")
            params.append(req.name.strip())
        if req.description is not None:
            updates.append("description = ?")
            params.append(req.description.strip() if req.description.strip() else None)

        if updates:
            params.append(album_id)
            try:
                conn.execute(
                    f"UPDATE albums SET {', '.join(updates)} WHERE id = ?",
                    tuple(params)
                )
            except sqlite3.IntegrityError:
                raise HTTPException(status_code=400, detail="An album with this name already exists")

        # Reload
        cursor = conn.execute("""
            SELECT a.id, a.name, a.description, a.created_at,
                   (SELECT COUNT(*) FROM album_images WHERE album_id = a.id) as image_count,
                   (SELECT i.thumbnail_path FROM images i
                    JOIN album_images ai ON ai.image_id = i.id
                    WHERE ai.album_id = a.id AND i.trashed = 0
                    ORDER BY i.modified_at DESC LIMIT 1) as cover_image_thumbnail
            FROM albums a
            WHERE a.id = ?
        """, (album_id,))
        r = cursor.fetchone()
        return {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "created_at": r["created_at"],
            "image_count": r["image_count"],
            "cover_image_thumbnail": r["cover_image_thumbnail"]
        }

@app.delete("/api/albums/{album_id}")
def delete_album(album_id: str):
    with get_db() as conn:
        cursor = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Album not found")
        conn.execute("DELETE FROM albums WHERE id = ?", (album_id,))
    return {"message": "Album deleted"}

@app.post("/api/albums/{album_id}/images")
def add_images_to_album(album_id: str, req: AddAlbumImagesRequest):
    with get_db() as conn:
        cursor = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Album not found")

        for img_id in req.image_ids:
            img_cursor = conn.execute("SELECT id FROM images WHERE id = ?", (img_id,))
            if img_cursor.fetchone():
                conn.execute(
                    "INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)",
                    (album_id, img_id)
                )
    return {"message": f"Added {len(req.image_ids)} images to album"}

@app.delete("/api/albums/{album_id}/images")
def remove_images_from_album(album_id: str, req: RemoveAlbumImagesRequest):
    with get_db() as conn:
        cursor = conn.execute("SELECT id FROM albums WHERE id = ?", (album_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Album not found")

        for img_id in req.image_ids:
            conn.execute(
                "DELETE FROM album_images WHERE album_id = ? AND image_id = ?",
                (album_id, img_id)
            )
    return {"message": f"Removed {len(req.image_ids)} images from album"}

# -------------------------------------------------------------------------
# WebSocket Notifications Endpoint
# -------------------------------------------------------------------------
@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    await websocket.accept()
    notification_service.register(websocket)
    try:
        while True:
            # Maintain connection, check for clean exits
            await websocket.receive_text()
    except WebSocketDisconnect:
        notification_service.unregister(websocket)
    except Exception:
        notification_service.unregister(websocket)

# -------------------------------------------------------------------------
# Serve Static Production Frontend / Proxy Dev Frontend
# -------------------------------------------------------------------------
is_dev = os.getenv("PYCASA_ENV") == "development"

if is_dev:
    import httpx
    from fastapi import Request, Response

    proxy_client = httpx.AsyncClient(base_url="http://localhost:4173")
    logger.info("Dev mode: proxying frontend requests to Vite at http://localhost:4173")

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    async def proxy_to_vite(path: str, request: Request):
        if path in ("db", "admin"):
            return RedirectResponse(url="/db/")

        url = httpx.URL(path=request.url.path, query=request.url.query.encode("utf-8"))
        body = await request.body()
        headers = dict(request.headers)
        headers.pop("host", None)
        try:
            response = await proxy_client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                timeout=10.0
            )
            # Filter out headers that might cause transfer encoding issues or conflicts
            resp_headers = {}
            for k, v in response.headers.items():
                if k.lower() not in ["content-encoding", "transfer-encoding", "content-length"]:
                    resp_headers[k] = v
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=resp_headers
            )
        except httpx.RequestError as exc:
            logger.error(f"Error proxying request to Vite: {exc}")
            return Response(
                content=f"Vite dev server not reachable. Path: {path}. Error: {exc}",
                status_code=502
            )
else:
    webapp_dist_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "src", "main", "webapp", "dist")
    )
    if os.path.exists(webapp_dist_path):
        logger.info(f"Serving production frontend from {webapp_dist_path}")
        app.mount("/", StaticFiles(directory=webapp_dist_path, html=True), name="static")
    else:
        logger.info(f"Frontend dist directory not found at {webapp_dist_path}.")
