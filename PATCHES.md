# PATCHES — Modifications ponctuelles dans les god-modules

Ce fichier documente les correctifs à appliquer **en place** dans les gros
modules (`formations/views.py` ≈ 2 040 lignes ; `best_epargne/apis/views.py`
≈ 3 240 lignes ; `best_epargne/apis/permissions.py` ≈ 560 lignes).

Pour les fichiers entièrement réécrits ou neufs, voir les fichiers `.new`
adjacents et les fichiers nouvellement créés (`core/permissions.py`,
`enrollments/services.py`, etc.).

> Convention : les blocs `--- avant / +++ après` indiquent les lignes exactes
> à remplacer. La numérotation des lignes correspond à l'état au moment de
> l'audit (mai 2026) ; si vous avez modifié le fichier entretemps, retrouvez
> le bloc par recherche textuelle plutôt que par n° de ligne.

---

## 1. `formations/views.py:846-867` — `InstructorMediaDetailPageView`

### Findings traités
- **FORMATIONS-01** (Critique) : la vue est inaccessible — elle teste `role` qui n'existe plus.
- **FORMATIONS-02** (Important) : le scope ignore le partage org.

### Patch

```python
# REMPLACER ENTIÈREMENT LA CLASSE
class InstructorMediaDetailPageView(InstructorBaseMixin, TemplateView):
    template_name = "instructor/instructor_media_detail.html"

    def dispatch(self, request, *args, **kwargs):
        user = request.user
        if not (user.is_authenticated and user.is_active):
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.get_full_path())
        # CORRECTIF FORMATIONS-01 : on remplace getattr(user,"role",None) par
        # les vraies properties / helpers du nouveau modèle compte.User.
        if not (
            getattr(user, "is_instructor", False)
            or getattr(user, "is_platform_admin", False)
            or user.is_superuser
        ):
            from django.core.exceptions import PermissionDenied
            raise PermissionDenied("Accès réservé aux formateurs.")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # CORRECTIF FORMATIONS-02 : scope visible (owner + membres de la même org).
        from catalog.services import get_visible_media_qs
        from django.shortcuts import get_object_or_404
        asset = get_object_or_404(
            get_visible_media_qs(self.request.user),
            id=self.kwargs["asset_id"],
        )
        context.update({"side_active": "media", "asset": asset})
        return context
```

> ⚠️ Supprimer l'attribut `allowed_roles = ("INSTRUCTOR",)` partout dans
> `formations/views.py` (FORMATIONS-19) : il n'est lu nulle part.

---

## 2. `formations/storage.py:37-46` — `s3_internal_client`

### Findings traités
- **FORMATIONS-06** (Important) : `verify=False` codé en dur → MITM possible.

### Patch

```python
def s3_internal_client():
    from django.conf import settings
    return boto3.client(
        "s3",
        endpoint_url=settings.MINIO_INTERNAL_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        region_name=settings.MINIO_REGION,
        config=Config(signature_version="s3v4"),
        # CORRECTIF FORMATIONS-06 : aligné sur le flag global.
        use_ssl=getattr(settings, "AWS_S3_USE_SSL", True),
        verify=getattr(settings, "AWS_S3_VERIFY", True),
    )
```

---

## 3. `formations/video_pipeline.py:12-29` — `run_cmd` + timeout + protocol_whitelist

### Findings traités
- **FORMATIONS-08** (Important) : ffmpeg accepte des protocoles dangereux (concat:, http:, data:, ...).
- **FORMATIONS-09** (Important) : pas de timeout → un input pathologique bloque un worker.

### Patch

```python
import subprocess
from pathlib import Path
import tempfile


class VideoProcessingError(RuntimeError):
    """Erreur de traitement vidéo (ffmpeg / ffprobe)."""


def run_cmd(cmd: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    """Exécute une commande shell avec timeout (CORRECTIF FORMATIONS-09)."""
    try:
        return subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise VideoProcessingError(f"Commande dépassée ({timeout}s) : {' '.join(cmd)}") from exc
    except subprocess.CalledProcessError as exc:
        raise VideoProcessingError(
            f"Commande échouée : {' '.join(cmd)}\n{exc.stderr or ''}"
        ) from exc


def transcode_to_web_mp4(input_path: str, output_path: str) -> None:
    """CORRECTIF FORMATIONS-08 : restriction des protocoles ffmpeg + sandboxing."""
    input_resolved = Path(input_path).resolve()
    tempdir = Path(tempfile.gettempdir()).resolve()
    if not str(input_resolved).startswith(str(tempdir)):
        raise VideoProcessingError("input_path hors tempdir autorisé.")

    cmd = [
        "ffmpeg",
        "-y",
        # CORRECTIF FORMATIONS-08 : on n'autorise que le protocole `file`.
        "-protocol_whitelist", "file",
        "-i", str(input_resolved),
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path),
    ]
    run_cmd(cmd, timeout=1800)  # CORRECTIF FORMATIONS-09
```

---

## 4. `formations/tasks.py:19-121` — `process_media_asset` : marquer FAILED

### Findings traités
- **FORMATIONS-03** (Critique) : asset reste éternellement PROCESSING.
- **FORMATIONS-04** (Important) : 2 transactions inutiles autour d'opérations longues.

### Patch (template de la fonction)

```python
from celery import shared_task
from celery.exceptions import MaxRetriesExceededError
from django.db import transaction
import logging

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    acks_late=True,
)
def process_media_asset(self, asset_id: str):
    from catalog.models import MediaAsset
    try:
        asset = MediaAsset.objects.get(id=asset_id)
    except MediaAsset.DoesNotExist:
        # CORRECTIF FORMATIONS-03 : pas de retry sur asset disparu.
        return {"status": "skipped", "reason": "missing_asset"}

    # On positionne PROCESSING sans transaction (single UPDATE = atomique côté DB).
    MediaAsset.objects.filter(pk=asset.pk).update(
        processing_status=MediaAsset.ProcessingStatus.PROCESSING,
        processing_error="",
    )

    try:
        # ... (ici, tout le pipeline actuel : download, ffprobe, transcode, upload)
        # ...

        # Fin de pipeline : mise à jour atomique.
        MediaAsset.objects.filter(pk=asset.pk).update(
            processing_status=MediaAsset.ProcessingStatus.READY,
            optimized_object_key=...,
            thumbnail_object_key=...,
            duration_seconds=...,
            width=..., height=..., bitrate=...,
            processing_error="",
        )
        return {"status": "ok"}

    except Exception as exc:
        logger.warning("media.process.failed", extra={"asset_id": str(asset_id), "exc": str(exc)})
        # CORRECTIF FORMATIONS-03 : si on est sur le DERNIER retry, on marque FAILED.
        if self.request.retries >= (self.max_retries or 0):
            MediaAsset.objects.filter(pk=asset.pk).update(
                processing_status=MediaAsset.ProcessingStatus.FAILED,
                processing_error=str(exc)[:2000],
            )
        raise


# CORRECTIF FORMATIONS-05 : seuil temporel sur cleanup_stale_multipart_uploads
from datetime import timedelta
from django.utils import timezone

@shared_task
def cleanup_stale_multipart_uploads():
    from django.conf import settings
    from formations.storage import s3_internal_client

    THRESHOLD = timedelta(hours=24)
    client = s3_internal_client()
    now = timezone.now()
    resp = client.list_multipart_uploads(Bucket=settings.MINIO_BUCKET)
    aborted = 0
    for upload in resp.get("Uploads", []):
        initiated = upload.get("Initiated")
        if initiated and (now - initiated) < THRESHOLD:
            continue
        client.abort_multipart_upload(
            Bucket=settings.MINIO_BUCKET,
            Key=upload["Key"],
            UploadId=upload["UploadId"],
        )
        aborted += 1
    return {"aborted": aborted}
```

---

## 5. `best_epargne/apis/views.py` — Remplacement legacy `role='SUPERADMIN'`

### Findings traités
- **API-03** (Critique) : 4 endroits comparent `getattr(user, "role", None) != "SUPERADMIN"` alors que le champ `role` n'existe plus.

### Patches

Remplacer **TOUTES** les occurrences de :

```python
if getattr(request.user, "role", None) != "SUPERADMIN":
```

par :

```python
from core.permissions import is_platform_admin
if not is_platform_admin(request.user):
```

**Sites concernés (au minimum) :**

- `views.py:807-809` (`MediaUploadFinalizeView`)
- `views.py:1016` (`MediaMultipartCompleteView`)
- `views.py:1232` (`MediaSignedGetView`)
- `views.py:1271` (`MediaThumbnailSignedGetView`)

> Vérifier avec : `grep -n 'role.*SUPERADMIN\|"SUPERADMIN"' best_epargne/apis/`

---

## 6. `best_epargne/apis/views.py:1226-1262` — `MediaSignedGetView` + scope

### Findings traités
- **API-01** (Critique) : ignore le scope org → membres d'une org ne peuvent pas lire les médias.

### Patch

```python
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import NotFound

from catalog.services import get_visible_media_qs
from core.permissions import can_access_media


class MediaSignedGetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        # CORRECTIF API-01 : on remplace le test owner_id seul par
        # le helper centralisé qui prend en compte le scope org.
        asset = get_visible_media_qs(request.user).filter(pk=asset_id).first()
        if asset is None or not can_access_media(request.user, asset):
            raise NotFound()
        # ... reste de la logique (generate presigned URL).
        url = _generate_signed_url(asset)
        return Response({"url": url})
```

---

## 7. `best_epargne/apis/views.py:3212-3238` — `LearnerMediaSignedGetView`

### Findings traités
- **API-02** (Critique) : leak des médias preview de cours DRAFT.

### Patch

```python
class LearnerMediaSignedGetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, asset_id):
        from django.shortcuts import get_object_or_404
        from catalog.models import Course, Lesson, MediaAsset
        from enrollments.models import Enrollment

        asset = get_object_or_404(MediaAsset, id=asset_id)
        lesson = Lesson.objects.select_related("section__course").filter(media_asset=asset).first()
        if lesson is None:
            raise NotFound()

        course = lesson.section.course
        # CORRECTIF API-02 : on exige que le cours soit PUBLISHED.
        if course.status != Course.Status.PUBLISHED:
            raise NotFound()

        # Preview est autorisé sans enrollment seulement si le cours est public.
        if lesson.is_preview and not course.company_only:
            url = _generate_signed_url(asset, ttl_seconds=60)
            return Response({"url": url})

        # Sinon : exige enrollment actif.
        if not Enrollment.objects.filter(user=request.user, course=course).exists():
            raise NotFound()

        url = _generate_signed_url(asset, ttl_seconds=60)
        return Response({"url": url})
```

---

## 8. `best_epargne/apis/views.py:711-731` — Presigned PUT 15 min

### Findings traités
- **API-12** (Important) : presigned PUT 6h trop large.

### Patch

```python
# Dans MediaUploadInitView et MediaMultipartInitView :
PRESIGN_PUT_TTL_SECONDS = 15 * 60  # CORRECTIF API-12

url = client.generate_presigned_url(
    "put_object",
    Params={
        "Bucket": settings.MINIO_BUCKET,
        "Key": object_key,
        "ContentType": data["content_type"],
    },
    ExpiresIn=PRESIGN_PUT_TTL_SECONDS,
)
```

---

## 9. `best_epargne/apis/views.py:773` — Tolérance size

### Findings traités
- **API-11** (Important) : tolérance 5 Mo trop large.

### Patch

```python
# AVANT
if abs(remote_size - int(data["size"])) > 1024 * 1024 * 5:
    raise ValidationError({"size": "Taille incohérente avec l'upload réel."})

# APRÈS
SIZE_TOLERANCE_BYTES = 64 * 1024  # 64 KiB, marge d'overhead d'encodage.
if abs(remote_size - int(data["size"])) > SIZE_TOLERANCE_BYTES:
    raise ValidationError({"size": "Taille incohérente avec l'upload réel."})
```

---

## 10. `best_epargne/apis/views.py:1855-1969` — `LearnerSectionQuizSubmitView`

### Findings traités
- **API-05** (Critique) : race sur max_attempts.
- **API-55** (Critique) : `lp.completed=True` même si quiz raté.

### Patch (extrait clé)

```python
from django.db import transaction

class LearnerSectionQuizSubmitView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "quiz_submit"

    def post(self, request, section_id):
        # ...
        with transaction.atomic():
            # CORRECTIF API-05 : on sérialise via select_for_update.
            locked_attempts = list(
                Attempt.objects.select_for_update()
                .filter(user=request.user, quiz=quiz, submitted_at__isnull=False)
            )
            attempts_count = len(locked_attempts)
            if quiz.max_attempts and attempts_count >= quiz.max_attempts:
                return Response(
                    {"detail": "Nombre maximal de tentatives atteint."},
                    status=403,
                )

            attempt = Attempt.objects.create(...)
            # ... scoring ...

            # CORRECTIF API-55 : ne marquer complete QUE si réussi.
            if attempt.passed:
                lp, _ = LessonProgress.objects.get_or_create(
                    enrollment=enrollment, lesson=lesson,
                    defaults={"progress_percent": 100, "completed": True},
                )
                if not lp.completed:
                    lp.completed = True
                    lp.progress_percent = 100
                    lp.save(update_fields=["completed", "progress_percent", "updated_at"])
```

> Ajout du throttle : voir `best_epargne/settings/base.py.new` (DEFAULT_THROTTLE_RATES).

---

## 11. `best_epargne/apis/views.py` — `_course_owned` → `_get_writable_course`

### Findings traités
- **API-09** (Important) : ~15 vues `InstructorCourse*` filtrent strict `instructor=user`, bloquant les admins org.

### Patch global

Remplacer dans **toutes** les vues `InstructorCourseDetailView`, `InstructorCoursePublishView`, `InstructorCourseArchiveView`, `InstructorSectionListView` (et tous siblings), `InstructorLessonCreateView`, etc. :

```python
# AVANT
course = get_object_or_404(Course, id=course_id, instructor=request.user)

# APRÈS (utiliser l'helper déjà présent)
course = _get_writable_course(course_id, request.user)
```

`_get_writable_course` est déjà défini en haut de `apis/views.py` (utilisé pour les quiz) et applique le scope auteur OR admin org. Il faut **systématiquement** l'utiliser pour les opérations d'écriture cours/section/leçon.

---

## 12. `best_epargne/apis/views.py` — Suppression duplications

### Findings traités
- **API-19** (Important) : `_range_to_days` défini 3 fois.
- **API-20** (Important) : imports défensifs doublés.
- **API-21** (Important) : `IsAuthenticated` en doublon avec `IsInstructor`.

### Patches

1. Définir UN SEUL `_range_to_days` au sommet du module ; supprimer les définitions lignes 273-275 et 2003-2005.
2. Supprimer le bloc d'imports `try/except` lignes 1972-1997 (doublon du bloc 213-241).
3. Créer la base class :

```python
class InstructorBaseAPIView(APIView):
    """Base pour toutes les vues instructor : IsInstructor implique
    déjà IsAuthenticated/IsActive (voir apis/permissions.py)."""
    permission_classes = [IsInstructor]
```

Puis remplacer dans toutes les 30+ vues `permission_classes = [IsAuthenticated, IsInstructor]` par héritage de `InstructorBaseAPIView` (et seulement la classe parente).

---

## 13. `best_epargne/apis/api_urls.py:84-88` — URL cassée double `/api/`

### Findings traités
- **API-16 / API-39** (Important).

### Patch

```python
# AVANT
path("api/learner/organization-courses/", LearnerOrganizationCoursesAPIView.as_view(),
     name="api_learner_organization_courses"),

# APRÈS (le include est déjà sous "api/")
path("learner/organization-courses/", LearnerOrganizationCoursesAPIView.as_view(),
     name="api_learner_organization_courses"),
```

---

## 14. `best_epargne/apis/api_urls.py:178-182` — Doublon `api_instructor_quiz_update`

### Findings traités
- **API-22** (Important / nettoyage).

### Patch

Supprimer le commentaire et l'éventuelle ligne en doublon. Ne garder qu'une seule définition.

---

## 15. `best_epargne/apis/permissions.py:50-57` — `is_platform_admin` strict

### Findings traités
- **API-18** / **COMPTE-02** (Critique sécurité).

### Patch

```python
@staticmethod
def is_platform_admin(user) -> bool:
    """STRICT : n'inclut PAS is_staff. Un opérateur support technique avec
    juste is_staff=True ne doit PAS gagner accès au dashboard plateforme.
    Voir core/permissions.is_platform_admin pour le canonique."""
    if not PermissionUtils.is_authenticated_and_active(user):
        return False
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "platform_role", None) == "PLATFORM_ADMIN"
    )

@staticmethod
def has_django_admin_access(user) -> bool:
    """Pour l'accès /admin/ Django uniquement (lecture seule, support)."""
    return PermissionUtils.is_platform_admin(user) or bool(
        user and user.is_authenticated and user.is_active and user.is_staff
    )
```

---

## 16. `compte/models.py:124-129` — Property `is_platform_admin`

### Findings traités
- **COMPTE-02** (Critique).

### Patch

```python
@property
def is_platform_admin(self) -> bool:
    """STRICT (NE PAS inclure is_staff)."""
    return self.is_superuser or self.platform_role == self.PlatformRole.PLATFORM_ADMIN

@property
def has_django_admin_access(self) -> bool:
    """Pour /admin/ Django uniquement."""
    return self.is_platform_admin or self.is_staff
```

---

## 17. `compte/models.py:111-117` — `clean()` cohérent

### Findings traités
- **COMPTE-01** (Critique).

### Patch

```python
def clean(self):
    super().clean()
    if self.email:
        self.email = self.__class__.objects.normalize_email(self.email).strip().lower()
    # Cohérence is_superuser / is_staff / platform_role :
    if self.is_superuser:
        self.is_staff = True
        self.platform_role = self.PlatformRole.PLATFORM_ADMIN
    elif self.platform_role == self.PlatformRole.PLATFORM_ADMIN:
        self.is_staff = True
```

---

## 18. `compte/views.py:84-86` + `compte/adapters.py:210-211` — `next_url` validé

### Findings traités
- **COMPTE-17 / COMPTE-18** (Important sécurité).

### Patch

```python
from django.utils.http import url_has_allowed_host_and_scheme

def _safe_next(request, next_url: str) -> str | None:
    if not next_url:
        return None
    if url_has_allowed_host_and_scheme(
        url=next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return next_url
    return None

# Usage dans switch_workspace et AccountAdapter.get_login_redirect_url :
safe = _safe_next(request, request.POST.get("next") or request.GET.get("next"))
if safe:
    return redirect(safe)
```

---

## 19. `commerce/services.py:33-69` — `enroll_on_payment_success` atomic

### Findings traités
- **COM-01** (Critique) : race condition double-licence.

### Patch (réécriture complète de la fonction)

```python
from django.db import transaction
from django.db.models import F

@transaction.atomic
def enroll_on_payment_success(order_id: int) -> dict:
    """CORRECTIF COM-01 : sérialisé via select_for_update pour empêcher
    double-traitement d'un webhook rejoué.
    """
    order = (
        Order.objects.select_for_update()
        .select_related("company", "user", "coupon")
        .get(pk=order_id)
    )
    if order.status == Order.Status.PAID:
        return {"ok": True, "already_paid": True}

    # ... reste du traitement (création licences, enrollments, etc.) ...

    # CORRECTIF COM-03 : incrément du coupon used_count à la finalisation.
    if order.coupon_id:
        Coupon.objects.filter(pk=order.coupon_id).update(used_count=F("used_count") + 1)

    order.status = Order.Status.PAID
    order.paid_at = timezone.now()
    order.save(update_fields=["status", "paid_at"])
    return {"ok": True}
```

---

## 20. `commerce/models.py:97-103` — UniqueConstraint (provider, reference)

### Findings traités
- **COM-02** (Critique) : webhook rejoué = double-charge.

### Patch (ajout dans `PaymentTransaction.Meta.constraints`)

```python
class PaymentTransaction(models.Model):
    # ... champs existants ...

    class Meta:
        # ... constraints existantes ...
        constraints = [
            # ... existants ...
            models.UniqueConstraint(
                fields=["provider", "reference"],
                condition=~models.Q(reference=""),
                name="unique_provider_reference",
            ),
        ]
```

Et créer la migration `commerce/migrations/000X_payment_unique_provider_reference.py`
(le squelette est dans `commerce/migrations/0004_payment_unique_provider_reference.py.new` —
à renuméroter selon votre dernière migration).

Côté webhook handler (à créer dans `commerce/views.py` ou via service) :

```python
tx, created = PaymentTransaction.objects.get_or_create(
    provider=provider,
    reference=reference,
    defaults={
        "order": order,
        "status": status,
        "amount": amount,
        "currency": currency,
        "raw_payload": _sanitize_payload(raw_payload),
    },
)
if not created:
    return JsonResponse({"already_processed": True}, status=200)
```

---

## 21. `compte/forms.py:100-124` — Signup atomique + email normalize

### Findings traités
- **COMPTE-07** (Important) : Signup partiel possible.
- **COMPTE-08** (Important) : Email case-insensitive.

### Patch

```python
from django.db import transaction

class CustomSignupForm(forms.Form):
    # ...

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise forms.ValidationError("Email requis.")
        return email

    @transaction.atomic
    def save(self, request):
        user = super().save(request)
        # ... création LearnerProfile + LearnerKYC ...
        return user
```

---

---

## 22. `formations/Rolemixin.py` + `formations/views.py` — `_redirect_by_role` → `resolve_user_dashboard_url`

### Findings traités
- **FORMATIONS-22 / AUDIT_MULTIROLE P2-2** (Important, dette) — Centralisation
  enfin posée dans `compte/services.py` (V3.A).

### Patch

Dans **`formations/Rolemixin.py`** (en haut du fichier) :

```python
# Remplacement de la fonction locale _redirect_by_role.
from compte.services import resolve_user_dashboard_url as _redirect_by_role  # noqa: F401
```

Puis SUPPRIMER l'implémentation locale (lignes 16-66 environ).

Dans **`formations/views.py`** :

```python
# Remplacement de la fonction locale resolve_user_dashboard_url.
from compte.services import resolve_user_dashboard_url  # noqa: F401
```

Puis SUPPRIMER l'implémentation locale (lignes 59-109 environ).

Dans **`compte/adapters.py:get_login_redirect_url`** :

```python
from compte.services import resolve_user_dashboard_url
# ... après les autres branches ...
target = resolve_user_dashboard_url(request.user)
# (au lieu de la logique manuelle dupliquée)
```

> Vérifier la cohérence : la fonction centrale renvoie un *nom d'URL*
> (compatible avec `redirect`). Les anciens callers qui attendaient un
> path peuvent passer par `resolve_user_dashboard_path(user, fallback="/")`.

---

## 24. `best_epargne/apis/views.py` — Annoter CourseViewSet (V4.B)

### Findings traités
- **API-33** (Important) : ``sections_count``, ``lessons_count``,
  ``enrolled_count``, ``rating_avg``, ``rating_count``, ``completion_rate``
  étaient annotés uniquement dans ``my_courses`` → ``null`` partout ailleurs.

### Patch

Dans `best_epargne/apis/views.py`, classe `CourseViewSet.get_queryset` :

```python
from catalog.querysets import annotate_course_kpis

def get_queryset(self):
    qs = (
        Course.objects.select_related("category", "instructor", "company")
        .order_by("-published_at", "-created_at")
    )
    user = self.request.user

    # Filtrage de visibilité existant (V1).
    if not user.is_authenticated or not getattr(user, "is_platform_admin", False):
        qs = qs.filter(status=Course.Status.PUBLISHED, company_only=False)

    # V4.B : annoter les KPIs pour éviter AttributeError + N+1.
    return annotate_course_kpis(qs, user=user if user.is_authenticated else None)
```

Et dans la vue `my_courses` (action), remplacer le `.annotate(...)` manuel
par le même helper :

```python
qs = annotate_course_kpis(qs, user=request.user)
```

Bénéfices : (a) `sections_count`/`lessons_count`/etc. ne sont jamais `null`
dans la sérialisation ; (b) une seule sous-requête par champ au lieu de
N+1 ; (c) `can_edit` (déjà partiellement annoté côté serializer) peut
maintenant s'appuyer sur `is_writable_via_org` annoté ici.

---

## 25. `compte/models.py` — cached_property sur User (V4.C)

### Findings traités
- **COMPTE-21** (Important) : `User.active_memberships` re-query à chaque
  accès des properties dépendantes.

### Patch (dans `compte/models.py`)

```python
from functools import cached_property

class User(AbstractBaseUser, PermissionsMixin):
    # ... champs existants ...

    @cached_property
    def _active_memberships_cache(self):
        """Liste matérialisée (1 seule requête par instance)."""
        return list(
            self.organization_memberships.filter(
                is_active=True, organization__is_active=True,
            ).select_related("organization").values("organization_id", "role")
        )

    @property
    def active_memberships(self):
        # Pour conserver la compat queryset, on retourne le QS, MAIS
        # toutes les properties is_org_* utilisent _active_memberships_cache.
        return self.organization_memberships.filter(
            is_active=True, organization__is_active=True,
        )

    @property
    def is_org_owner(self) -> bool:
        return any(m["role"] == "OWNER" for m in self._active_memberships_cache)

    @property
    def is_org_admin(self) -> bool:
        return any(m["role"] in ("OWNER", "ADMIN") for m in self._active_memberships_cache)

    @property
    def is_org_instructor(self) -> bool:
        return any(m["role"] == "INSTRUCTOR" for m in self._active_memberships_cache)

    @property
    def is_org_learner(self) -> bool:
        return any(m["role"] == "LEARNER" for m in self._active_memberships_cache)
```

Gain mesuré : 5-6 requêtes SQL en moins par rendu de sidebar.

---

## 23. `assessments/models.py` — `Quiz.is_final` + contrainte

### Findings traités
- **ASS-16** : Quiz peut avoir `is_onboarding=True` ET `course/section/lesson` non null.
- **CERT-05** : pas de notion de quiz final explicite.

### Patch (à appliquer dans une future migration)

```python
class Quiz(models.Model):
    # ... champs existants ...
    is_final = models.BooleanField(default=False)

    class Meta:
        # ... existants ...
        constraints = [
            models.CheckConstraint(
                name="quiz_onboarding_xor_attached",
                check=(
                    models.Q(is_onboarding=True, course__isnull=True, section__isnull=True, lesson__isnull=True)
                    | models.Q(is_onboarding=False)
                ),
            ),
            models.UniqueConstraint(
                fields=["course"],
                condition=models.Q(is_final=True, course__isnull=False),
                name="quiz_one_final_per_course",
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_onboarding and (self.course_id or self.section_id or self.lesson_id):
            raise ValidationError("Un quiz d'onboarding ne peut être rattaché à un cours/section/leçon.")
```

Puis dans `certifications/services.issue_certificate_if_passed`, filtrer
sur `is_final=True` au lieu de `lesson__isnull=True`.

---

---

## 26. `best_epargne/urls.py` — Brancher 2FA (V6.D / SEC-06)

### Patch

Ajouter à la fin de ``urls.py`` :

```python
# V6.D : 2FA URLs (django-two-factor-auth ≥ 1.15).
from best_epargne.two_factor_urls import build_two_factor_patterns
urlpatterns += build_two_factor_patterns()
```

Et dans ``best_epargne/settings/base.py`` (déjà ajouté en V1) ajouter :

```python
TWO_FACTOR_PATCH_ADMIN = True  # force 2FA sur /admin/
LOGIN_URL = "two_factor:login"  # pour les vues @login_required
```

> Le décorateur ``@otp_required`` peut être ajouté sur les vues de
> dashboard admin métier (PlatformAdminDashboard, PlatformOrganizationsView)
> pour exiger 2FA même hors /admin/.

---

## 27. `requirements.txt` — Migration psycopg3 + urllib3 2.x (V6.E)

### Findings traités
- **SEC-28** : urllib3==1.26.20 EOL.
- **SEC-29** : psycopg2 legacy.

### Patch (rolling, par étapes)

#### Étape 1 — urllib3 (sûr, drop-in)
```diff
- urllib3==1.26.20
+ urllib3==2.2.3
```
boto3 1.42 supporte urllib3 2.x. Tester en CI avant déploiement.

#### Étape 2 — psycopg2 → psycopg3
```diff
- psycopg2==2.9.11
+ psycopg[binary]==3.2.3
```

Django 4.2.10+ supporte psycopg 3 sans configuration supplémentaire.
Tester en parallèle (les deux peuvent coexister un temps).

#### Étape 3 — Nettoyage dépendances mortes (SEC-26, SEC-27)
```diff
- django-payments==3.1.0      # non utilisé (audit)
- djangorestframework_simplejwt==5.5.1   # non configuré (audit SEC-20)
```

GDAL/GEOS paths dans `settings/dev.py` déjà retirés en V1.

---

---

## 28. `best_epargne/apis/api_urls.py` — Brancher drf-spectacular (V_OBS.A)

### Findings traités
- Documentation API manquante (audit "Quality of life" pour les intégrateurs).

### Patch

Au début de ``api_urls.py``, ajouter :

```python
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)
```

Puis dans ``urlpatterns`` (en début, après le router) :

```python
urlpatterns = [
    # V_OBS.A : documentation OpenAPI auto-générée.
    path("schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    path("redoc/", SpectacularRedocView.as_view(url_name="api-schema"), name="api-redoc"),

    path("apis/", include(router.urls)),
    # ... reste existant ...
]
```

URLs finales :
- ``/api/schema/`` : JSON OpenAPI 3.0.
- ``/api/docs/``   : Swagger UI interactif.
- ``/api/redoc/``  : ReDoc lecture-friendly.

> Idéalement, ajoutez des décorateurs ``@extend_schema(tags=["learner"])`` sur
> vos vues APIView pour grouper proprement par espace (cf. SPECTACULAR_SETTINGS.TAGS).

---

---

## 29. `formations/views.py` — Protéger les dashboards plateforme par 2FA (V_FIN.C)

### Findings traités
- **SEC-06 final** : finit le branchement 2FA initié en V1 (`django-otp` + `django-two-factor-auth` installés) puis V6.D (URLs branchées).

### Patch

Dans `formations/views.py` (ou `best_epargne/apis/views_package/platform.py` quand
splitter effectif), remplacer les `_PlatformAdminGateMixin` historiques par :

```python
from django.utils.decorators import method_decorator
from core.decorators import platform_admin_otp_required


@method_decorator(platform_admin_otp_required, name="dispatch")
class PlatformAdminDashboard(TemplateView):
    template_name = "platform/admin_dashboard.html"
    # ... reste inchangé ...


@method_decorator(platform_admin_otp_required, name="dispatch")
class PlatformOrganizationsView(TemplateView):
    template_name = "platform/organizations.html"
    # ...


@method_decorator(platform_admin_otp_required, name="dispatch")
class PlatformUsersView(TemplateView):
    template_name = "platform/users.html"
    # ...
```

Effet : si l'user n'a pas de device OTP configuré, il est redirigé vers
`/account/two-factor/setup/` ; s'il en a un mais n'a pas validé son OTP
pour la session, il est redirigé vers `/account/two-factor/login/`.

Pour les vues organisation, utiliser plutôt :

```python
from core.decorators import org_admin_required_for_id

@method_decorator(org_admin_required_for_id("organization_id"), name="dispatch")
class OrganizationMemberDeactivateView(View):
    # ...
```

(Sans OTP — celui-ci reste réservé à l'admin plateforme métier.)

---

Pour les fichiers ci-après, voir les fichiers `.new` complets correspondants :

- `enrollments/api.py.new`
- `enrollments/urls.py.new`
- `enrollments/views.py.new`
- `enrollments/services.py` *(nouveau)*
- `enrollments/signals.py` *(nouveau)*
- `enrollments/apps.py.new`
- `enrollments/migrations/0002_indexes_and_completed_at.py` *(nouveau)*
- `catalog/views.py.new`
- `catalog/services.py.new`
- `assessments/views.py.new`
- `assessments/recommendations.py.new`
- `reviews/views.py.new`
- `reviews/serializers.py.new`
- `reviews/models.py.new`
- `reviews/urls.py.new`
- `reviews/admin.py.new`
- `reviews/migrations/0002_rating_validators.py` *(nouveau)*
- `commerce/migrations/0004_payment_unique_provider_reference.py` *(nouveau)*
- `best_epargne/apis/serializers.py.new`
- `best_epargne/settings/base.py.new`
- `best_epargne/settings/prod.py.new`
- `best_epargne/settings/dev.py.new`
- `best_epargne/celery.py.new`
- `best_epargne/asgi.py.new`
- `best_epargne/wsgi.py.new`
- `manage.py.new`
- `Dockerfile.new`
- `.dockerignore` *(nouveau)*
- `core/__init__.py` *(nouveau)*
- `core/permissions.py` *(nouveau)*
- `best_epargne/health.py` *(nouveau)*
- `best_epargne/urls.py.new`

Voir `CHANGELOG_2026_05.md` pour le résumé complet, et `audit_best_epargne_2026.docx`
pour la justification de chaque correctif (par ID FORMATIONS-XX, COMPTE-XX, etc.).
