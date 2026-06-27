from pydantic import BaseModel, Field
from typing import List, Optional

class LoginRequest(BaseModel):
    username: str
    password: str

class UserSession(BaseModel):
    id: str
    username: str
    name: str
    email: str

class SessionInfo(BaseModel):
    access_token: str
    user: UserSession

class LoginResponse(BaseModel):
    session: SessionInfo
    user: UserSession

class SessionResponse(BaseModel):
    session: SessionInfo

class AddFolderRequest(BaseModel):
    path: str
    label: Optional[str] = None

class FolderResponse(BaseModel):
    id: str
    path: str
    label: str
    type: str = "folder"
    createdAt: int # camelCase for React compatibility
    imageCount: int = 0

class AlbumInfo(BaseModel):
    id: str
    name: str

class ImageRecordResponse(BaseModel):
    id: str
    file_path: str
    folder_id: str
    description: Optional[str] = None
    tags: List[str] = []
    albums: List[AlbumInfo] = []
    ocr_text: Optional[str] = None
    file_size: int
    modified_at: int
    created_at: int
    indexed_at: int
    ai_analysed: bool
    thumbnail_path: Optional[str] = None
    favorite: bool
    trashed: bool
    type: str = "image"
    width: Optional[int] = None
    height: Optional[int] = None
    date_taken: Optional[str] = None
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    lens_model: Optional[str] = None
    aperture: Optional[str] = None
    shutter_speed: Optional[str] = None
    iso: Optional[int] = None
    focal_length: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None

class ImageDetailsResponse(ImageRecordResponse):
    pass

class UpdateMetadataRequest(BaseModel):
    id: Optional[str] = None
    file_path: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    favorite: Optional[bool] = None

class AppSettingsSchema(BaseModel):
    ollama_url: Optional[str] = "http://localhost:11434"
    vision_model: Optional[str] = "llava"
    text_model: Optional[str] = "llama2"
    embedding_model: Optional[str] = "nomic-embed-text"
    active_ai_service: Optional[str] = "ollama"
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = "gpt-4-vision-preview"
    image_analysis_prompt: Optional[str] = None
    tag_generation_prompt: Optional[str] = None
    ocr_tesseract_datapath: Optional[str] = None
    ocr_jna_library_path: Optional[str] = None
    ollama_timeout: Optional[int] = 120
    upload_path: Optional[str] = None

class NotificationResponse(BaseModel):
    id: str
    type: str = "notification"
    event_type: str
    message: str
    detail: Optional[str] = None
    ts: int
    read: bool

class CreateAlbumRequest(BaseModel):
    name: str

class AlbumResponse(BaseModel):
    id: str
    name: str
    created_at: int
    image_count: int = 0
    cover_image_thumbnail: Optional[str] = None

class AddAlbumImagesRequest(BaseModel):
    image_ids: List[str]

class RemoveAlbumImagesRequest(BaseModel):
    image_ids: List[str]
