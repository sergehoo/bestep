"""formations/storage.py — CORRECTIFS P1.F (audit FORMATIONS-06, FORMATIONS-07).

- FORMATIONS-06 : ``s3_internal_client.verify`` est aligné sur les settings
  globaux (``AWS_S3_VERIFY``) au lieu d'être hardcodé à ``False``.
- FORMATIONS-07 : ``sanitize_filename`` est durci (longueur max, neutralisation
  des points multiples, refus de filenames bizarres).
"""
from __future__ import annotations

import mimetypes
import os
import re
from uuid import uuid4

import boto3
from botocore.config import Config
from django.conf import settings


_MAX_FILENAME_LEN = 120
_BAD_FILENAMES = {".", "..", ".htaccess", ".env", ""}


def sanitize_filename(filename: str) -> str:
    """Nettoie un filename utilisateur avant stockage MinIO.

    Règles :
    - basename uniquement (pas de path),
    - caractères non-[A-Za-z0-9._-] remplacés par '_',
    - lowercased,
    - tronqué à 120 chars,
    - rejet des noms suspects (vide, '.', '..', '.htaccess', ...).
    """
    name = os.path.basename(filename or "file.bin").strip().lower()
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE)
    # Empêcher les filenames composés uniquement de points.
    if name.strip(".") == "":
        name = "file.bin"
    if name in _BAD_FILENAMES:
        name = "file.bin"
    if len(name) > _MAX_FILENAME_LEN:
        base, ext = os.path.splitext(name)
        cut = _MAX_FILENAME_LEN - len(ext) - 1
        name = base[: max(1, cut)] + ext
    return name or "file.bin"


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
    """CORRECTIF FORMATIONS-06 : verify aligné sur les settings."""
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_INTERNAL_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(signature_version="s3v4"),
        use_ssl=getattr(settings, "AWS_S3_USE_SSL", True),
        verify=getattr(settings, "AWS_S3_VERIFY", True),
    )


def s3_public_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_PUBLIC_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(signature_version="s3v4"),
        verify=getattr(settings, "AWS_S3_VERIFY", True),
    )
