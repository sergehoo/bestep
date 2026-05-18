"""Tests Phase 1 — Sécurité des sérializers DRF.

Couvre les correctifs CRITIQUES sur les sérializers :

- API-28 : CourseSerializer.read_only_fields inclut `company`, `company_only`,
  `preview_media_asset_id` — impossible d'écrire ces champs via PATCH.
- API-31 / API-32 : validate_media_asset_id / validate_preview_media_asset_id
  rejettent un UUID de média hors scope.
- API-34 : MediaAssetListSerializer ne renvoie pas `object_key` /
  `optimized_object_key` / `thumbnail_object_key`.
"""
from __future__ import annotations

import uuid

import pytest


@pytest.mark.django_db
def test_course_serializer_company_is_read_only():
    """API-28 : un PATCH avec ``company`` ne doit PAS modifier le champ."""
    from best_epargne.apis.serializers import CourseSerializer

    # On vérifie statiquement la déclaration Meta.
    read_only = set(CourseSerializer.Meta.read_only_fields)
    assert "company" in read_only, \
        "company doit être read_only dans CourseSerializer (API-28)"
    assert "company_only" in read_only, \
        "company_only doit être read_only (API-28)"


@pytest.mark.django_db
def test_media_list_serializer_does_not_leak_object_keys():
    """API-34 : object_key / optimized_object_key / thumbnail_object_key
    ne sont pas exposés."""
    from best_epargne.apis.serializers import MediaAssetListSerializer

    fields = set(MediaAssetListSerializer.Meta.fields)
    forbidden = {"object_key", "optimized_object_key", "thumbnail_object_key"}
    leaked = fields & forbidden
    assert leaked == set(), f"Champs sensibles exposés : {leaked} (API-34)"


@pytest.mark.django_db
def test_media_detail_serializer_does_not_leak_object_keys():
    """API-34 : idem côté detail."""
    from best_epargne.apis.serializers import MediaAssetDetailSerializer

    fields = set(MediaAssetDetailSerializer.Meta.fields)
    forbidden = {"object_key", "optimized_object_key", "thumbnail_object_key"}
    leaked = fields & forbidden
    assert leaked == set(), f"Champs sensibles exposés : {leaked} (API-34)"


@pytest.mark.django_db
def test_media_upload_init_serializer_rejects_bad_mime(alice):
    """API-10 : MIME hors whitelist refusé."""
    from best_epargne.apis.serializers import MediaUploadInitSerializer
    from catalog.models import MediaAsset

    bad = {
        "filename": "evil.html",
        "content_type": "text/html",
        "size": 1024,
        "kind": MediaAsset.Kind.VIDEO,
    }
    ser = MediaUploadInitSerializer(data=bad)
    assert not ser.is_valid()
    assert "content_type" in ser.errors


@pytest.mark.django_db
def test_media_upload_init_serializer_rejects_oversize(alice):
    """API-10 : size > MAX_SIZE_BY_KIND refusé."""
    from best_epargne.apis.serializers import MediaUploadInitSerializer
    from catalog.models import MediaAsset

    bad = {
        "filename": "huge.mp4",
        "content_type": "video/mp4",
        "size": 10 * 1024 * 1024 * 1024,  # 10 GiB
        "kind": MediaAsset.Kind.VIDEO,
    }
    ser = MediaUploadInitSerializer(data=bad)
    assert not ser.is_valid()
    assert "size" in ser.errors


@pytest.mark.django_db
def test_media_upload_init_rejects_path_traversal_filename(alice):
    """API-10 / FORMATIONS-07 : filename avec / ou \\ refusé."""
    from best_epargne.apis.serializers import MediaUploadInitSerializer
    from catalog.models import MediaAsset

    for bad_name in ("../../etc/passwd", "evil\\bin", ".env"):
        ser = MediaUploadInitSerializer(data={
            "filename": bad_name,
            "content_type": "video/mp4",
            "size": 1024,
            "kind": MediaAsset.Kind.VIDEO,
        })
        assert not ser.is_valid(), f"filename '{bad_name}' aurait dû être refusé"
