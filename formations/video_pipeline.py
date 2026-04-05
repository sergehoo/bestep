import json
import shutil
import subprocess
from pathlib import Path


class VideoProcessingError(Exception):
    pass


def run_cmd(cmd: list[str]) -> subprocess.CompletedProcess:
    """
    Exécute une commande système sans passer par le shell.
    """
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
        )
        return result
    except subprocess.CalledProcessError as exc:
        joined = " ".join(cmd)
        raise VideoProcessingError(
            f"Command failed: {joined}\n{exc.stderr}"
        ) from exc


def ensure_binary(name: str) -> None:
    if not shutil.which(name):
        raise VideoProcessingError(f"Binary not found: {name}")


def ffprobe_metadata(input_path: str) -> dict:
    """
    Retourne les métadonnées vidéo utiles.
    """
    ensure_binary("ffprobe")

    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        input_path,
    ]
    result = run_cmd(cmd)
    payload = json.loads(result.stdout or "{}")

    streams = payload.get("streams", [])
    format_data = payload.get("format", {})

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

    def to_int(value, default=0):
        try:
            return int(float(value))
        except Exception:
            return default

    def to_float(value, default=0.0):
        try:
            return float(value)
        except Exception:
            return default

    return {
        "duration_seconds": to_int(format_data.get("duration"), 0),
        "bitrate": to_int(format_data.get("bit_rate"), 0),
        "width": to_int(video_stream.get("width"), 0),
        "height": to_int(video_stream.get("height"), 0),
        "video_codec": video_stream.get("codec_name"),
        "audio_codec": audio_stream.get("codec_name"),
    }


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
    """
    Convertit la vidéo en MP4 web optimisé.
    - H.264 / AAC
    - faststart pour lecture progressive
    - conserve le ratio
    - limite à 1280x720 par défaut
    """
    ensure_binary("ffmpeg")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    # Filtre ffmpeg correct
    # force_original_aspect_ratio=decrease garde les proportions
    scale_filter = (
        f"scale=w={max_width}:h={target_height}:force_original_aspect_ratio=decrease"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-vf", scale_filter,
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", audio_bitrate,
        output_path,
    ]

    run_cmd(cmd)


def generate_thumbnail(
    input_path: str,
    output_path: str,
    *,
    second: int = 2,
    width: int = 1280,
) -> None:
    """
    Génère une miniature JPG.
    """
    ensure_binary("ffmpeg")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    vf = f"thumbnail,scale={width}:-1"

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(second),
        "-i", input_path,
        "-frames:v", "1",
        "-vf", vf,
        output_path,
    ]

    run_cmd(cmd)