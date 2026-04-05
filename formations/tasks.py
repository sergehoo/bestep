import os
import tempfile
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.db import transaction

from catalog.models import MediaAsset
from .storage import (
    build_optimized_object_key,
    build_thumbnail_object_key,
    s3_internal_client,
)
from .video_pipeline import (
    ffprobe_metadata,
    generate_thumbnail,
    transcode_to_web_mp4,
    VideoProcessingError,
)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def process_media_asset(self, asset_id: str):
    asset = MediaAsset.objects.get(id=asset_id)

    if asset.kind != MediaAsset.Kind.VIDEO:
        return {"status": "skipped", "reason": "not_video"}

    bucket = getattr(settings, "MINIO_BUCKET", None)
    if not bucket:
        raise RuntimeError("MINIO_BUCKET is not configured")

    with transaction.atomic():
        asset.processing_status = MediaAsset.ProcessingStatus.PROCESSING
        asset.processing_error = ""
        asset.save(update_fields=["processing_status", "processing_error", "updated_at"])

    client = s3_internal_client()

    with tempfile.TemporaryDirectory(prefix="media_proc_") as tmpdir:
        tmpdir = Path(tmpdir)

        src_path = tmpdir / "source"
        optimized_path = tmpdir / "optimized.mp4"
        thumb_path = tmpdir / "thumb.jpg"

        # Télécharger l'original
        client.download_file(bucket, asset.object_key, str(src_path))

        # Lire métadonnées
        meta = ffprobe_metadata(str(src_path))

        # Transcoder
        transcode_to_web_mp4(str(src_path), str(optimized_path), target_height=720)

        # Miniature
        thumb_second = 2
        if meta["duration_seconds"] and meta["duration_seconds"] > 10:
            thumb_second = max(1, int(meta["duration_seconds"] * 0.1))
        generate_thumbnail(str(src_path), str(thumb_path), second=thumb_second)

        optimized_key = build_optimized_object_key(asset.owner_id, asset.id, source_filename="video.mp4")
        thumbnail_key = build_thumbnail_object_key(asset.owner_id, asset.id)

        client.upload_file(
            str(optimized_path),
            bucket,
            optimized_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

        client.upload_file(
            str(thumb_path),
            bucket,
            thumbnail_key,
            ExtraArgs={"ContentType": "image/jpeg"},
        )

        optimized_size = os.path.getsize(optimized_path)

        with transaction.atomic():
            asset.optimized_object_key = optimized_key
            asset.thumbnail_object_key = thumbnail_key
            asset.duration_seconds = meta["duration_seconds"] or asset.duration_seconds
            asset.width = meta["width"]
            asset.height = meta["height"]
            asset.bitrate = meta["bitrate"]
            asset.processing_status = MediaAsset.ProcessingStatus.READY
            asset.processing_error = ""
            asset.save(
                update_fields=[
                    "optimized_object_key",
                    "thumbnail_object_key",
                    "duration_seconds",
                    "width",
                    "height",
                    "bitrate",
                    "processing_status",
                    "processing_error",
                    "updated_at",
                ]
            )

        return {
            "status": "ok",
            "asset_id": str(asset.id),
            "optimized_key": optimized_key,
            "thumbnail_key": thumbnail_key,
            "optimized_size": optimized_size,
        }