import boto3
from django.conf import settings


def s3_client():
    """
    Client S3 compatible MinIO / AWS
    """
    return boto3.client(
        "s3",
        endpoint_url=getattr(settings, "MINIO_ENDPOINT", None),
        aws_access_key_id=getattr(settings, "MINIO_ROOT_USER", None),
        aws_secret_access_key=getattr(settings, "MINIO_ROOT_PASSWORD", None),
        region_name="us-east-1",
        config=boto3.session.Config(signature_version="s3v4"),
    )