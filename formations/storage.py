# /Users/ogahserge/Documents/best_epargne/formations/storage.py
import os
import re
import mimetypes
from uuid import uuid4

import boto3
from botocore.config import Config
from django.conf import settings


def sanitize_filename(filename: str) -> str:
    filename = os.path.basename(filename or "file.bin").strip()
    filename = re.sub(r"[^\w.\-]+", "_", filename, flags=re.UNICODE)
    return filename or "file.bin"


def guess_content_type(filename: str, default: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or default


def build_object_key(user_id, kind: str, filename: str) -> str:
    filename = sanitize_filename(filename)
    return f"instructors/{user_id}/{kind}/original/{uuid4().hex}_{filename}"


def build_optimized_object_key(user_id, asset_id, source_filename="video.mp4") -> str:
    base = os.path.splitext(sanitize_filename(source_filename))[0]
    return f"instructors/{user_id}/video/optimized/{asset_id}/{base}_optimized.mp4"


def build_thumbnail_object_key(user_id, asset_id) -> str:
    return f"instructors/{user_id}/video/thumbnails/{asset_id}/thumb.jpg"


def s3_internal_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_INTERNAL_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(signature_version="s3v4"),
        verify=False,
    )


def s3_public_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_PUBLIC_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(signature_version="s3v4"),
        verify=True,
    )
