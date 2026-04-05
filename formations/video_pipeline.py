import json
import os
import shlex
import subprocess
from pathlib import Path


class VideoProcessingError(Exception):
    pass


def run_cmd(cmd: list[str]) -> None:
    process = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if process.returncode != 0:
        raise VideoProcessingError(
            f"Command failed: {' '.join(shlex.quote(c) for c in cmd)}\n{process.stderr}"
        )


def ffprobe_metadata(input_path: str) -> dict:
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        input_path,
    ]
    process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if process.returncode != 0:
        raise VideoProcessingError(process.stderr)

    data = json.loads(process.stdout or "{}")
    streams = data.get("streams", [])
    fmt = data.get("format", {})

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

    duration = fmt.get("duration") or video_stream.get("duration") or 0
    bit_rate = fmt.get("bit_rate") or video_stream.get("bit_rate") or 0

    return {
        "duration_seconds": int(float(duration or 0)),
        "width": int(video_stream.get("width") or 0) or None,
        "height": int(video_stream.get("height") or 0) or None,
        "bitrate": int(float(bit_rate or 0)) if bit_rate else None,
        "has_audio": bool(audio_stream),
    }


def transcode_to_web_mp4(input_path: str, output_path: str, target_height: int = 720) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-vf", f"scale='min(1280,iw)':min({target_height},ih):force_original_aspect_ratio=decrease",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ]
    run_cmd(cmd)


def generate_thumbnail(input_path: str, output_path: str, second: int = 2) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(second),
        "-i", input_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path,
    ]
    run_cmd(cmd)