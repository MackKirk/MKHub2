from typing import Optional, BinaryIO

from .provider import StorageProvider


class HybridStorageProvider(StorageProvider):
    def __init__(self, primary: StorageProvider, fallback: StorageProvider):
        self.primary = primary
        self.fallback = fallback

    def generate_upload_url(self, key: str, content_type: str, expires_s: int) -> str:
        return self.primary.generate_upload_url(key, content_type, expires_s)

    def get_download_url(self, key: str, expires_s: int) -> Optional[str]:
        if self.primary.exists(key):
            return self.primary.get_download_url(key, expires_s)
        # Read-through: try fallback, copy to primary
        url = self.fallback.get_download_url(key, 300)
        if url:
            self.primary.copy_in(url, key)
            return self.primary.get_download_url(key, expires_s)
        return None

    def exists(self, key: str) -> bool:
        return self.primary.exists(key) or self.fallback.exists(key)

    def copy_in(self, src_stream_or_url: str | BinaryIO, key: str) -> None:
        self.primary.copy_in(src_stream_or_url, key)

    def delete(self, key: str) -> None:
        self.primary.delete(key)

