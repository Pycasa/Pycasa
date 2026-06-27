import os
import sqlite3
import hashlib
import logging
from contextlib import contextmanager

DB_DIR = os.path.expanduser("~/.pycasa/cache")
DB_PATH = os.path.join(DB_DIR, "pycasa.db")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pycasa.database")

@contextmanager
def get_db():
    os.makedirs(DB_DIR, exist_ok=True)
    # Use timeout to prevent locked database errors during concurrent write attempts
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def init_db():
    logger.info(f"Initializing database at {DB_PATH}")
    os.makedirs(DB_DIR, exist_ok=True)
    os.makedirs(os.path.join(DB_DIR, "thumbs"), exist_ok=True)
    os.makedirs(os.path.join(DB_DIR, "trash"), exist_ok=True)
    os.makedirs(os.path.expanduser("~/.pycasa/uploads"), exist_ok=True)

    with get_db() as conn:
        # Create App Settings table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            ollama_url TEXT,
            vision_model TEXT,
            text_model TEXT,
            embedding_model TEXT,
            active_ai_service TEXT,
            gemini_api_key TEXT,
            openai_api_key TEXT,
            openai_model TEXT,
            image_analysis_prompt TEXT,
            tag_generation_prompt TEXT,
            ocr_tesseract_datapath TEXT,
            ocr_jna_library_path TEXT,
            ollama_timeout INTEGER DEFAULT 120,
            upload_path TEXT
        );
        """)

        # Create Users table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT,
            name TEXT,
            email TEXT
        );
        """)

        # Create Monitored Folders table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS monitored_folders (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE,
            label TEXT,
            created_at INTEGER
        );
        """)

        # Create Images table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            file_path TEXT UNIQUE,
            folder_id TEXT,
            description TEXT,
            ocr_text TEXT,
            file_size INTEGER,
            modified_at INTEGER,
            created_at INTEGER,
            indexed_at INTEGER,
            ai_analysed INTEGER DEFAULT 0,
            thumbnail_path TEXT,
            favorite INTEGER DEFAULT 0,
            trashed INTEGER DEFAULT 0,
            width INTEGER,
            height INTEGER,
            date_taken TEXT,
            camera_make TEXT,
            camera_model TEXT,
            lens_model TEXT,
            aperture TEXT,
            shutter_speed TEXT,
            iso INTEGER,
            focal_length TEXT,
            latitude REAL,
            longitude REAL,
            location_name TEXT,
            FOREIGN KEY(folder_id) REFERENCES monitored_folders(id) ON DELETE CASCADE
        );
        """)

        # Create Image Tags table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS image_tags (
            image_id TEXT,
            tag TEXT,
            PRIMARY KEY (image_id, tag),
            FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
        );
        """)

        # Create Notifications table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            event_type TEXT,
            message TEXT,
            detail TEXT,
            ts INTEGER,
            read INTEGER DEFAULT 0
        );
        """)

        # Create Indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_images_modified_at ON images (modified_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_images_folder_id_modified_at ON images (folder_id, modified_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_images_favorite_modified_at ON images (favorite, modified_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_images_file_path ON images (file_path);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags (tag);")

        # Bootstrap Admin User
        cursor = conn.execute("SELECT COUNT(*) as count FROM users")
        if cursor.fetchone()["count"] == 0:
            admin_pwd_hash = hash_password("admin")
            conn.execute(
                "INSERT INTO users (id, username, password_hash, name, email) VALUES (?, ?, ?, ?, ?)",
                ("user_admin", "admin", admin_pwd_hash, "Administrator", "admin@pycasa.local")
            )
            logger.info("Created default admin user (username: admin, password: admin)")

        # Bootstrap App Settings
        cursor = conn.execute("SELECT COUNT(*) as count FROM app_settings WHERE id = 'settings'")
        if cursor.fetchone()["count"] == 0:
            conn.execute(
                """INSERT INTO app_settings (
                    id, ollama_url, vision_model, text_model, embedding_model, active_ai_service,
                    openai_model, image_analysis_prompt, tag_generation_prompt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "settings",
                    "http://localhost:11434",
                    "llava",
                    "llama2",
                    "nomic-embed-text",
                    "ollama",
                    "gpt-4-vision-preview",
                    "Analyze the provided image in comprehensive visual detail.",
                    'Based on the following image description, generate a concise list of relevant tags. Return only a JSON array of lowercase strings, with no explanation. Example: ["outdoor","sunset","landscape","nature"]'
                )
            )
            logger.info("Created default application settings")

        # Migrations
        try:
            conn.execute("ALTER TABLE app_settings ADD COLUMN ollama_timeout INTEGER DEFAULT 120;")
            logger.info("Migrated database: added ollama_timeout column to app_settings table")
        except sqlite3.OperationalError:
            pass

        try:
            conn.execute("ALTER TABLE app_settings ADD COLUMN upload_path TEXT;")
            logger.info("Migrated database: added upload_path column to app_settings table")
        except sqlite3.OperationalError:
            pass

        # Migrate images table to add metadata columns
        for col, col_type in [
            ("width", "INTEGER"),
            ("height", "INTEGER"),
            ("date_taken", "TEXT"),
            ("camera_make", "TEXT"),
            ("camera_model", "TEXT"),
            ("lens_model", "TEXT"),
            ("aperture", "TEXT"),
            ("shutter_speed", "TEXT"),
            ("iso", "INTEGER"),
            ("focal_length", "TEXT"),
            ("latitude", "REAL"),
            ("longitude", "REAL"),
            ("location_name", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE images ADD COLUMN {col} {col_type};")
                logger.info(f"Migrated database: added {col} column to images table")
            except sqlite3.OperationalError:
                pass
