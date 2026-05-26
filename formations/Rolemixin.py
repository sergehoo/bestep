from decimal import Decimal
from django.contrib.auth.mixins import UserPassesTestMixin, LoginRequiredMixin
from django.contrib.auth.views import redirect_to_login
from django.core.exceptions import PermissionDenied
from django.db import models
from django.db.models import Avg, Q
from django.db.models.functions import Coalesce
from django.shortcuts import redirect, get_object_or_404
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from catalog.models import Course, CourseSection, Lesson
from enrollments.models import LessonProgress
from organizations.models import OrganizationMembership


# CORRECTIF FORMATIONS-22 : centralisation dans compte.services (V3.A).
from compte.services import resolve_user_dashboard_url as _redirect_by_role  # noqa: F401


class RoleRequiredMixin(UserPassesTestMixin):
    """
    Mixin générique de contrôle d'accès métier.
    """

    allow_platform_admin = False
    allow_org_owner = False
    allow_org_admin = False
    allow_org_manager = False
    allow_instructor = False
    allow_learner = False

    raise_exception = False

    def get_user(self):
        return self.request.user

    def is_platform_admin(self, user) -> bool:
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "is_platform_admin", False)
        )

    def has_org_role(self, user, roles) -> bool:
        memberships = getattr(user, "organization_memberships", None)
        if memberships is None:
            return False
        return memberships.filter(
            is_active=True,
            role__in=roles,
        ).exists()

    def is_org_owner(self, user) -> bool:
        return self.has_org_role(user, [OrganizationMembership.Role.OWNER])

    def is_org_admin(self, user) -> bool:
        return self.has_org_role(
            user,
            [
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ],
        )

    def is_org_manager(self, user) -> bool:
        return self.has_org_role(
            user,
            [
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
                OrganizationMembership.Role.MANAGER,
            ],
        )

    def is_instructor(self, user) -> bool:
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "is_instructor", False)
        )

    def is_learner(self, user) -> bool:
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and getattr(user, "is_learner", False)
        )

    def test_func(self):
        user = self.get_user()

        if not user.is_authenticated or not user.is_active:
            return False

        if self.allow_platform_admin and self.is_platform_admin(user):
            return True

        if self.allow_org_owner and self.is_org_owner(user):
            return True

        if self.allow_org_admin and self.is_org_admin(user):
            return True

        if self.allow_org_manager and self.is_org_manager(user):
            return True

        if self.allow_instructor and self.is_instructor(user):
            return True

        if self.allow_learner and self.is_learner(user):
            return True

        return False

    def get_no_permission_redirect_url(self):
        return _redirect_by_role(self.get_user())

    def handle_no_permission(self):
        user = self.get_user()

        if not user.is_authenticated:
            return redirect_to_login(self.request.get_full_path())

        target_name = self.get_no_permission_redirect_url()

        # ``reverse`` peut lever NoReverseMatch si la route cible n'est pas
        # encore déclarée (ex. ``admin_dashboard`` historique). Dans ce cas
        # on se rabat sur la home pour éviter un 500 brutal sur un simple
        # défaut d'autorisation. C'était l'origine d'une boucle / d'une
        # 500 lorsqu'un user perdait ses droits sur un espace.
        try:
            target_url = reverse(target_name)
        except NoReverseMatch:
            try:
                target_url = reverse("home")
            except NoReverseMatch:
                target_url = "/"

        # Si l'utilisateur est déjà sur sa bonne interface,
        # on évite la boucle en affichant une vraie 403.
        if self.request.path == target_url:
            raise PermissionDenied(
                "Vous n’avez pas les droits requis pour accéder à cette page."
            )

        return redirect(target_url)


class PlatformAdminRequiredMixin(RoleRequiredMixin):
    allow_platform_admin = True


class OrganizationAdminRequiredMixin(RoleRequiredMixin):
    allow_platform_admin = True
    allow_org_owner = True
    allow_org_admin = True


class OrganizationManagerRequiredMixin(RoleRequiredMixin):
    allow_platform_admin = True
    allow_org_owner = True
    allow_org_admin = True
    allow_org_manager = True


class InstructorRequiredMixin(RoleRequiredMixin):
    allow_platform_admin = True
    allow_instructor = True


class LearnerRequiredMixin(RoleRequiredMixin):
    allow_platform_admin = True
    allow_learner = True



class InstructorBaseMixin(LoginRequiredMixin, InstructorRequiredMixin):
    allowed_roles = ("INSTRUCTOR",)

    def get_org_admin_membership(self):
        user = self.request.user

        if not user.is_authenticated:
            return None

        return (
            user.organization_memberships
            .select_related("organization")
            .filter(
                role__in=["ADMIN", "OWNER"],
                is_active=True,
                organization__is_active=True,
            )
            .first()
        )

    def get_user_organization_ids(self):
        user = self.request.user

        if not user.is_authenticated:
            return []

        return list(
            user.organization_memberships.filter(
                is_active=True,
                organization__is_active=True,
            ).values_list("organization_id", flat=True)
        )

    def can_manage_organization_content(self, organization_id):
        user = self.request.user

        if not user.is_authenticated or not organization_id:
            return False

        return user.organization_memberships.filter(
            organization_id=organization_id,
            role__in=["ADMIN", "OWNER"],
            is_active=True,
        ).exists()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        org_admin_membership = self.get_org_admin_membership()

        context["can_access_org_admin"] = org_admin_membership is not None
        context["org_admin_membership"] = org_admin_membership
        context["org_admin_organization"] = (
            org_admin_membership.organization if org_admin_membership else None
        )

        return context

    def get_instructor_course(self, course_id=None):
        """Retourne un cours auquel l'utilisateur a accès en tant qu'instructeur.

        Règle de visibilité :
        - admin plateforme : tous les cours ;
        - sinon : cours dont il est l'auteur (``instructor=user``) OU cours
          rattachés à une organisation où il est membre actif
          (``Course.company`` ∈ ses orgs).

        NOTE : le champ FK Course → Organization s'appelle ``company``
        (cf. ``catalog/models.py``), pas ``organization``. Toute référence
        à ``organization`` ici lèverait ``FieldError``.
        """
        cid = course_id or self.kwargs.get("course_id") or self.kwargs.get("pk")
        user = self.request.user

        qs = Course.objects.select_related("category", "instructor", "company")

        if getattr(user, "is_platform_admin", False):
            return get_object_or_404(qs, id=cid)

        org_ids = self.get_user_organization_ids()

        scope = Q(instructor=user)
        if org_ids:
            scope |= Q(company_id__in=org_ids)

        return get_object_or_404(qs.filter(scope).distinct(), id=cid)

    def _humanize_date(self, dt):
        if not dt:
            return "—"

        now = timezone.now()
        delta = now - dt

        if delta.days == 0:
            seconds = int(delta.total_seconds())
            if seconds < 60:
                return "à l’instant"
            if seconds < 3600:
                return f"il y a {seconds // 60} min"
            return f"il y a {seconds // 3600} h"

        if delta.days == 1:
            return "hier"
        if delta.days < 7:
            return f"il y a {delta.days} jours"

        return dt.strftime("%d/%m/%Y")

    def _course_completion_avg(self, course):
        return (
            LessonProgress.objects.filter(enrollment__course=course)
            .aggregate(
                v=Coalesce(
                    Avg("progress_percent", output_field=models.IntegerField()),
                    0,
                    output_field=models.IntegerField(),
                )
            )["v"]
            or 0
        )

    def _course_thumbnail_url(self, course):
        try:
            return course.thumbnail.url if course.thumbnail else ""
        except Exception:
            return ""

    def _course_issues(self, course, thumbnail_url=None):
        thumbnail_url = thumbnail_url if thumbnail_url is not None else self._course_thumbnail_url(course)
        issues = []

        sections_count = getattr(course, "sections_count", None)
        lessons_count = getattr(course, "lessons_count", None)

        if sections_count is None:
            sections_count = CourseSection.objects.filter(course=course).count()

        if lessons_count is None:
            lessons_count = Lesson.objects.filter(section__course=course).count()

        if sections_count == 0:
            issues.append("Aucune section")

        if lessons_count == 0:
            issues.append("Aucune leçon")

        if course.pricing_type != Course.PricingType.FREE and Decimal(str(course.price or 0)) <= 0:
            issues.append("Prix non défini")

        if not thumbnail_url:
            issues.append("Thumbnail manquant")

        return issues

    def _serialize_course_card(self, course):
        user = self.request.user
        thumbnail_url = self._course_thumbnail_url(course)
        completion_rate = self._course_completion_avg(course)
        issues = self._course_issues(course, thumbnail_url=thumbnail_url)

        # NOTE : Course → Organization s'appelle ``company`` dans le modèle
        # (cf. catalog/models.py). ``course.organization_id`` n'existe pas
        # et planterait silencieusement à l'évaluation lazy.
        can_manage = (
            getattr(user, "is_platform_admin", False)
            or course.instructor_id == user.id
            or self.can_manage_organization_content(course.company_id)
        )

        return {
            "id": course.id,
            "title": course.title,
            "subtitle": course.subtitle or "",
            "slug": course.slug,
            "status": course.status,
            "course_type": course.course_type,
            "pricing_type": course.pricing_type,
            "price": course.price,
            "currency": course.currency,
            "thumbnail_url": thumbnail_url,
            "preview_video_url": course.preview_video_url or "",
            "sections_count": getattr(course, "sections_count", 0),
            "lessons_count": getattr(course, "lessons_count", 0),
            "enrolled_count": getattr(course, "enrolled_count", 0),
            "rating_avg": round(float(getattr(course, "rating_avg", 0) or 0), 1),
            "rating_count": getattr(course, "rating_count", 0),
            "completion_rate": int(completion_rate),
            "updated_at": course.updated_at,
            "updated_at_human": self._humanize_date(course.updated_at),
            "published_at": course.published_at,
            "published_at_human": self._humanize_date(course.published_at) if course.published_at else "—",
            "issues": issues,
            "needs_work": len(issues) > 0,
            "can_edit": can_manage,
            "can_delete": can_manage,
            "is_owner": course.instructor_id == user.id,
            "scope": "personal" if course.instructor_id == user.id else "organization",
            "builder_url": reverse("instructor:course_builder", kwargs={"course_id": course.id}),
            "detail_url": reverse("instructor:course_detail", kwargs={"course_id": course.id}),
            "edit_url": f'{reverse("instructor:dashboard")}?tab=courses&edit={course.id}',
        }