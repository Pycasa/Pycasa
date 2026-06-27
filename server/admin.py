"""
SQLAdmin integration for Pycasa.
Mirrors the existing SQLite schema as SQLAlchemy ORM models so SQLAdmin
can render a full CRUD admin interface at /admin.
"""
from sqlalchemy import (
    Boolean, Column, Float, Integer, String, Text, create_engine
)
from sqlalchemy.orm import declarative_base
from sqladmin import Admin, ModelView

from .database import DB_PATH

Base = declarative_base()

# ── SQLAlchemy ORM models (mirror the existing schema) ────────────────────

class Image(Base):
    __tablename__ = "images"
    id            = Column(String, primary_key=True)
    file_path     = Column(String)
    folder_id     = Column(String)
    description   = Column(Text)
    ocr_text      = Column(Text)
    file_size     = Column(Integer)
    modified_at   = Column(Integer)
    created_at    = Column(Integer)
    indexed_at    = Column(Integer)
    ai_analysed   = Column(Integer, default=0)
    thumbnail_path= Column(String)
    favorite      = Column(Integer, default=0)
    trashed       = Column(Integer, default=0)
    width         = Column(Integer)
    height        = Column(Integer)
    date_taken    = Column(String)
    camera_make   = Column(String)
    camera_model  = Column(String)
    lens_model    = Column(String)
    aperture      = Column(String)
    shutter_speed = Column(String)
    iso           = Column(Integer)
    focal_length  = Column(String)
    latitude      = Column(Float)
    longitude     = Column(Float)
    location_name = Column(String)


class MonitoredFolder(Base):
    __tablename__ = "monitored_folders"
    id         = Column(String, primary_key=True)
    path       = Column(String)
    label      = Column(String)
    created_at = Column(Integer)


class ImageTag(Base):
    __tablename__ = "image_tags"
    image_id = Column(String, primary_key=True)
    tag      = Column(String, primary_key=True)


class User(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True)
    username      = Column(String)
    password_hash = Column(String)
    name          = Column(String)
    email         = Column(String)


class Notification(Base):
    __tablename__ = "notifications"
    id         = Column(String, primary_key=True)
    event_type = Column(String)
    message    = Column(String)
    detail     = Column(String)
    ts         = Column(Integer)
    read       = Column(Integer, default=0)


class Event(Base):
    __tablename__ = "events"
    id          = Column(String, primary_key=True)
    event_type  = Column(String)
    timestamp   = Column(Integer)
    file_path   = Column(String)
    folder_path = Column(String)
    details     = Column(Text)


class AppSettings(Base):
    __tablename__ = "app_settings"
    id                     = Column(String, primary_key=True)
    ollama_url             = Column(String)
    vision_model           = Column(String)
    text_model             = Column(String)
    embedding_model        = Column(String)
    active_ai_service      = Column(String)
    gemini_api_key         = Column(String)
    openai_api_key         = Column(String)
    openai_model           = Column(String)
    image_analysis_prompt  = Column(Text)
    tag_generation_prompt  = Column(Text)
    ocr_tesseract_datapath = Column(String)
    ocr_jna_library_path   = Column(String)
    ollama_timeout         = Column(Integer, default=120)
    upload_path            = Column(String)


# ── SQLAdmin ModelViews ────────────────────────────────────────────────────

class ImageAdmin(ModelView, model=Image):
    name           = "Image"
    name_plural    = "Images"
    icon           = "fa-solid fa-image"
    column_list    = [
        Image.id, Image.file_path, Image.folder_id,
        Image.file_size, Image.favorite, Image.trashed,
        Image.ai_analysed, Image.date_taken,
    ]
    column_searchable_list  = [Image.file_path, Image.description]
    column_sortable_list    = [Image.file_size, Image.modified_at, Image.created_at]
    column_default_sort     = (Image.modified_at, True)
    can_create = False
    can_delete = True
    can_edit   = True


class FolderAdmin(ModelView, model=MonitoredFolder):
    name        = "Folder"
    name_plural = "Folders"
    icon        = "fa-solid fa-folder"
    column_list = [MonitoredFolder.id, MonitoredFolder.path, MonitoredFolder.label]
    can_create  = False
    can_delete  = False
    can_edit    = False


class TagAdmin(ModelView, model=ImageTag):
    name        = "Tag"
    name_plural = "Tags"
    icon        = "fa-solid fa-tag"
    column_list = [ImageTag.image_id, ImageTag.tag]
    column_searchable_list = [ImageTag.tag]
    can_create  = False
    can_delete  = True
    can_edit    = False


class UserAdmin(ModelView, model=User):
    name        = "User"
    name_plural = "Users"
    icon        = "fa-solid fa-user"
    column_list = [User.id, User.username, User.name, User.email]
    column_details_exclude_list = [User.password_hash]
    can_create  = True
    can_delete  = True
    can_edit    = True


class NotificationAdmin(ModelView, model=Notification):
    name        = "Notification"
    name_plural = "Notifications"
    icon        = "fa-solid fa-bell"
    column_list = [Notification.id, Notification.event_type, Notification.message, Notification.ts, Notification.read]
    column_default_sort = (Notification.ts, True)
    can_create  = False
    can_delete  = True
    can_edit    = False


class SettingsAdmin(ModelView, model=AppSettings):
    name        = "Settings"
    name_plural = "App Settings"
    icon        = "fa-solid fa-gear"
    column_list = [AppSettings.id, AppSettings.active_ai_service, AppSettings.ollama_url, AppSettings.vision_model]
    can_create  = False
    can_delete  = False
    can_edit    = True


class EventAdmin(ModelView, model=Event):
    name        = "Event"
    name_plural = "Events"
    icon        = "fa-solid fa-clock-rotate-left"
    column_list = [Event.id, Event.event_type, Event.timestamp, Event.file_path, Event.folder_path, Event.details]
    column_default_sort = (Event.timestamp, True)
    column_searchable_list = [Event.event_type, Event.file_path, Event.folder_path, Event.details]
    column_sortable_list = [Event.timestamp]
    can_create  = False
    can_delete  = True
    can_edit    = False


# ── Factory ───────────────────────────────────────────────────────────────

def create_admin(app) -> Admin:
    """Create and return a configured SQLAdmin instance mounted at /admin."""
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )
    import os
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")
    admin = Admin(
        app,
        engine,
        base_url="/db",
        title="Pycasa DB",
        templates_dir=templates_dir,
    )
    admin.add_view(ImageAdmin)
    admin.add_view(FolderAdmin)
    admin.add_view(TagAdmin)
    admin.add_view(UserAdmin)
    admin.add_view(NotificationAdmin)
    admin.add_view(SettingsAdmin)
    admin.add_view(EventAdmin)
    return admin
