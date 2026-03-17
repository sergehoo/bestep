import uuid
from datetime import timedelta

import boto3
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction, IntegrityError
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.renderers import JSONRenderer
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count, Max, Sum, Avg, DecimalField, IntegerField
from botocore.client import Config

from catalog.models import Course, Category, CourseSection, Lesson, MediaAsset, Payment
from .permissions import IsInstructor
from .serializers import CourseSerializer, CategorySerializer, CourseSectionSerializer, LessonSerializer, \
    MediaUploadInitSerializer, MediaUploadFinalizeSerializer, MediaAssetListSerializer


# from compte.api.permissions import IsInstructor


class CategoryViewSet(ReadOnlyModelViewSet):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer


class CourseViewSet(ModelViewSet):
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = Course.objects.select_related("category", "instructor").prefetch_related("sections__lessons")
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            # public: seulement cours publiés (hors internes)
            if not self.request.user.is_authenticated or self.request.user.role != "SUPERADMIN":
                qs = qs.filter(status=Course.Status.PUBLISHED, company_only=False)

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))
        return qs.order_by("-published_at", "-created_at")

    def perform_create(self, serializer):
        # formateur crée son cours
        serializer.save(instructor=self.request.user)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated, IsInstructor], url_path="my")
    def my_courses(self, request):
        qs = (
            Course.objects.filter(instructor=request.user)
            .select_related("category", "instructor")
            .prefetch_related("sections__lessons")
            .annotate(
                sections_count=Count("sections", distinct=True),
                lessons_count=Count("sections__lessons", distinct=True),
                enrolled_count=Count("enrollments", distinct=True),  # requires related_name="enrollments"
            )
            .order_by("-updated_at", "-created_at")
        )

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(subtitle__icontains=q) | Q(description__icontains=q))

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        pricing = request.query_params.get("pricing")
        if pricing:
            qs = qs.filter(pricing_type=pricing)

        course_type = request.query_params.get("course_type")
        if course_type:
            qs = qs.filter(course_type=course_type)

        # TODO: rating_avg, rating_count, completion_rate (si tu as des modèles review/progress)
        # Pour ne pas casser, on renvoie defaults si pas dispo:
        data = CourseSerializer(qs, many=True, context={"request": request}).data
        for c in data:
            c.setdefault("rating_avg", None)
            c.setdefault("rating_count", 0)
            c.setdefault("completion_rate", 0)
        return Response(data)


def _course_owned(course_id, user):
    return get_object_or_404(Course, id=course_id, instructor=user)


User = get_user_model()

# ---- OPTIONAL imports (si ces modèles n'existent pas encore, on renvoie vide)
try:
    # Exemple: enrollments/models.py
    from enrollments.models import Enrollment
except Exception:  # pragma: no cover
    Enrollment = None

try:
    # Exemple: progress/models.py
    from enrollments.models import LessonProgress
except Exception:  # pragma: no cover
    LessonProgress = None

try:
    # Exemple: payments/models.py
    from catalog.models import Payout  # adapte si tu as un app payments
except Exception:  # pragma: no cover
    Payout = None

try:
    from reviews.models import Review, CourseReview  # adapte si tu as un app reviews
except Exception:  # pragma: no cover
    Review = None

try:
    from notifications.models import Notification  # adapte si tu as un app notifications
except Exception:  # pragma: no cover
    Notification = None


def _range_to_days(r: str) -> int:
    r = (r or "30d").lower().strip()
    return {"7d": 7, "30d": 30, "90d": 90}.get(r, 30)


class InstructorMeView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        profile = getattr(u, "instructor_profile", None)

        return Response({
            "id": u.id,
            "email": u.email,
            "full_name": getattr(u, "full_name", "") or "",
            "phone": getattr(u, "phone", "") or "",
            "role": getattr(u, "role", None),
            "is_staff": bool(getattr(u, "is_staff", False)),
            "is_superuser": bool(getattr(u, "is_superuser", False)),
            "instructor_profile": {
                "headline": getattr(profile, "headline", "") if profile else "",
                "bio": getattr(profile, "bio", "") if profile else "",
                "is_verified": bool(getattr(profile, "is_verified", False)) if profile else False,
                "payout_percent": str(getattr(profile, "payout_percent", "70.00")) if profile else "70.00",
            }
        })


def _range_to_days(r: str) -> int:
    r = (r or "30d").lower().strip()
    return {"7d": 7, "30d": 30, "90d": 90}.get(r, 30)


class InstructorKpisView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        days = _range_to_days(request.query_params.get("range", "30d"))
        since = timezone.now() - timedelta(days=days)

        courses_qs = Course.objects.filter(instructor=u)
        course_ids = list(courses_qs.values_list("id", flat=True))

        total_courses = courses_qs.count()
        published_courses = courses_qs.filter(status=Course.Status.PUBLISHED).count()
        review_courses = courses_qs.filter(status=Course.Status.REVIEW).count()
        draft_courses = courses_qs.filter(status=Course.Status.DRAFT).count()
        archived_courses = courses_qs.filter(status=Course.Status.ARCHIVED).count()

        total_sections = CourseSection.objects.filter(course__instructor=u).count()
        total_lessons = Lesson.objects.filter(section__course__instructor=u).count()
        total_media = MediaAsset.objects.filter(owner=u).count()

        enrollments_qs = Enrollment.objects.filter(course__instructor=u)
        enrolled_total = enrollments_qs.count()
        enrolled_recent = enrollments_qs.filter(enrolled_at__gte=since).count()
        completed_enrollments = enrollments_qs.filter(status=Enrollment.Status.COMPLETED).count()
        active_enrollments = enrollments_qs.filter(status=Enrollment.Status.ACTIVE).count()

        reviews_qs = CourseReview.objects.filter(course__instructor=u, is_public=True)
        rating_avg = reviews_qs.aggregate(
            v=Coalesce(
                Avg("rating", output_field=DecimalField(max_digits=5, decimal_places=2)),
                0,
                output_field=DecimalField(max_digits=5, decimal_places=2),
            )
        )["v"] or 0
        rating_count = reviews_qs.count()

        payments_qs = Payment.objects.filter(
            course_id__in=course_ids,
            status=Payment.Status.PAID
        )

        revenue_total = payments_qs.aggregate(
            v=Coalesce(
                Sum("amount", output_field=DecimalField(max_digits=12, decimal_places=2)),
                0,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )["v"] or 0

        revenue_recent = payments_qs.filter(created_at__gte=since).aggregate(
            v=Coalesce(
                Sum("amount", output_field=DecimalField(max_digits=12, decimal_places=2)),
                0,
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )["v"] or 0

        completion_avg = LessonProgress.objects.filter(
            enrollment__course__instructor=u
        ).aggregate(
            v=Coalesce(
                Avg("progress_percent", output_field=IntegerField()),
                0,
                output_field=IntegerField(),
            )
        )["v"] or 0

        unread_notifications = Notification.objects.filter(user=u, is_read=False).count()

        return Response({
            "range": f"{days}d",
            "courses_count": total_courses,
            "published_courses": published_courses,
            "review_courses": review_courses,
            "draft_courses": draft_courses,
            "archived_courses": archived_courses,
            "sections_count": total_sections,
            "lessons_count": total_lessons,
            "media_count": total_media,
            "enrolled_total": enrolled_total,
            "enrolled_recent": enrolled_recent,
            "active_enrollments": active_enrollments,
            "completed_enrollments": completed_enrollments,
            "rating_avg": round(float(rating_avg), 1),
            "rating_count": rating_count,
            "revenue_total": revenue_total,
            "revenue_month": revenue_recent,
            "completion_avg": int(completion_avg),
            "unread_notifications": unread_notifications,
        })

class InstructorReviewsView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        q = (request.query_params.get("q") or "").strip()
        limit = int(request.query_params.get("limit") or 50)

        qs = CourseReview.objects.filter(
            course__instructor=u,
            is_public=True
        ).select_related("course", "user").order_by("-created_at")

        if q:
            qs = qs.filter(
                Q(course__title__icontains=q) |
                Q(user__full_name__icontains=q) |
                Q(comment__icontains=q)
            )

        data = []
        for r in qs[:limit]:
            data.append({
                "id": r.id,
                "course_id": r.course_id,
                "course_title": r.course.title,
                "user_name": r.user.full_name or r.user.email,
                "rating": r.rating,
                "comment": r.comment,
                "created_at": r.created_at,
                "created_at_human": r.created_at.strftime("%d/%m/%Y %H:%M"),
            })

        return Response({"count": qs.count(), "results": data})


class InstructorPayoutsView(APIView):
    """
    Renvoie l'historique de paiements formateur.
    Si pas de modèle Payout => []
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        if Payout is None:
            return Response({"count": 0, "results": []})

        u = request.user
        limit = int(request.query_params.get("limit") or 50)

        qs = Payout.objects.filter(instructor=u).order_by("-created_at")
        data = []
        for p in qs[:limit]:
            data.append({
                "id": p.id,
                "ref": getattr(p, "reference", "") or getattr(p, "ref", "") or "",
                "amount": str(getattr(p, "amount", 0) or 0),
                "currency": getattr(p, "currency", "XOF"),
                "status": getattr(p, "status", "PENDING"),
                "created_at": getattr(p, "created_at", None),
            })

        return Response({"count": qs.count(), "results": data})


class InstructorNotificationsView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        u = request.user
        limit = int(request.query_params.get("limit") or 30)

        qs = Notification.objects.filter(user=u).order_by("-created_at")

        data = []
        for n in qs[:limit]:
            data.append({
                "id": n.id,
                "title": n.title,
                "body": n.body,
                "level": n.level,
                "is_read": n.is_read,
                "created_at": n.created_at,
                "time": n.created_at.strftime("%d/%m/%Y %H:%M"),
            })

        return Response({"count": qs.count(), "results": data})


class InstructorCourseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, course_id):
        course = _course_owned(course_id, request.user)
        return Response(CourseSerializer(course, context={"request": request}).data)


class InstructorCoursePublishView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        course = _course_owned(course_id, request.user)
        course.status = Course.Status.PUBLISHED
        course.save(update_fields=["status", "published_at", "updated_at"])
        return Response({"status": course.status})


class InstructorCourseArchiveView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        course = _course_owned(course_id, request.user)
        course.status = Course.Status.ARCHIVED
        course.save(update_fields=["status", "updated_at"])
        return Response({"status": course.status})


class InstructorSectionListView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, course_id):
        course = _course_owned(course_id, request.user)
        qs = CourseSection.objects.filter(course=course).order_by("order")
        data = CourseSectionSerializer(qs, many=True, context={"request": request}).data
        # include lessons_count
        for item, obj in zip(data, qs):
            item["lessons_count"] = obj.lessons.count()
        return Response(data)


class InstructorSectionCreateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id):
        course = _course_owned(course_id, request.user)
        title = request.data.get("title", "").strip()
        if not title:
            return Response({"detail": "title is required"}, status=400)
        max_order = CourseSection.objects.filter(course=course).aggregate(m=Max("order"))["m"] or 0
        section = CourseSection.objects.create(course=course, title=title, order=max_order + 1)
        return Response(CourseSectionSerializer(section).data, status=status.HTTP_201_CREATED)


class InstructorSectionUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        title = request.data.get("title", "").strip()
        if title:
            section.title = title
        section.save(update_fields=["title"])
        return Response(CourseSectionSerializer(section).data)


class InstructorSectionDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        section.delete()
        return Response({"ok": True})


class InstructorLessonListView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        qs = Lesson.objects.filter(section=section).order_by("order")
        return Response(LessonSerializer(qs, many=True, context={"request": request}).data)


class InstructorLessonCreateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)

        title = (request.data.get("title") or "").strip()
        lesson_type = (request.data.get("lesson_type") or Lesson.LessonType.VIDEO).strip()
        if not title:
            return Response({"detail": "title is required"}, status=400)

        max_order = Lesson.objects.filter(section=section).aggregate(m=Max("order"))["m"] or 0
        lesson = Lesson.objects.create(section=section, title=title, lesson_type=lesson_type, order=max_order + 1)
        return Response(LessonSerializer(lesson).data, status=201)


class InstructorLessonUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id, lesson_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        lesson = get_object_or_404(Lesson, id=lesson_id, section=section)

        for f in ["title", "lesson_type", "is_preview", "duration_sec", "video_url", "content"]:
            if f in request.data:
                setattr(lesson, f, request.data.get(f))
        lesson.save()
        return Response(LessonSerializer(lesson).data)


class InstructorLessonDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request, course_id, section_id, lesson_id):
        course = _course_owned(course_id, request.user)
        section = get_object_or_404(CourseSection, id=section_id, course=course)
        lesson = get_object_or_404(Lesson, id=lesson_id, section=section)
        lesson.delete()
        return Response({"ok": True})


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=getattr(settings, "MINIO_ENDPOINT_URL", None),
        aws_access_key_id=getattr(settings, "MINIO_ACCESS_KEY", None),
        aws_secret_access_key=getattr(settings, "MINIO_SECRET_KEY", None),
        region_name=getattr(settings, "MINIO_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
        verify=getattr(settings, "MINIO_SECURE", False),
    )


def build_object_key(user_id: int, kind: str, filename: str) -> str:
    prefix = getattr(settings, "MINIO_UPLOAD_PREFIX", "instructors")
    ext = ""
    if "." in filename:
        ext = "." + filename.split(".")[-1].lower()[:10]
    return f"{prefix}/{user_id}/{kind}/{uuid.uuid4().hex}{ext}"


class MediaUploadInitView(APIView):
    """
    POST /api/media/upload/init/
    -> retourne { upload_id, bucket, object_key, upload_url (PUT), headers }
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    def post(self, request):
        ser = MediaUploadInitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET is not configured"}, status=500)

        object_key = build_object_key(request.user.id, data["kind"], data["filename"])
        client = s3_client()

        # Presigned PUT (15 min)
        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": bucket,
                "Key": object_key,
                "ContentType": data["content_type"],
            },
            ExpiresIn=60 * 15,
        )

        return Response({
            "upload_id": uuid.uuid4().hex,  # tracking côté front
            "bucket": bucket,
            "object_key": object_key,
            "upload_url": upload_url,
            "method": "PUT",
            # ✅ front attend "headers"
            "headers": {
                "Content-Type": data["content_type"],
            },
        })


class MediaUploadFinalizeView(APIView):
    """
    POST /api/media/upload/finalize/
    -> crée MediaAsset, optionnellement attache à une Lesson via Lesson.media_asset
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    @transaction.atomic
    def post(self, request):
        ser = MediaUploadFinalizeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        bucket = getattr(settings, "MINIO_BUCKET", None)
        if not bucket:
            return Response({"detail": "MINIO_BUCKET is not configured"}, status=500)

        # ✅ Vérifier que l'objet existe réellement dans MinIO et récupérer la taille/type
        client = s3_client()
        try:
            head = client.head_object(Bucket=bucket, Key=data["object_key"])
        except Exception:
            raise ValidationError(
                {"object_key": "Object not found in MinIO (head_object failed). Upload may have failed."})

        remote_size = int(head.get("ContentLength") or 0)
        remote_type = head.get("ContentType") or data["content_type"]

        # Tolérance : si l’écart est énorme, on bloque
        if remote_size <= 0:
            raise ValidationError({"size": "Remote size invalid (0)."})
        if abs(remote_size - int(data["size"])) > 1024 * 1024 * 5:  # 5MB tolérance
            raise ValidationError({"size": f"Size mismatch. local={data['size']} remote={remote_size}"})

        # ✅ Eviter doublons object_key (unique=True)
        asset, created = MediaAsset.objects.get_or_create(
            object_key=data["object_key"],
            defaults=dict(
                owner=request.user,
                kind=data["kind"],
                title=(data.get("title") or ""),
                content_type=remote_type,
                size=remote_size,
                duration_seconds=data.get("duration_seconds"),
            )
        )

        # Si l’asset existe déjà mais owner différent => interdit
        if not created and asset.owner_id != request.user.id and request.user.role != "SUPERADMIN":
            return Response({"detail": "Forbidden: object_key already owned by another user."}, status=403)

        # ✅ Bind optionnel vers une lesson (recommandé, plus propre que video_url="s3://...")
        bind = data.get("bind")
        if bind:
            course = get_object_or_404(Course, id=bind["course_id"])
            if course.instructor_id != request.user.id and request.user.role != "SUPERADMIN":
                return Response({"detail": "Forbidden: course not owned"}, status=403)

            section = get_object_or_404(CourseSection, id=bind["section_id"], course=course)
            lesson = get_object_or_404(Lesson, id=bind["lesson_id"], section=section)

            # Attacher
            lesson.media_asset = asset

            # Ajuster le type de lesson si nécessaire
            if asset.kind == "video":
                lesson.lesson_type = Lesson.LessonType.VIDEO
            elif asset.kind == "audio":
                # tu n'as pas AUDIO dans LessonType → on mappe en FILE
                lesson.lesson_type = Lesson.LessonType.FILE
            else:
                lesson.lesson_type = Lesson.LessonType.FILE

            lesson.save(update_fields=["media_asset", "lesson_type"])

        return Response({
            "id": str(asset.id),
            "kind": asset.kind,
            "title": asset.title,
            "object_key": asset.object_key,
            "content_type": asset.content_type,
            "size": asset.size,
            "duration_seconds": asset.duration_seconds,
            "created_at": asset.created_at,
        }, status=201)


class MediaSignedGetView(APIView):
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request, asset_id):
        asset = get_object_or_404(MediaAsset, id=asset_id)

        if asset.owner_id != request.user.id and request.user.role != "SUPERADMIN":
            return Response({"detail": "Forbidden"}, status=403)

        bucket = getattr(settings, "MINIO_BUCKET", None)
        client = s3_client()

        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": asset.object_key},
            ExpiresIn=60 * 10,  # 10 minutes
        )
        return Response({"url": url})


class InstructorMediaListView(APIView):
    """
    GET /api/instructor/media/?kind=video|audio|doc
    -> liste les MediaAsset du formateur connecté
    """
    permission_classes = [IsAuthenticated, IsInstructor]

    def get(self, request):
        qs = MediaAsset.objects.filter(owner=request.user).order_by("-created_at")

        kind = request.query_params.get("kind")
        if kind in ("video", "audio", "doc"):
            qs = qs.filter(kind=kind)

        ser = MediaAssetListSerializer(qs[:200], many=True)  # limite simple
        return Response(ser.data)


# ---------- Helpers ----------
def _range_to_days(r: str) -> int:
    r = (r or "30d").lower().strip()
    return {"7d": 7, "30d": 30, "90d": 90}.get(r, 30)


class LearnerBaseAPIView(APIView):
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]  # ✅ évite TemplateDoesNotExist (browsable api)


# ---------- /api/learner/me/ ----------
class LearnerMeView(LearnerBaseAPIView):
    def get(self, request):
        u = request.user
        return Response({
            "id": u.id,
            "email": getattr(u, "email", "") or "",
            "full_name": getattr(u, "full_name", "") or getattr(u, "get_full_name", lambda: "")() or "",
            "phone": getattr(u, "phone", "") or "",
            "role": getattr(u, "role", None),
            "is_staff": bool(getattr(u, "is_staff", False)),
        })


# ---------- /api/learner/kpis/ ----------
class LearnerKpisView(LearnerBaseAPIView):
    """
    KPIs apprenant (inscriptions, progression, cours complétés, note moyenne donnée, etc.)
    """

    def get(self, request):
        days = _range_to_days(request.query_params.get("range", "30d"))
        since = timezone.now() - timedelta(days=days)
        u = request.user

        # defaults safe
        enrolled_total = 0
        enrolled_recent = 0
        completed_total = 0
        progress_avg = None
        hours_watched = 0  # si tu as duration/sec dans progress

        if Enrollment is not None:
            try:
                # hypothèse: Enrollment(user, course, created_at, status/progress...)
                base = Enrollment.objects.filter(user=u)

                enrolled_total = base.count()
                try:
                    enrolled_recent = base.filter(created_at__gte=since).count()
                except Exception:
                    enrolled_recent = 0

                # "completed"
                # - si tu as un champ status="COMPLETED" ou progress_percent=100
                try:
                    completed_total = base.filter(status__in=["COMPLETED", "DONE"]).count()
                except Exception:
                    try:
                        completed_total = base.filter(progress_percent__gte=100).count()
                    except Exception:
                        completed_total = 0
            except Exception:
                pass

        if LessonProgress is not None:
            try:
                # hypothèse: LessonProgress(user, lesson, percent or is_completed, watched_seconds)
                qs = LessonProgress.objects.filter(user=u)
                # moyenne % si champ percent existe
                try:
                    progress_avg = qs.aggregate(a=Avg("percent"))["a"]
                except Exception:
                    progress_avg = None
                try:
                    hours_watched = int((qs.aggregate(s=Count("watched_seconds"))["s"] or 0) / 3600)
                except Exception:
                    hours_watched = 0
            except Exception:
                pass

        rating_avg_given = None
        if Review is not None:
            try:
                rating_avg_given = Review.objects.filter(user=u).aggregate(a=Avg("rating"))["a"]
            except Exception:
                rating_avg_given = None

        return Response({
            "range": f"{days}d",
            "enrollments": {
                "total": enrolled_total,
                "recent": enrolled_recent,
                "completed": completed_total,
            },
            "progress": {
                "avg_percent": progress_avg,  # ex: 63.4
                "hours_watched_est": hours_watched,
            },
            "reviews": {
                "avg_rating_given": rating_avg_given,
            }
        })


# ---------- /api/learner/enrollments/ ----------
class LearnerEnrollmentsView(LearnerBaseAPIView):
    """
    Liste des cours suivis par l'apprenant.
    Paramètres GET: q, status, limit

    POST: inscription à un cours.
    Payload: { "course_id": 123 }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        q = (request.query_params.get("q") or "").strip()
        status_param = (request.query_params.get("status") or "").strip()
        limit = int(request.query_params.get("limit") or 100)

        if Enrollment is None or Course is None:
            return Response({"count": 0, "results": []})

        qs = Enrollment.objects.filter(user=u).select_related("course").order_by("-id")

        if status_param:
            try:
                qs = qs.filter(status=status_param)
            except Exception:
                pass

        if q:
            try:
                qs = qs.filter(
                    Q(course__title__icontains=q) |
                    Q(course__subtitle__icontains=q) |
                    Q(course__description__icontains=q)
                )
            except Exception:
                pass

        results = []
        for e in qs[:limit]:
            c = getattr(e, "course", None)
            if not c:
                continue

            thumb = getattr(c, "thumbnail_url", None)
            if not thumb and getattr(c, "thumbnail", None):
                thumb = getattr(getattr(c, "thumbnail", None), "url", None)

            results.append({
                "enrollment_id": e.id,
                "course": {
                    "id": c.id,
                    "title": getattr(c, "title", "") or "",
                    "subtitle": getattr(c, "subtitle", "") or "",
                    "thumbnail_url": thumb,
                    "status": getattr(c, "status", None),
                    "pricing_type": getattr(c, "pricing_type", None),
                    "price": getattr(c, "price", None),
                    "currency": getattr(c, "currency", "XOF"),
                },
                "status": getattr(e, "status", None),
                "progress_percent": getattr(e, "progress_percent", None),
                "created_at": getattr(e, "created_at", None),
            })

        return Response({"count": qs.count(), "results": results})

    def post(self, request):
        if Enrollment is None or Course is None:
            return Response(
                {"detail": "Enrollment/Course non disponibles."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        raw_id = request.data.get("course_id") or request.data.get("id") or request.data.get("course")
        try:
            course_id = int(raw_id)
        except Exception:
            return Response({"detail": "course_id invalide."}, status=status.HTTP_400_BAD_REQUEST)

        course = get_object_or_404(Course, id=course_id)

        # Champs réels du modèle Enrollment
        field_names = {f.name for f in Enrollment._meta.fields}

        defaults = {}
        # ⚠️ mets une valeur qui existe dans tes choices, sinon commente ce bloc
        if "status" in field_names:
            # essaie plusieurs constantes si tu en as
            defaults["status"] = (
                    getattr(Enrollment, "STATUS_ACTIVE", None)
                    or getattr(Enrollment, "STATUS_ENROLLED", None)
                    or getattr(Enrollment, "STATUS_PENDING", None)
                    or "ACTIVE"  # <- à adapter si besoin
            )
        if "progress_percent" in field_names:
            defaults["progress_percent"] = 0

        # IMPORTANT: ne PAS setter created_at (souvent auto_now_add / non éditable)
        # if "created_at" in field_names:  # ❌ évite
        #     defaults["created_at"] = timezone.now()

        try:
            with transaction.atomic():
                enrollment, created = Enrollment.objects.get_or_create(
                    user=request.user,
                    course=course,
                    defaults=defaults
                )
        except IntegrityError:
            # race condition: quelqu’un a créé entre temps
            enrollment = Enrollment.objects.filter(user=request.user, course=course).first()
            created = False

        if not enrollment:
            return Response(
                {"detail": "Impossible de créer l'inscription."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                "enrollment_id": enrollment.id,
                "course_id": course.id,
                "created": bool(created),
                "detail": "Inscription effectuée." if created else "Déjà inscrit."
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

# ---------- /api/learner/courses/<id>/ ----------
class LearnerCourseDetailView(LearnerBaseAPIView):
    def get(self, request, course_id: int):
        if Course is None:
            return Response({"detail": "Course model not available."}, status=404)

        try:
            c = Course.objects.get(id=course_id)
        except Exception:
            return Response({"detail": "Not found."}, status=404)

        # Optionnel: vérifier que user est inscrit
        if Enrollment is not None:
            try:
                if not Enrollment.objects.filter(user=request.user, course=c).exists():
                    return Response({"detail": "Not enrolled."}, status=403)
            except Exception:
                pass

        # stats simples
        sections_count = getattr(c, "sections_count", None)
        lessons_count = getattr(c, "lessons_count", None)

        return Response({
            "id": c.id,
            "title": getattr(c, "title", "") or "",
            "subtitle": getattr(c, "subtitle", "") or "",
            "description": getattr(c, "description", "") or "",
            "status": getattr(c, "status", None),
            "pricing_type": getattr(c, "pricing_type", None),
            "price": getattr(c, "price", None),
            "currency": getattr(c, "currency", "XOF"),
            "thumbnail_url": getattr(c, "thumbnail_url", None) or getattr(c, "thumbnail", None) and getattr(
                getattr(c, "thumbnail", None), "url", None),
            "sections_count": sections_count,
            "lessons_count": lessons_count,
        })


# ---------- /api/learner/courses/<id>/progress/ ----------
class LearnerCourseProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lessons_qs = Lesson.objects.filter(section__course=course).only("id", "title")
        total_lessons = lessons_qs.count()

        # ✅ garantir qu’on a une ligne LessonProgress pour chaque leçon
        lesson_ids = list(lessons_qs.values_list("id", flat=True))
        existing = set(
            LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lesson_ids)
            .values_list("lesson_id", flat=True)
        )
        missing = [lid for lid in lesson_ids if lid not in existing]
        if missing:
            LessonProgress.objects.bulk_create([
                LessonProgress(enrollment=enrollment, lesson_id=lid, progress_percent=0, completed=False, last_position_sec=0)
                for lid in missing
            ], ignore_conflicts=True)

        lp_qs = LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lesson_ids)

        # ✅ stats globales
        completed_lessons = lp_qs.filter(completed=True).count()
        avg_percent = lp_qs.aggregate(a=Avg("progress_percent"))["a"] or 0
        course_percent = int(round(avg_percent))

        # ✅ détails leçons (jamais null)
        lessons_payload = []
        lps = {p.lesson_id: p for p in lp_qs.select_related("lesson")}
        for l in lessons_qs:
            p = lps.get(l.id)
            lessons_payload.append({
                "lesson_id": l.id,
                "lesson_title": l.title,
                "percent": int(p.progress_percent or 0),
                "is_completed": bool(p.completed),
                "updated_at": p.updated_at if p else None,
            })

        return Response({
            "course_id": course.id,
            "progress_percent": course_percent,
            "completed_lessons": completed_lessons,
            "total_lessons": total_lessons,
            "lessons": lessons_payload
        })


# ---------- /api/learner/notifications/ ----------
class LearnerNotificationsView(LearnerBaseAPIView):
    def get(self, request):
        if Notification is None:
            return Response({"count": 0, "results": []})

        u = request.user
        limit = int(request.query_params.get("limit") or 50)

        try:
            qs = Notification.objects.filter(user=u).order_by("-created_at")
        except Exception:
            # si ton Notification n'a pas user, adapte ici
            return Response({"count": 0, "results": []})

        results = []
        for n in qs[:limit]:
            results.append({
                "id": n.id,
                "title": getattr(n, "title", "") or "",
                "body": getattr(n, "body", "") or getattr(n, "message", "") or "",
                "time": getattr(n, "created_at", None),
                "is_read": bool(getattr(n, "is_read", False)),
            })
        return Response({"count": qs.count(), "results": results})


# ---------- /api/learner/payments/ (optionnel) ----------
class LearnerPaymentsView(LearnerBaseAPIView):
    def get(self, request):
        if Payment is None:
            return Response({"count": 0, "results": []})

        u = request.user
        limit = int(request.query_params.get("limit") or 100)

        try:
            qs = Payment.objects.filter(user=u).order_by("-created_at")
        except Exception:
            return Response({"count": 0, "results": []})

        results = []
        for p in qs[:limit]:
            results.append({
                "id": p.id,
                "ref": getattr(p, "ref", None) or getattr(p, "reference", None) or str(p.id),
                "date": getattr(p, "created_at", None),
                "amount": getattr(p, "amount", None),
                "currency": getattr(p, "currency", "XOF"),
                "status": getattr(p, "status", None),
                "status_label": getattr(p, "status_label", None) or getattr(p, "status", None),
            })
        return Response({"count": qs.count(), "results": results})


class LearnerProgressView(APIView):
    """
    Progression de l'apprenant:
    - Global: cours suivis, cours terminés, % moyen
    - Par cours: completion_rate, lessons_done, lessons_total, last_activity
    Robuste: si LessonProgress / Enrollment n'existent pas => renvoie vide sans crash.
    """
    permission_classes = [IsAuthenticated]  # + RoleRequired côté URL si tu veux

    def get(self, request):
        user = request.user
        days = _range_to_days(request.query_params.get("range", "30d"))
        since = timezone.now() - timedelta(days=days)

        # -----------------------------
        # 1) Si pas de modèles -> safe
        # -----------------------------
        if Enrollment is None:
            return Response({
                "range": f"{days}d",
                "summary": {
                    "courses_enrolled": 0,
                    "courses_completed": 0,
                    "avg_completion": 0,
                    "lessons_done": 0,
                    "lessons_total": 0,
                    "last_activity": None,
                },
                "results": []
            })

        # -----------------------------
        # 2) Enrollments de l'apprenant
        # -----------------------------
        enrollments_qs = Enrollment.objects.filter(user=user).select_related("course")

        # Recherche (optionnelle) par titre cours
        q = (request.query_params.get("q") or "").strip()
        if q:
            enrollments_qs = enrollments_qs.filter(course__title__icontains=q)

        # Pagination simple
        limit = int(request.query_params.get("limit") or 50)
        offset = int(request.query_params.get("offset") or 0)

        enrollments = list(enrollments_qs.order_by("-created_at")[offset:offset + limit])

        # -----------------------------
        # 3) Si LessonProgress indispo -> return minimal
        # -----------------------------
        if LessonProgress is None:
            results = []
            for e in enrollments:
                c = e.course
                results.append({
                    "course_id": c.id,
                    "course_title": getattr(c, "title", ""),
                    "course_status": getattr(c, "status", None),
                    "enrolled_at": getattr(e, "created_at", None),
                    "completion_rate": 0,
                    "lessons_done": 0,
                    "lessons_total": getattr(c, "lessons_count", None) or 0,  # si tu exposes déjà
                    "last_activity": None,
                })

            return Response({
                "range": f"{days}d",
                "summary": {
                    "courses_enrolled": enrollments_qs.count(),
                    "courses_completed": 0,
                    "avg_completion": 0,
                    "lessons_done": 0,
                    "lessons_total": 0,
                    "last_activity": None,
                },
                "results": results
            })

        # -----------------------------
        # 4) Calcul progression par cours
        # -----------------------------
        # On suppose LessonProgress contient:
        # - user
        # - lesson (FK)
        # - lesson.course (ou lesson.section.course)
        # - is_completed bool
        # - updated_at datetime
        #
        # 👉 Si ta structure diffère, je te donne l’adaptation juste après.

        # Récupère les courses ids
        course_ids = [e.course_id for e in enrollments]

        # Progress rows pour ce user & courses
        # ⚠️ adapte le filtre si ton modèle est diff
        lp_qs = LessonProgress.objects.filter(
            user=user,
            course_id__in=course_ids  # si tu as course FK direct
        )

        # Si tu n’as pas course_id direct sur LessonProgress:
        # lp_qs = LessonProgress.objects.filter(user=user, lesson__section__course_id__in=course_ids)

        # completions par course
        done_map = {}
        last_activity_map = {}

        for row in lp_qs.values("course_id").annotate(
                done=Count("id", filter=Q(is_completed=True)),
                last=Count("id")  # dummy to allow annotate; we'll compute last separately if needed
        ):
            done_map[row["course_id"]] = row["done"] or 0

        # Last activity (updated_at max)
        for row in lp_qs.values("course_id").annotate(last_activity=timezone.now()):
            # ✅ on remplace proprement par un aggregate Max si tu veux
            pass

        # ➕ On fait un vrai Max (plus safe)
        from django.db.models import Max
        for row in lp_qs.values("course_id").annotate(last_activity=Max("updated_at")):
            last_activity_map[row["course_id"]] = row["last_activity"]

        # lessons_total : dépend si tu as Lesson model
        try:
            from catalog.models import Lesson
        except Exception:
            Lesson = None

        total_map = {}
        if Lesson is not None:
            # suppose Lesson a FK -> section -> course
            totals = Lesson.objects.filter(section__course_id__in=course_ids).values("section__course_id").annotate(
                t=Count("id"))
            for r in totals:
                total_map[r["section__course_id"]] = r["t"] or 0
        else:
            # fallback: si Course a lessons_count
            for e in enrollments:
                total_map[e.course_id] = getattr(e.course, "lessons_count", None) or 0

        results = []
        total_courses_completed = 0
        sum_completion = 0
        sum_done = 0
        sum_total = 0
        global_last = None

        for e in enrollments:
            c = e.course
            done = int(done_map.get(c.id, 0))
            total = int(total_map.get(c.id, 0))
            completion = int(round((done / total) * 100)) if total > 0 else 0

            last_activity = last_activity_map.get(c.id)
            if last_activity and (global_last is None or last_activity > global_last):
                global_last = last_activity

            if total > 0 and done >= total:
                total_courses_completed += 1

            sum_completion += completion
            sum_done += done
            sum_total += total

            results.append({
                "course_id": c.id,
                "course_title": getattr(c, "title", ""),
                "course_status": getattr(c, "status", None),
                "enrolled_at": getattr(e, "created_at", None),
                "completion_rate": completion,
                "lessons_done": done,
                "lessons_total": total,
                "last_activity": last_activity,
            })

        avg_completion = int(round(sum_completion / len(results))) if results else 0

        return Response({
            "range": f"{days}d",
            "summary": {
                "courses_enrolled": enrollments_qs.count(),
                "courses_completed": total_courses_completed,
                "avg_completion": avg_completion,
                "lessons_done": sum_done,
                "lessons_total": sum_total,
                "last_activity": global_last,
            },
            "results": results
        })


# OPTIONAL: Enrollment peut ne pas exister au début => on renvoie 501 clair
try:
    from enrollments.models import Enrollment
except Exception:  # pragma: no cover
    Enrollment = None


def _safe_get(obj, attr, default=""):
    try:
        v = getattr(obj, attr)
        return v if v is not None else default
    except Exception:
        return default


# def _course_to_dict(course, request=None, is_enrolled=False, enrolled_at=None):
#     """
#     Normalise la réponse: n'explose pas si certains champs n'existent pas encore.
#     """
#     # thumbnail_url: si tu as ImageField "thumbnail" et MEDIA_URL servi
#     thumb_url = ""
#     try:
#         if getattr(course, "thumbnail", None):
#             thumb_url = course.thumbnail.url
#     except Exception:
#         thumb_url = ""
#
#     price = _safe_get(course, "price", 0) or 0
#     currency = _safe_get(course, "currency", "XOF") or "XOF"
#
#     return {
#         "id": course.id,
#         "title": _safe_get(course, "title", ""),
#         "subtitle": _safe_get(course, "subtitle", ""),
#         "description": _safe_get(course, "description", ""),
#         "course_type": _safe_get(course, "course_type", None),
#         "pricing_type": _safe_get(course, "pricing_type", "PAID"),
#         "price": price,
#         "currency": currency,
#         "status": _safe_get(course, "status", None),
#         "thumbnail_url": thumb_url,
#         "preview_video_url": _safe_get(course, "preview_video_url", ""),
#         "instructor": {
#             "id": getattr(getattr(course, "instructor", None), "id", None),
#             "full_name": _safe_get(getattr(course, "instructor", None), "full_name", "") or _safe_get(
#                 getattr(course, "instructor", None), "email", ""),
#         },
#         # métriques optionnelles si existantes
#         "rating_avg": _safe_get(course, "rating_avg", None),
#         "rating_count": _safe_get(course, "rating_count", None),
#         "enrolled_count": _safe_get(course, "enrolled_count", None),
#
#         # learner
#         "is_enrolled": bool(is_enrolled),
#         "enrolled_at": enrolled_at,
#     }
def _initials(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return "F"
    parts = [p for p in name.split() if p]
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()

def _iso(dt):
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return None
def _course_to_dict(course, request=None, is_enrolled=False, enrolled_at=None):
    """
    Normalise la réponse: compatible avec le front (cards + detail page).
    """
    # thumbnail_url
    thumb_url = ""
    try:
        if getattr(course, "thumbnail", None):
            thumb_url = course.thumbnail.url
    except Exception:
        thumb_url = ""

    price = _safe_get(course, "price", 0) or 0
    currency = _safe_get(course, "currency", "XOF") or "XOF"

    # instructor
    instr = getattr(course, "instructor", None)
    instructor_name = (
        _safe_get(instr, "full_name", "") or
        f"{getattr(instr, 'first_name', '')} {getattr(instr, 'last_name', '')}".strip() or
        _safe_get(instr, "email", "") or
        "Formateur"
    )
    instructor_initials = _initials(instructor_name)

    # URLs (✅ clé pour activer la vue détails)
    detail_url = ""
    try:
        detail_url = reverse("course_detail", args=[course.id])  # page HTML /courses/<id>/
    except Exception:
        detail_url = f"/courses/{course.id}/"

    # preview = même chose par défaut
    preview_url = detail_url

    # enroll/continue (optionnel, si tu as des routes dédiées)
    enroll_url = detail_url
    continue_url = detail_url
    try:
        enroll_url = reverse("course_enroll", args=[course.id])
    except Exception:
        pass
    try:
        continue_url = reverse("course_learn", args=[course.id])
    except Exception:
        pass

    # dates
    published_at = _safe_get(course, "published_at", None) or _safe_get(course, "created_at", None)
    updated_at = _safe_get(course, "updated_at", None)

    # labels (si tu as des get_FOO_display() / properties)
    course_type_label = ""
    try:
        course_type_label = course.get_course_type_display()
    except Exception:
        course_type_label = str(_safe_get(course, "course_type", "") or "")

    pricing_type_label = ""
    try:
        pricing_type_label = course.get_pricing_type_display()
    except Exception:
        pricing_type_label = str(_safe_get(course, "pricing_type", "") or "")

    level = _safe_get(course, "level", "") or ""
    level_label = ""
    try:
        level_label = course.get_level_display()
    except Exception:
        level_label = level

    # category
    category = getattr(course, "category", None)
    category_name = _safe_get(category, "name", "") if category else ""

    # rating compat: ton front lit course.rating (pas rating_avg)
    rating_avg = _safe_get(course, "rating_avg", None)
    rating = rating_avg if rating_avg is not None else _safe_get(course, "rating", None)

    return {
        "id": course.id,
        "title": _safe_get(course, "title", ""),
        "subtitle": _safe_get(course, "subtitle", ""),
        "description": _safe_get(course, "description", ""),
        "course_type": _safe_get(course, "course_type", None),
        "course_type_label": course_type_label,
        "pricing_type": _safe_get(course, "pricing_type", "PAID"),
        "pricing_type_label": pricing_type_label,
        "price": price,
        "currency": currency,
        "status": _safe_get(course, "status", None),
        "thumbnail_url": thumb_url,
        "preview_video_url": _safe_get(course, "preview_video_url", ""),

        # ✅ pour tes cartes Udemy-like
        "detail_url": detail_url,
        "preview_url": preview_url,
        "enroll_url": enroll_url,
        "continue_url": continue_url if is_enrolled else None,

        # dates (le front utilise published_at)
        "published_at": _iso(published_at),
        "updated_at": _iso(updated_at),
        "price_period": _safe_get(course, "price_period", "cours"),

        # category (ton front lit category_name)
        "category_name": category_name,

        # instructor (ton front lit instructor_name / initials)
        "instructor": {
            "id": getattr(instr, "id", None),
            "full_name": instructor_name,
        },
        "instructor_name": instructor_name,
        "instructor_initials": instructor_initials,

        # rating compat (ton front lit rating)
        "rating_avg": rating_avg,
        "rating_count": _safe_get(course, "rating_count", None),
        "rating": rating,

        "enrolled_count": _safe_get(course, "enrolled_count", 0) or 0,

        # learner
        "is_enrolled": bool(is_enrolled),
        "enrolled_at": _iso(enrolled_at),
    }

def _get_enrollment(user, course):
    return Enrollment.objects.filter(user=user, course=course).first()
def ensure_lesson_progress(enrollment, course):
    """
    Crée les LessonProgress manquants pour ce enrollment/course.
    """
    lessons_qs = Lesson.objects.filter(section__course=course).only("id")
    lesson_ids = list(lessons_qs.values_list("id", flat=True))

    existing = set(
        LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lesson_ids)
        .values_list("lesson_id", flat=True)
    )
    missing = [lid for lid in lesson_ids if lid not in existing]
    if missing:
        LessonProgress.objects.bulk_create([
            LessonProgress(
                enrollment=enrollment,
                lesson_id=lid,
                progress_percent=0,
                completed=False,
                last_position_sec=0
            )
            for lid in missing
        ], ignore_conflicts=True)
class LearnerCoursePlayerDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        # sections + lessons
        sections = CourseSection.objects.filter(course=course).prefetch_related("lessons").order_by("order")
        lessons_qs = Lesson.objects.filter(section__course=course).select_related("section").order_by("section__order", "order")

        # progress map
        lesson_ids = list(lessons_qs.values_list("id", flat=True))
        ensure_lesson_progress(enrollment, course)

        prog = {
            p.lesson_id: p
            for p in LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lesson_ids)
        }

        # current lesson = la première non complétée, sinon la dernière
        current_lesson = None
        for l in lessons_qs:
            p = prog.get(l.id)
            if p and not p.completed:
                current_lesson = l
                break
        if current_lesson is None:
            current_lesson = lessons_qs.first()

        payload_sections = []
        for s in sections:
            s_lessons = []
            for l in s.lessons.all().order_by("order"):
                p = prog.get(l.id)
                s_lessons.append({
                    "id": l.id,
                    "title": l.title,
                    "lesson_type": l.lesson_type,
                    "duration_sec": l.duration_sec,
                    "is_preview": bool(l.is_preview),
                    "progress_percent": int((p.progress_percent if p else 0) or 0),
                    "completed": bool(p.completed) if p else False,
                })

            payload_sections.append({
                "id": s.id,
                "title": s.title,
                "order": s.order,
                "lessons": s_lessons
            })

        return Response({
            "course": {"id": course.id, "title": course.title},
            "current_lesson_id": current_lesson.id if current_lesson else None,
            "sections": payload_sections
        })
    
class LearnerMediaSignedGetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        asset = get_object_or_404(MediaAsset, id=asset_id)

        # Vérifier que l'apprenant a accès via une inscription
        # On check si une Lesson de ce MediaAsset appartient à un Course où il est inscrit
        lesson = Lesson.objects.filter(media_asset=asset).select_related("section__course").first()
        if not lesson:
            return Response({"detail": "Asset non attaché à une leçon."}, status=404)

        course = lesson.section.course
        enrollment = Enrollment.objects.filter(user=request.user, course=course).first()
        if not enrollment and not lesson.is_preview:
            return Response({"detail": "Inscription requise."}, status=403)

        bucket = getattr(settings, "MINIO_BUCKET", None)
        client = s3_client()
        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": asset.object_key},
            ExpiresIn=60 * 10,
        )
        return Response({"url": url})
class LearnerExploreCoursesView(APIView):
    """
    GET /api/learner/courses/
    Filtres:
    - q: recherche titre/description
    - type: course_type
    - pricing: pricing_type (FREE/PAID/HYBRID)
    - mine=1 -> renvoie seulement les cours où l'apprenant est inscrit
    Pagination:
    - limit (default 20)
    - offset (default 0)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        course_type = (request.query_params.get("type") or "").strip()
        pricing = (request.query_params.get("pricing") or "").strip()
        mine = (request.query_params.get("mine") or "").strip() in ("1", "true", "yes")

        limit = int(request.query_params.get("limit") or 20)
        offset = int(request.query_params.get("offset") or 0)

        # ⚠️ On explore uniquement les cours publiés par défaut
        # adapte selon ton enum Course.Status.PUBLISHED
        qs = Course.objects.all()

        # si ton Course a un enum Status: Course.Status.PUBLISHED
        # sinon garder string "PUBLISHED"
        try:
            qs = qs.filter(status=Course.Status.PUBLISHED)
        except Exception:
            qs = qs.filter(status="PUBLISHED")

        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q) | Q(subtitle__icontains=q))

        if course_type:
            qs = qs.filter(course_type=course_type)

        if pricing:
            qs = qs.filter(pricing_type=pricing)

        enrolled_map = {}
        if Enrollment is not None:
            enroll_qs = Enrollment.objects.filter(user=request.user)
            enrolled_map = {e.course_id: e for e in enroll_qs}

            if mine:
                qs = qs.filter(id__in=enrolled_map.keys())

        total = qs.count()
        items = list(qs.order_by("-updated_at")[offset:offset + limit])

        results = []
        for c in items:
            e = enrolled_map.get(c.id)
            results.append(_course_to_dict(
                c,
                request=request,
                is_enrolled=bool(e),
                enrolled_at=getattr(e, "created_at", None) if e else None
            ))

        return Response({
            "count": total,
            "limit": limit,
            "offset": offset,
            "results": results
        })


class LearnerCourseDetailView(APIView):
    """
    GET /api/learner/courses/<course_id>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        try:
            course = Course.objects.select_related("instructor").get(id=course_id)
        except Course.DoesNotExist:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # Bloque le détail si pas publié (sauf si tu veux permettre preview)
        try:
            is_published = (course.status == Course.Status.PUBLISHED)
        except Exception:
            is_published = (course.status == "PUBLISHED")

        if not is_published:
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

        is_enrolled = False
        enrolled_at = None
        if Enrollment is not None:
            e = Enrollment.objects.filter(user=request.user, course=course).first()
            is_enrolled = bool(e)
            enrolled_at = getattr(e, "created_at", None) if e else None

        return Response(_course_to_dict(course, request=request, is_enrolled=is_enrolled, enrolled_at=enrolled_at))


class LearnerEnrollView(APIView):
    """
    POST /api/learner/courses/<course_id>/enroll/
    - crée Enrollment si pas existant
    - renvoie {enrolled:true, created, enrollment_id, course_id}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        user = request.user

        # 1) course
        course = Course.objects.filter(id=course_id).first()
        if not course:
            return Response({"detail": "Cours introuvable."}, status=status.HTTP_404_NOT_FOUND)

        # 2) only published
        try:
            is_published = (course.status == Course.Status.PUBLISHED)
        except Exception:
            is_published = (getattr(course, "status", None) == "PUBLISHED")

        if not is_published:
            return Response(
                {"detail": "Cours non disponible pour inscription."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 3) defaults safe (évite created_at et ajoute status si le champ existe)
        defaults = {}
        if hasattr(Enrollment, "Status"):
            defaults["status"] = Enrollment.Status.ACTIVE
        elif "status" in [f.name for f in Enrollment._meta.fields]:
            defaults["status"] = "ACTIVE"

        # 4) create or return existing (anti race condition)
        try:
            with transaction.atomic():
                enrollment, created = Enrollment.objects.get_or_create(
                    user=user,
                    course=course,
                    defaults=defaults
                )
        except IntegrityError:
            # unique constraint a tapé (concurrence) -> on récupère l’existant
            enrollment = Enrollment.objects.filter(user=user, course=course).first()
            return Response(
                {
                    "enrolled": True,
                    "created": False,
                    "enrollment_id": enrollment.id if enrollment else None,
                    "course_id": course.id
                },
                status=status.HTTP_200_OK
            )
        except Exception as e:
            # au lieu d’un 500, on renvoie un message exploitable
            return Response(
                {"detail": "Erreur pendant l'inscription.", "error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "enrolled": True,
                "created": bool(created),
                "enrollment_id": enrollment.id,
                "course_id": course.id
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


def _get_enrollment(user, course) -> Enrollment:
    return Enrollment.objects.filter(user=user, course=course).first()


def _get_first_lesson(course: Course):
    return Lesson.objects.filter(section__course=course).order_by("section__order", "order", "id").first()


def _get_next_lesson(course: Course, current: Lesson):
    qs = Lesson.objects.filter(section__course=course).order_by("section__order", "order", "id")
    ids = list(qs.values_list("id", flat=True))
    if current.id not in ids:
        return ids[0] if ids else None
    idx = ids.index(current.id)
    if idx + 1 < len(ids):
        return Lesson.objects.get(id=ids[idx + 1])
    return None


def _course_is_published(course: Course) -> bool:
    try:
        return course.status == Course.Status.PUBLISHED
    except Exception:
        return getattr(course, "status", "") == "PUBLISHED"


def _get_enrollment(user, course) -> Enrollment:
    return Enrollment.objects.filter(user=user, course=course).first()


class LearnerCourseOutlineView(APIView):
    """
    GET /api/learner/courses/<course_id>/outline/
    -> sections + lessons + progress per lesson + % global
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        if not _course_is_published(course):
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Vous n'êtes pas inscrit à ce cours."}, status=status.HTTP_403_FORBIDDEN)

        lessons_qs = (
            Lesson.objects
            .filter(section__course=course)
            .select_related("section")
            .order_by("section__order", "order", "id")
        )

        # ✅ progress by enrollment
        progress_qs = LessonProgress.objects.filter(enrollment=enrollment, lesson__in=lessons_qs)
        progress_map = {p.lesson_id: p for p in progress_qs}

        total_lessons = lessons_qs.count()
        completed_lessons = sum(1 for p in progress_map.values() if p.completed)

        percent_global = round((completed_lessons / total_lessons) * 100) if total_lessons else 0

        # group by sections
        sections = CourseSection.objects.filter(course=course).prefetch_related("lessons").order_by("order", "id")

        out_sections = []
        for s in sections:
            out_lessons = []
            for l in s.lessons.all().order_by("order", "id"):
                p = progress_map.get(l.id)
                out_lessons.append({
                    "id": l.id,
                    "title": l.title,
                    "type": getattr(l, "lesson_type", None),
                    "duration_seconds": getattr(l, "duration_seconds", None),
                    "is_completed": bool(p.completed) if p else False,
                    "percent": int(float(p.progress_percent)) if p else 0,
                    "can_open": True,
                })
            out_sections.append({"id": s.id, "title": s.title, "lessons": out_lessons})

        # current lesson fallback
        first_lesson_id = lessons_qs.first().id if total_lessons else None
        current_id = getattr(enrollment, "current_lesson_id", None) or first_lesson_id

        return Response({
            "course": {"id": course.id, "title": getattr(course, "title", "")},
            "current_lesson_id": current_id,
            "progress": {
                "percent": percent_global,
                "completed_lessons": completed_lessons,
                "total_lessons": total_lessons
            },
            "sections": out_sections,
        })


class LearnerContinueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        if not _course_is_published(course):
            return Response({"detail": "Cours non disponible."}, status=status.HTTP_403_FORBIDDEN)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Vous n'êtes pas inscrit à ce cours."}, status=status.HTTP_403_FORBIDDEN)

        lessons = Lesson.objects.filter(section__course=course).order_by("section__order", "order", "id")
        if not lessons.exists():
            return Response({"detail": "Cours vide."}, status=status.HTTP_404_NOT_FOUND)

        if enrollment.current_lesson_id:
            lesson = Lesson.objects.filter(id=enrollment.current_lesson_id, section__course=course).first()
            if lesson:
                return Response({"lesson_id": lesson.id})

        completed_ids = set(
            LessonProgress.objects.filter(
                enrollment=enrollment,
                lesson__section__course=course,
                completed=True
            ).values_list("lesson_id", flat=True)
        )

        for lesson in lessons:
            if lesson.id not in completed_ids:
                enrollment.current_lesson = lesson
                enrollment.save(update_fields=["current_lesson", "updated_at"])
                return Response({"lesson_id": lesson.id})

        last = lessons.last()
        enrollment.current_lesson = last
        enrollment.status = Enrollment.Status.COMPLETED
        enrollment.completed_at = timezone.now()
        enrollment.save(update_fields=["current_lesson", "status", "completed_at", "updated_at"])
        return Response({"lesson_id": last.id, "course_completed": True})


class LearnerLessonStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id: int, lesson_id: int):
        course = get_object_or_404(Course, id=course_id)
        lesson = get_object_or_404(Lesson, id=lesson_id, section__course=course)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lp, _ = LessonProgress.objects.get_or_create(enrollment=enrollment, lesson=lesson)

        return Response({
            "lesson": {
                "id": lesson.id,
                "title": lesson.title,
                "type": lesson.lesson_type,
                "video_url": lesson.video_url,
                "content": lesson.content,
                "duration_seconds": lesson.duration_sec,
                "media_asset_id": str(lesson.media_asset_id) if lesson.media_asset_id else None,
            },
            "progress": {
                "percent": int(lp.progress_percent or 0),
                "is_completed": bool(lp.completed),
                "last_position_seconds": lp.last_position_sec,
                "updated_at": lp.updated_at,
            }
        })


class LearnerLessonProgressUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int, lesson_id: int):
        course = get_object_or_404(Course, id=course_id)
        lesson = get_object_or_404(Lesson, id=lesson_id, section__course=course)

        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lp, _ = LessonProgress.objects.get_or_create(enrollment=enrollment, lesson=lesson)

        percent = request.data.get("percent", None)
        last_pos = request.data.get("last_position_seconds", None)
        is_completed = request.data.get("is_completed", None)

        if percent is not None:
            try:
                p = int(percent)
                p = max(0, min(100, p))
                lp.progress_percent = p
            except Exception:
                pass

        if last_pos is not None:
            try:
                lp.last_position_sec = max(0, int(last_pos))
            except Exception:
                pass

        if is_completed is True or str(is_completed).lower() == "true":
            lp.mark_completed()

        lp.save()

        # recalcul rapide cours
        lessons_ids = Lesson.objects.filter(section__course=course).values_list("id", flat=True)
        lp_qs = LessonProgress.objects.filter(enrollment=enrollment, lesson_id__in=lessons_ids)

        completed_lessons = lp_qs.filter(completed=True).count()
        total_lessons = lp_qs.count()  # ou count lessons
        avg_percent = lp_qs.aggregate(a=Avg("progress_percent"))["a"] or 0
        course_percent = int(round(avg_percent))

        return Response({
            "ok": True,
            "lesson_id": lesson.id,
            "progress": {
                "percent": float(lp.progress_percent or 0),
                "is_completed": bool(lp.completed),
                "last_position_seconds": lp.last_position_sec
            },
            "course_progress": {
                "course_id": course.id,
                "progress_percent": course_percent,
                "completed_lessons": completed_lessons,
                "total_lessons": total_lessons
            }
        })


class LearnerSetCurrentLessonView(APIView):
    """
    POST /api/learner/courses/<course_id>/set-current/
    body: { lesson_id: int }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        course = get_object_or_404(Course, id=course_id)
        enrollment = _get_enrollment(request.user, course)
        if not enrollment:
            return Response({"detail": "Inscription requise."}, status=status.HTTP_403_FORBIDDEN)

        lesson_id = request.data.get("lesson_id")
        if not lesson_id:
            return Response({"detail": "lesson_id requis."}, status=status.HTTP_400_BAD_REQUEST)

        lesson = get_object_or_404(Lesson, id=int(lesson_id), section__course=course)
        enrollment.current_lesson = lesson
        enrollment.save(update_fields=["current_lesson", "updated_at"])
        return Response({"ok": True, "current_lesson_id": lesson.id})
