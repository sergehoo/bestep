"""Contrat des aperçus de la médiathèque instructeur."""
from types import SimpleNamespace

import pytest

from best_epargne.apis.serializers import MediaAssetSerializer


@pytest.mark.parametrize(
    ("content_type", "object_key", "title"),
    [
        ("image/jpeg", "uploads/opaque-key", "Photo sans extension"),
        ("application/octet-stream", "uploads/photo.JPEG", "Ancien upload"),
        ("", "uploads/opaque-key", "WhatsApp Image 2026-05-18.heic"),
    ],
)
def test_media_asset_serializer_recognizes_images(
    content_type, object_key, title
):
    asset = SimpleNamespace(
        content_type=content_type,
        object_key=object_key,
        title=title,
    )

    assert MediaAssetSerializer._is_image_asset(asset) is True


def test_media_asset_serializer_does_not_treat_pdf_as_image():
    asset = SimpleNamespace(
        content_type="application/pdf",
        object_key="uploads/guide.pdf",
        title="Guide de formation.pdf",
    )

    assert MediaAssetSerializer._is_image_asset(asset) is False


def test_image_without_generated_thumbnail_uses_original_as_preview(monkeypatch):
    serializer = MediaAssetSerializer()
    asset = SimpleNamespace(
        content_type="application/octet-stream",
        object_key="uploads/whatsapp-image.webp",
        optimized_object_key="",
        thumbnail_object_key="",
        title="WhatsApp Image",
    )
    monkeypatch.setattr(serializer, "_default_storage_url", lambda key: f"signed:{key}")

    assert serializer.get_thumbnail_url(asset) == "signed:uploads/whatsapp-image.webp"
