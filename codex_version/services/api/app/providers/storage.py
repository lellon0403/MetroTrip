import hashlib
from dataclasses import dataclass

import boto3
from botocore.config import Config

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class StoredObject:
    size_bytes: int
    content_type: str
    signature: bytes
    checksum_sha256: str


class S3StorageProvider:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        client_options = {
            "aws_access_key_id": self.settings.s3_access_key,
            "aws_secret_access_key": self.settings.s3_secret_key,
            "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        }
        self.client = boto3.client(
            "s3",
            endpoint_url=self.settings.s3_endpoint_url,
            **client_options,
        )
        self.public_client = boto3.client(
            "s3",
            endpoint_url=self.settings.s3_public_url,
            **client_options,
        )

    def presign_put(self, object_key: str, mime_type: str, expires_in: int = 900) -> str:
        return self.public_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.settings.s3_bucket,
                "Key": object_key,
                "ContentType": mime_type,
            },
            ExpiresIn=expires_in,
        )

    def inspect(self, object_key: str) -> StoredObject:
        response = self.client.head_object(Bucket=self.settings.s3_bucket, Key=object_key)
        content = self.client.get_object(Bucket=self.settings.s3_bucket, Key=object_key)[
            "Body"
        ].read()
        return StoredObject(
            size_bytes=int(response["ContentLength"]),
            content_type=str(response.get("ContentType") or "application/octet-stream"),
            signature=content[:16],
            checksum_sha256=hashlib.sha256(content).hexdigest(),
        )

    def delete(self, object_key: str) -> None:
        self.client.delete_object(Bucket=self.settings.s3_bucket, Key=object_key)

    def public_url(self, object_key: str) -> str:
        return f"{self.settings.s3_public_url.rstrip('/')}/{self.settings.s3_bucket}/{object_key}"
