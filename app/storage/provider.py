from typing import BinaryIO, Optional


class StorageProvider:
    def generate_upload_url(self, key: str, content_type: str, expires_s: int) -> str:
        raise NotImplementedError

    def get_download_url(self, key: str, expires_s: int) -> Optional[str]:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError

    def copy_in(self, src_stream_or_url: str | BinaryIO, key: str) -> None:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

