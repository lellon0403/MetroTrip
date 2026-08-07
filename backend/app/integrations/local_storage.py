"""로컬 파일시스템 기반 미디어 저장소 연동."""

from pathlib import Path

from app.config import BACKEND_DIR, Settings

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB

_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
}


class UnsupportedMediaTypeError(Exception):
    """지원하지 않는 콘텐츠 타입일 때 발생한다."""


class MediaTooLargeError(Exception):
    """업로드 용량이 제한을 초과했을 때 발생한다."""


def resolve_extension(content_type: str) -> str:
    """콘텐츠 타입으로 저장 확장자를 결정한다."""
    extension = _CONTENT_TYPE_EXTENSIONS.get(content_type.lower())
    if not extension:
        raise UnsupportedMediaTypeError(content_type)
    return extension


def media_root(settings: Settings) -> Path:
    """미디어 파일이 저장되는 로컬 디렉터리를 반환하고 없으면 만든다."""
    root = BACKEND_DIR / settings.media_root_dir
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_file(settings: Settings, object_key: str, content: bytes) -> None:
    """업로드된 바이트를 로컬 디스크에 저장한다."""
    if len(content) > MAX_UPLOAD_BYTES:
        raise MediaTooLargeError(len(content))
    destination = media_root(settings) / object_key
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
