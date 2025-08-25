from datetime import datetime, timedelta
from typing import Optional, BinaryIO

from azure.storage.blob import (
    BlobServiceClient,
    generate_blob_sas,
    BlobSasPermissions,
)

from ..config import settings
from .provider import StorageProvider


class BlobStorageProvider(StorageProvider):
    def __init__(self) -> None:
        if not settings.azure_blob_connection or not settings.azure_blob_container:
            raise RuntimeError("AZURE_BLOB_CONNECTION and AZURE_BLOB_CONTAINER must be set")
        self._service = BlobServiceClient.from_connection_string(settings.azure_blob_connection)
        self._container = settings.azure_blob_container

    def generate_upload_url(self, key: str, content_type: str, expires_s: int) -> str:
        expiry = datetime.utcnow() + timedelta(seconds=expires_s)
        sas = generate_blob_sas(
            account_name=self._service.account_name,
            container_name=self._container,
            blob_name=key.lstrip("/"),
            account_key=self._service.credential.account_key,
            permission=BlobSasPermissions(write=True, create=True),
            expiry=expiry,
            content_type=content_type,
        )
        blob_url = self._service.get_blob_client(self._container, key.lstrip("/")).url
        return f"{blob_url}?{sas}"

    def get_download_url(self, key: str, expires_s: int) -> Optional[str]:
        expiry = datetime.utcnow() + timedelta(seconds=expires_s)
        sas = generate_blob_sas(
            account_name=self._service.account_name,
            container_name=self._container,
            blob_name=key.lstrip("/"),
            account_key=self._service.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=expiry,
        )
        blob_url = self._service.get_blob_client(self._container, key.lstrip("/")).url
        return f"{blob_url}?{sas}"

    def exists(self, key: str) -> bool:
        client = self._service.get_blob_client(self._container, key.lstrip("/"))
        return client.exists()

    def copy_in(self, src_stream_or_url: str | BinaryIO, key: str) -> None:
        client = self._service.get_blob_client(self._container, key.lstrip("/"))
        if isinstance(src_stream_or_url, str):
            client.start_copy_from_url(src_stream_or_url)
        else:
            client.upload_blob(src_stream_or_url, overwrite=True)

    def delete(self, key: str) -> None:
        client = self._service.get_blob_client(self._container, key.lstrip("/"))
        try:
            client.delete_blob()
        except Exception:
            pass

