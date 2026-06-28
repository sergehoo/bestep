"""formations/video_pipeline.py — CORRECTIFS P1.F (audit FORMATIONS-08, FORMATIONS-09).

- FORMATIONS-08 : ``-protocol_whitelist file`` sur tous les appels ffmpeg/ffprobe
  + validation que ``input_path`` est dans le tempdir.
- FORMATIONS-09 : ``timeout`` sur ``subprocess.run`` (30 min par défaut).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path


class VideoProcessingError(Exception):
    pass


# Durée maximale acceptée pour un transcoding (30 min). Configurable via env si besoin.
DEFAULT_FFMPEG_TIMEOUT = 1800


def run_cmd(cmd: list[str], timeout: int = DEFAULT_FFMPEG_TIMEOUT) -> subprocess.CompletedProcess:
    """Exécute une commande système sans shell, avec timeout (CORRECTIF FORMATIONS-09)."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            check=True,
            text=True,
            timeout=timeout,
        )
        return result
    except subprocess.TimeoutExpired as exc:
        raise VideoProcessingError(
            f"Command timed out after {timeout}s: {' '.join(cmd)}"
        ) from exc
    except subprocess.CalledProcessError as exc:
        joined = " ".join(cmd)
        raise VideoProcessingError(
            f"Command failed: {joined}\n{exc.stderr}"
        ) from exc


def ensure_binary(name: str) -> None:
    if not shutil.which(name):
        raise VideoProcessingError(f"Binary not found: {name}")


def _ensure_path_in_tempdir(path: str) -> str:
    """CORRECTIF FORMATIONS-08 : interdit les ``input_path`` hors tempdir."""
    resolved = Path(path).resolve()
    tempdir = Path(tempfile.gettempdir()).resolve()
    if not str(resolved).startswith(str(tempdir)):
        raise VideoProcessingError(
            f"Path '{path}' n'est pas dans le tempdir autorisé."
        )
    return str(resolved)


def ffprobe_metadata(input_path: str) -> dict:
    """Retourne les métadonnées vidéo utiles."""
    ensure_binary("ffprobe")
    safe_input = _ensure_path_in_tempdir(input_path)

    cmd = [
        "ffprobe",
        "-v", "error",
        # CORRECTIF FORMATIONS-08 : restriction stricte au protocole file.
        "-protocol_whitelist", "file",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        safe_input,
    ]
    result = run_cmd(cmd, timeout=120)
    payload = json.loads(result.stdout or "{}")

    streams = payload.get("streams", [])
    format_data = payload.get("format", {})

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

    def to_int(value, default=0):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default

    return {
        "duration_seconds": to_int(format_data.get("duration"), 0),
        "bitrate": to_int(format_data.get("bit_rate"), 0),
        "width": to_int(video_stream.get("width"), 0),
        "height": to_int(video_stream.get("height"), 0),
        "video_codec": video_stream.get("codec_name"),
        "audio_codec": audio_stream.get("codec_name"),
    }


# Whitelist de codecs vidéo / audio acceptés pour le transcode (anti-bombe).
ALLOWED_VIDEO_CODECS = {"h264", "hevc", "vp8", "vp9", "av1", "mpeg4"}
ALLOWED_AUDIO_CODECS = {"aac", "mp3", "opus", "vorbis", "pcm_s16le", "ac3"}
MAX_DURATION_SECONDS = 4 * 60 * 60   # 4h
MAX_PIXELS = 7680 * 4320              # 8K


def validate_video_input(meta: dict) -> None:
    """CORRECTIF FORMATIONS-10 : refus précoce d'un input pathologique."""
    if meta.get("video_codec") not in ALLOWED_VIDEO_CODECS:
        raise VideoProcessingError(
            f"Codec vidéo non supporté: {meta.get('video_codec')}"
        )
    if meta.get("audio_codec") and meta["audio_codec"] not in ALLOWED_AUDIO_CODECS:
        raise VideoProcessingError(
            f"Codec audio non supporté: {meta.get('audio_codec')}"
        )
    if meta.get("duration_seconds", 0) > MAX_DURATION_SECONDS:
        raise VideoProcessingError("Vidéo trop longue (>4h).")
    w, h = meta.get("width", 0), meta.get("height", 0)
    if w * h > MAX_PIXELS:
        raise VideoProcessingError("Résolution > 8K refusée.")


def transcode_to_web_mp4(
    input_path: str,
    output_path: str,
    *,
    target_height: int = 720,
    max_width: int = 1280,
    crf: int = 23,
    audio_bitrate: str = "128k",
    preset: str = "medium",
) -> None:
    """Convertit la vidéo en MP4 web optimisé (H.264 / AAC, faststart)."""
    ensure_binary("ffmpeg")
    safe_input = _ensure_path_in_tempdir(input_path)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    scale_filter = (
        f"scale=w={max_width}:h={target_height}:force_original_aspect_ratio=decrease"
    )

    cmd = [
        "ffmpeg",
        "-y",
        # CORRECTIF FORMATIONS-08 : pas de réseau, pas de concat:, etc.
        "-protocol_whitelist", "file",
        "-i", safe_input,
        "-vf", scale_filter,
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", audio_bitrate,
        str(output),
    ]
    run_cmd(cmd, timeout=DEFAULT_FFMPEG_TIMEOUT)


def generate_thumbnail(
    input_path: str,
    output_path: str,
    *,
    second: int = 2,
    width: int = 1280,
) -> None:
    """Génère une miniature JPG."""
    ensure_binary("ffmpeg")
    safe_input = _ensure_path_in_tempdir(input_path)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    vf = f"thumbnail,scale={width}:-1"

    cmd = [
        "ffmpeg",
        "-y",
        "-protocol_whitelist", "file",
        "-ss", str(second),
        "-i", safe_input,
        "-frames:v", "1",
        "-vf", vf,
        str(output),
    ]
    run_cmd(cmd, timeout=120)
