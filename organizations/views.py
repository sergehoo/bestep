from __future__ import annotations

import datetime
from decimal import Decimal
from functools import cached_property

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.exceptions import PermissionDenied
from django.db.models import Avg, Count, DecimalField, FloatField, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
from django.views.generic import DetailView, FormView, ListView, TemplateView

from assessments.models import Quiz
from catalog.models import Category, Course, CourseSection, Lesson, MediaAsset, Payment
from enrollments.models import Enrollment, LessonProgress
from formations.Rolemixin import RoleRequiredMixin
from organizations.models import Organization, OrganizationMembership
from organizations.organ_forms import (
    OrganizationCourseAssignInstructorForm,
    OrganizationCourseAssignLearnersForm,
    OrganizationCourseCreateForm,
    OrganizationLessonCreateForm,
    OrganizationMemberCreateForm,
    OrganizationMemberUpdateForm,
    OrganizationQuizCreateForm,
    OrganizationSectionCreateForm,
)
from organizations.services import OrganizationMemberManagementService

User = get_user_model()


class OrganizationScopedMixin(LoginRequiredMixin, RoleRequiredMixin):
    """Sécurise l'accès aux pages d'une organisation.

    Priorité de résolution :
    1. admin plateforme / superuser → accès à toute organisation active.
    2. membership actif dans l'organisation demandée dont le rôle appartient
       à ``allowed_org_roles`` → accès autorisé.
    3. sinon → ``PermissionDenied`` (même message / même status que "org
       inexistante" pour ne pas leaker l'existence d'une organisation).

    Paramètres d'override côté sous-classe :
    - ``allowed_org_roles`` : liste des rôles org autorisés. Par défaut OWNER,
      ADMIN et MANAGER. C'est *la* source de vérité — le ``test_func`` du
      gate générique est dérivé automatiquement.
    - ``allow_single_org_fallback`` : si True et qu'aucun ``organization_id``
      n'est fourni, redirige vers l'unique organisation accessible de
      l'utilisateur (UX : un admin d'une seule org n'a pas à sélectionner).
    """

    organization: Organization | None = None

    allowed_org_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
        OrganizationMembership.Role.MANAGER,
    )

    allow_single_org_fallback = True

    # --- Gate générique (RoleRequiredMixin) ------------------------------
    # On n'utilise PAS les flags booléens hérités : ils ne couvrent pas
    # tous les rôles de façon uniforme et peuvent diverger de
    # ``allowed_org_roles``. On override ``test_func`` pour n'avoir qu'une
    # seule source de vérité.
    def test_func(self):
        user = self.request.user
        if not user.is_authenticated or not user.is_active:
            return False
        if getattr(user, "is_platform_admin", False):
            return True
        return OrganizationMembership.objects.filter(
            user=user,
            is_active=True,
            role__in=self.allowed_org_roles,
            organization__is_active=True,
        ).exists()

    # --- Résolution de l'organisation courante ---------------------------
    def get_requested_organization_id(self):
        return self.kwargs.get("organization_id") or self.request.GET.get("organization")

    @cached_property
    def current_membership(self) -> OrganizationMembership | None:
        """Membership actif de l'utilisateur dans l'organisation courante,
        ou None pour un admin plateforme (qui n'est pas nécessairement
        membre).
        """
        user = self.request.user
        organization = self.organization
        if organization is None or not user.is_authenticated:
            return None
        if getattr(user, "is_platform_admin", False):
            return None
        return (
            OrganizationMembership.objects
            .filter(
                user=user,
                organization=organization,
                is_active=True,
                role__in=self.allowed_org_roles,
            )
            .order_by("role")
            .first()
        )

    @cached_property
    def organizations_accessible(self):
        """QuerySet des organisations accessibles par l'utilisateur courant.

        Mise en cache au niveau de la requête (cached_property sur l'instance
        de la vue).
        """
        user = self.request.user
        if getattr(user, "is_platform_admin", False):
            return Organization.objects.filter(is_active=True).order_by("name")
        return (
            Organization.objects
            .filter(
                is_active=True,
                memberships__user=user,
                memberships__is_active=True,
                memberships__role__in=self.allowed_org_roles,
            )
            .distinct()
            .order_by("name")
        )

    # Alias historique : conservé pour compat templates/sous-classes.
    def get_organizations_administered(self):
        return self.organizations_accessible

    def get_current_organization(self):
        user = self.request.user
        organization_id = self.get_requested_organization_id()

        # Pas d'id → fallback "org unique" si activé.
        if not organization_id:
            if self.allow_single_org_fallback:
                accessible = list(self.organizations_accessible[:2])
                if len(accessible) == 1:
                    # on retourne l'org ; dispatch gère éventuellement une
                    # redirection si l'URL attendait un org_id.
                    return accessible[0]
            raise PermissionDenied("Organisation introuvable.")

        if getattr(user, "is_platform_admin", False):
            # Admin plateforme : on ne leak pas l'existence — même erreur
            # que pour un non-admin qui taperait un mauvais id.
            try:
                return Organization.objects.get(pk=organization_id, is_active=True)
            except (Organization.DoesNotExist, ValueError, TypeError) as exc:
                raise PermissionDenied("Organisation introuvable.") from exc

        try:
            membership = (
                OrganizationMembership.objects
                .select_related("organization")
                .filter(
                    user=user,
                    organization_id=organization_id,
                    organization__is_active=True,
                    is_active=True,
                    role__in=self.allowed_org_roles,
                )
                .first()
            )
        except (ValueError, TypeError) as exc:
            raise PermissionDenied("Organisation introuvable.") from exc

        if not membership:
            raise PermissionDenied(
                "Vous n’êtes pas autorisé à accéder à cette organisation."
            )
        return membership.organization

    # --- Dispatch --------------------------------------------------------
    def dispatch(self, request, *args, **kwargs):
        # 1. Authentification (LoginRequiredMixin)
        if not request.user.is_authenticated:
            return self.handle_no_permission()

        # 2. Gate générique rôle (UserPassesTestMixin.test_func)
        #    On le fait avant toute requête ciblée pour ne pas taper la
        #    base sur un user non autorisé.
        if not self.test_func():
            return self.handle_no_permission()

        # 3. Résolution de l'org courante (DB).
        self.organization = self.get_current_organization()

        return super().dispatch(request, *args, **kwargs)

    # --- Contexte --------------------------------------------------------
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["organization"] = self.organization
        context["organizations_administered"] = self.organizations_accessible
        context["organizations_accessible"] = self.organizations_accessible
        context["current_membership"] = self.current_membership
        context["user_org_role"] = (
            self.current_membership.role if self.current_membership else None
        )
        return context


class OrganisationDashboard(OrganizationScopedMixin, TemplateView):
    template_name = "organization/dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        organization = self.organization

        courses_qs = Course.objects.filter(company=organization)

        enrollments_qs = Enrollment.objects.filter(
            course__company=organization
        )

        lessons_qs = Lesson.objects.filter(
            section__course__company=organization
        )

        instructors_qs = User.objects.filter(
            organization_memberships__organization=organization,
            organization_memberships__is_active=True,
            organization_memberships__role=OrganizationMembership.Role.INSTRUCTOR,
        ).distinct()

        learners_qs = User.objects.filter(
            organization_memberships__organization=organization,
            organization_memberships__is_active=True,
            organization_memberships__role=OrganizationMembership.Role.LEARNER,
        ).distinct()

        courses_qs = Course.objects.filter(company=organization)
        course_ids = courses_qs.values_list("id", flat=True)

        revenue_qs = Payment.objects.filter(
            course_id__in=course_ids,
            status=Payment.Status.PAID,
        )

        stats = {
            "total_courses": courses_qs.count(),
            "published_courses": courses_qs.filter(status=Course.Status.PUBLISHED).count(),
            "draft_courses": courses_qs.filter(status=Course.Status.DRAFT).count(),
            "review_courses": courses_qs.filter(status=Course.Status.REVIEW).count(),
            "archived_courses": courses_qs.filter(status=Course.Status.ARCHIVED).count(),
            "total_enrollments": enrollments_qs.count(),
            "active_enrollments": enrollments_qs.filter(status=Enrollment.Status.ACTIVE).count()
            if hasattr(Enrollment, "Status") else enrollments_qs.count(),
            "total_lessons": lessons_qs.count(),
            "total_instructors": instructors_qs.count(),
            "total_learners": learners_qs.count(),
            "total_revenue": revenue_qs.aggregate(
                v=Coalesce(Sum("amount"), Value(Decimal("0.00")),
                           output_field=DecimalField(max_digits=12, decimal_places=2), ))["v"],
            "avg_progress": LessonProgress.objects.filter(
                enrollment__course__company=organization
            ).aggregate(
                v=Coalesce(
                    Avg("progress_percent"),
                    Value(0.0),
                    output_field=FloatField(),
                )
            )["v"],
        }

        recent_courses = (
            courses_qs
            .select_related("category", "instructor")
            .order_by("-updated_at")[:8]
        )

        # CORRECTIF : le template attend des OrganizationMembership (avec .user,
        # .get_role_display, .joined_at) — pas des User. Auparavant on passait
        # ``instructors_qs.order_by("-created_at")[:8]`` (queryset de User) ce
        # qui faisait planter le template avec VariableDoesNotExist sur
        # ``membership.user``. On bascule sur le bon modèle avec select_related.
        recent_instructors = (
            OrganizationMembership.objects.filter(
                organization=organization,
                is_active=True,
                role=OrganizationMembership.Role.INSTRUCTOR,
            )
            .select_related("user")
            .order_by("-joined_at")[:8]
        )
        recent_learners = (
            OrganizationMembership.objects.filter(
                organization=organization,
                is_active=True,
                role=OrganizationMembership.Role.LEARNER,
            )
            .select_related("user")
            .order_by("-joined_at")[:8]
        )

        top_categories = (
            Category.objects.filter(courses__company=organization)
            .annotate(
                course_count=Count(
                    "courses",
                    filter=Q(courses__company=organization),
                    distinct=True,
                )
            )
            .order_by("-course_count")[:5]
        )

        courses_needing_work = []

        courses_for_check = (
            courses_qs.annotate(
                sections_count=Coalesce(
                    Count("sections", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                lessons_count=Coalesce(
                    Count("sections__lessons", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                    ),
                    0,
                    output_field=DecimalField(max_digits=5, decimal_places=2),
                ),
            )
            .order_by("-updated_at")[:10]
        )

        for course in courses_for_check:
            issues = []

            if getattr(course, "sections_count", 0) == 0:
                issues.append("Aucune section")

            if getattr(course, "lessons_count", 0) == 0:
                issues.append("Aucune leçon")

            if (
                    getattr(course, "pricing_type", None) != "FREE"
                    and float(getattr(course, "price", 0) or 0) <= 0
            ):
                issues.append("Prix non défini")

            if not getattr(course, "thumbnail", None):
                issues.append("Thumbnail manquant")

            if issues:
                courses_needing_work.append({
                    "id": course.id,
                    "title": course.title,
                    "status": course.status,
                    "issues": issues,
                })

        # ============================================================
        # Statistiques avancées : tendances, top cours, distribution.
        # ============================================================
        now = timezone.now()
        last_30 = now - datetime.timedelta(days=30)
        last_90 = now - datetime.timedelta(days=90)

        # Top 5 cours par nombre d'inscrits.
        top_courses_by_enrollments = (
            courses_qs
            .select_related("category", "instructor")
            .annotate(
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=FloatField(),
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                ),
            )
            .order_by("-enrolled_count", "-updated_at")[:5]
        )

        # Top 5 cours « tendance » : inscrits sur les 30 derniers jours.
        trending_courses = (
            courses_qs
            .select_related("category", "instructor")
            .annotate(
                recent_enrollments=Coalesce(
                    Count(
                        "enrollments",
                        filter=Q(enrollments__enrolled_at__gte=last_30),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .filter(recent_enrollments__gt=0)
            .order_by("-recent_enrollments")[:5]
        )

        # Top 5 cours par note moyenne (avec au moins 1 review publique).
        top_courses_by_rating = (
            courses_qs
            .select_related("category", "instructor")
            .annotate(
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=FloatField(),
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                ),
                rating_count=Coalesce(
                    Count(
                        "reviews",
                        filter=Q(reviews__is_public=True),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .filter(rating_count__gt=0)
            .order_by("-rating_avg", "-rating_count")[:5]
        )

        # Tendance : inscriptions par jour sur les 30 derniers jours.
        # (groupé en JOUR pour rester lisible côté graph et léger côté DB)
        enrollments_trend_qs = (
            enrollments_qs.filter(enrolled_at__gte=last_30)
            .annotate(day=TruncDate("enrolled_at"))
            .values("day")
            .annotate(n=Count("id"))
            .order_by("day")
        )
        enrollments_trend = [
            {"day": row["day"].isoformat() if row["day"] else "", "count": row["n"]}
            for row in enrollments_trend_qs
        ]

        # Top 5 formateurs de l'org par nombre d'inscrits cumulés sur
        # leurs cours (utile pour l'admin qui veut savoir quels
        # formateurs portent l'audience).
        top_instructors = (
            User.objects.filter(
                organization_memberships__organization=organization,
                organization_memberships__is_active=True,
                organization_memberships__role=(
                    OrganizationMembership.Role.INSTRUCTOR
                ),
            )
            .annotate(
                # NB: ``Course.instructor`` a related_name="courses_created",
                # pas "courses". Idem pour le filtre.
                courses_count=Coalesce(
                    Count(
                        "courses_created",
                        filter=Q(courses_created__company=organization),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_total=Coalesce(
                    Count(
                        "courses_created__enrollments",
                        filter=Q(courses_created__company=organization),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .filter(courses_count__gt=0)
            .order_by("-enrolled_total", "-courses_count")[:5]
        )

        # Statistiques quiz et complétion (signaux qualité du contenu).
        quiz_qs = Quiz.objects.filter(course__company=organization)
        completed_enrollments = enrollments_qs.filter(
            status=Enrollment.Status.COMPLETED
        ).count() if hasattr(Enrollment, "Status") else 0

        stats.update({
            "new_enrollments_30d": enrollments_qs.filter(
                enrolled_at__gte=last_30
            ).count(),
            "new_enrollments_90d": enrollments_qs.filter(
                enrolled_at__gte=last_90
            ).count(),
            "new_courses_30d": courses_qs.filter(
                created_at__gte=last_30
            ).count(),
            "completed_enrollments": completed_enrollments,
            "completion_rate": (
                (completed_enrollments / stats["total_enrollments"] * 100.0)
                if stats["total_enrollments"] else 0.0
            ),
            "total_quizzes": quiz_qs.count(),
            "active_quizzes": quiz_qs.filter(is_active=True).count(),
            "courses_unassigned": courses_qs.filter(
                instructor__isnull=True
            ).count(),
        })

        context.update({
            "page_title": f"Dashboard — {organization.name}",
            "stats": stats,
            "recent_courses": recent_courses,
            "recent_instructors": recent_instructors,
            "recent_learners": recent_learners,
            "top_categories": top_categories,
            "courses_needing_work": courses_needing_work,
            "top_courses_by_enrollments": top_courses_by_enrollments,
            "trending_courses": trending_courses,
            "top_courses_by_rating": top_courses_by_rating,
            "top_instructors": top_instructors,
            "enrollments_trend": enrollments_trend,
            "member_create_url": reverse(
                "org:member_create",
                kwargs={"organization_id": organization.id},
            ),
            "course_create_url": reverse(
                "org:course_create",
                kwargs={"organization_id": organization.id},
            ),
            "media_library_url": reverse(
                "org:media_library",
                kwargs={"organization_id": organization.id},
            ),
        })

        return context


class OrganizationMemberCreateView(OrganizationScopedMixin, FormView):
    template_name = "organization/member_create.html"
    form_class = OrganizationMemberCreateForm
    allowed_org_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
    )

    def form_valid(self, form):
        result = OrganizationMemberManagementService.create_member(
            organization=self.organization,
            actor=self.request.user,
            role=form.cleaned_data["role"],
            email=form.cleaned_data["email"],
            full_name=form.cleaned_data.get("full_name", ""),
            phone=form.cleaned_data.get("phone", ""),
            password=form.cleaned_data.get("password") or None,
            send_invitation_if_no_password=form.cleaned_data.get(
                "send_invitation_if_no_password",
                True,
            ),
        )

        user = result["user"]
        membership = result["membership"]

        messages.success(
            self.request,
            f"{user.email} a été ajouté comme {membership.get_role_display()}."
        )

        return redirect(
            reverse(
                "org:members",
                kwargs={"organization_id": self.organization.id},
            )
        )

    def get_success_url(self):
        return reverse(
            "org:members",
            kwargs={"organization_id": self.organization.id},
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = f"Créer un membre — {self.organization.name}"
        return context

class OrganizationInstructorCreateView(OrganizationMemberCreateView):
    def get_initial(self):
        initial = super().get_initial()
        initial["role"] = OrganizationMembership.Role.INSTRUCTOR
        return initial


class OrganizationLearnerCreateView(OrganizationMemberCreateView):
    def get_initial(self):
        initial = super().get_initial()
        initial["role"] = OrganizationMembership.Role.LEARNER
        return initial


class OrganizationCourseCreateView(OrganizationScopedMixin, FormView):
    template_name = "organization/course_create.html"
    form_class = OrganizationCourseCreateForm

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["organization"] = self.organization
        kwargs["user"] = self.request.user
        return kwargs

    def form_valid(self, form):
        course = form.save()

        messages.success(
            self.request,
            "Le cours a été créé et rattaché à l'organisation."
        )

        return redirect(self.get_success_url(course))

    def get_success_url(self, course=None):
        return reverse(
            "org:dashboard",
            kwargs={"organization_id": self.organization.id},
        )


class OrganizationMembersView(OrganizationScopedMixin, TemplateView):
    template_name = "organization/members.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # On affiche désormais les memberships ACTIFS et inactifs : un
        # admin doit pouvoir réactiver un membre désactivé sans qu'il
        # disparaisse silencieusement de la liste. Le tri place les
        # actifs en premier.
        memberships = (
            OrganizationMembership.objects.filter(organization=self.organization)
            .select_related("user", "invited_by")
            .order_by("-is_active", "role", "user__full_name", "user__email")
        )

        # Compteurs par rôle (utilisés par le template).
        active_qs = memberships.filter(is_active=True)
        admin_count = active_qs.filter(
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ]
        ).count()
        instructor_count = active_qs.filter(
            role=OrganizationMembership.Role.INSTRUCTOR
        ).count()
        learner_count = active_qs.filter(
            role=OrganizationMembership.Role.LEARNER
        ).count()

        context.update({
            "memberships": memberships,
            "admins_count": admin_count,
            "instructors_count": instructor_count,
            "learners_count": learner_count,
            "page_title": f"Membres — {self.organization.name}",
        })
        return context


class OrganizationMemberDetailView(OrganizationScopedMixin, TemplateView):
    """Vue détaillée d'un membership : profil, rôle, activité.

    Adapte le contenu selon le rôle :
    - LEARNER : ses inscriptions, sa progression, ses tentatives quiz.
    - INSTRUCTOR : les cours qu'il pilote dans l'org, le total inscrits,
      son rating moyen, sa charge éditoriale (sections / leçons).
    - OWNER / ADMIN / MANAGER : indicateurs de management (membres
      invités, cours créés…).
    """

    template_name = "organization/member_detail.html"

    def get_membership(self):
        if not hasattr(self, "_membership"):
            self._membership = get_object_or_404(
                OrganizationMembership.objects
                .select_related("user", "organization", "invited_by"),
                pk=self.kwargs["membership_id"],
                organization=self.organization,
            )
        return self._membership

    def get_context_data(self, **kwargs):
        from assessments.models import Attempt

        context = super().get_context_data(**kwargs)
        membership = self.get_membership()
        user = membership.user
        organization = self.organization

        # ----- Inscriptions du membre dans des cours de l'org -----------
        # On limite à ses inscriptions sur des cours rattachés à l'org
        # courante : sinon on leak des cours d'autres orgs auxquels
        # l'utilisateur s'est inscrit ailleurs en tant que B2C.
        enrollments_qs = (
            Enrollment.objects.filter(user=user, course__company=organization)
            .select_related("course", "course__category", "current_lesson")
            .order_by("-enrolled_at")
        )

        enrollments_total = enrollments_qs.count()
        enrollments_completed = (
            enrollments_qs.filter(status=Enrollment.Status.COMPLETED).count()
            if hasattr(Enrollment, "Status") else 0
        )
        enrollments_active = (
            enrollments_qs.filter(status=Enrollment.Status.ACTIVE).count()
            if hasattr(Enrollment, "Status") else enrollments_total
        )
        avg_progress = enrollments_qs.aggregate(
            v=Coalesce(
                Avg("progress_percent"),
                Value(0.0),
                output_field=FloatField(),
            )
        )["v"]

        # ----- Cours pilotés par le membre dans l'organisation ----------
        # (rempli quand le membre est INSTRUCTOR ou autre rôle qui crée
        # du contenu — l'attribut ``instructor`` du Course pointe vers
        # ce user et le cours a ``company == self.organization``.)
        courses_taught = (
            Course.objects.filter(company=organization, instructor=user)
            .select_related("category", "instructor")
            .annotate(
                sections_count=Coalesce(
                    Count("sections", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                lessons_count=Coalesce(
                    Count("sections__lessons", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=FloatField(),
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                ),
            )
            .order_by("-updated_at")
        )

        teaching_stats = {
            "courses_count": courses_taught.count(),
            "total_enrolled": courses_taught.aggregate(
                v=Coalesce(Sum("enrolled_count"), 0, output_field=IntegerField())
            )["v"],
            "total_lessons": courses_taught.aggregate(
                v=Coalesce(Sum("lessons_count"), 0, output_field=IntegerField())
            )["v"],
            "rating_avg": courses_taught.aggregate(
                v=Coalesce(Avg("rating_avg"), Value(0.0), output_field=FloatField())
            )["v"],
        }

        # ----- Tentatives quiz sur des cours de l'org -------------------
        attempts_qs = (
            Attempt.objects.filter(
                user=user,
                quiz__course__company=organization,
                submitted_at__isnull=False,
            )
            .select_related("quiz", "quiz__course")
            .order_by("-submitted_at")
        )
        attempts_total = attempts_qs.count()
        attempts_passed = attempts_qs.filter(passed=True).count()
        recent_attempts = attempts_qs[:10]

        # ----- Activité de management (si OWNER/ADMIN/MANAGER) ----------
        # Membres invités par cet utilisateur dans CETTE organisation.
        invited_count = (
            OrganizationMembership.objects.filter(
                organization=organization,
                invited_by=user,
            ).count()
        )

        # ----- Progression détaillée par cours --------------------------
        # On prend les 10 inscriptions les plus récentes pour la liste
        # détaillée afin de garder la page rapide.
        recent_enrollments = list(enrollments_qs[:10])

        context.update({
            "membership": membership,
            "page_title": (
                f"{user.full_name or user.email} — {organization.name}"
            ),
            # Profil
            "user_obj": user,
            # Inscriptions
            "enrollments_total": enrollments_total,
            "enrollments_completed": enrollments_completed,
            "enrollments_active": enrollments_active,
            "avg_progress": avg_progress,
            "recent_enrollments": recent_enrollments,
            # Côté formateur
            "courses_taught": courses_taught,
            "teaching_stats": teaching_stats,
            # Quiz
            "attempts_total": attempts_total,
            "attempts_passed": attempts_passed,
            "attempts_pass_rate": (
                (attempts_passed / attempts_total * 100.0)
                if attempts_total else 0.0
            ),
            "recent_attempts": recent_attempts,
            # Management
            "invited_count": invited_count,
            # Bornes de rôle pour le template (évite les chaînes magiques)
            "ROLE_OWNER": OrganizationMembership.Role.OWNER,
            "ROLE_ADMIN": OrganizationMembership.Role.ADMIN,
            "ROLE_INSTRUCTOR": OrganizationMembership.Role.INSTRUCTOR,
            "ROLE_LEARNER": OrganizationMembership.Role.LEARNER,
        })
        return context


class OrganizationMemberUpdateView(OrganizationScopedMixin, FormView):
    """Édition d'un membership : rôle, identité, statut actif/inactif.

    Réservé aux OWNER / ADMIN (pas MANAGER).
    """

    template_name = "organization/member_update.html"
    form_class = OrganizationMemberUpdateForm

    allowed_org_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
    )

    def get_membership(self):
        if not hasattr(self, "_membership"):
            self._membership = get_object_or_404(
                OrganizationMembership.objects.select_related("user", "organization"),
                pk=self.kwargs["membership_id"],
                organization=self.organization,
            )
        return self._membership

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["membership"] = self.get_membership()
        return kwargs

    def form_valid(self, form):
        membership = self.get_membership()
        try:
            OrganizationMemberManagementService.update_member(
                actor=self.request.user,
                organization=self.organization,
                membership=membership,
                role=form.cleaned_data["role"],
                full_name=form.cleaned_data.get("full_name"),
                phone=form.cleaned_data.get("phone"),
                is_active=form.cleaned_data.get("is_active"),
            )
        except (PermissionDenied, Exception) as e:
            # On remet le message dans le formulaire pour l'afficher
            # — bien plus utile qu'un 500 pour une violation métier.
            from django.core.exceptions import ValidationError as _VE
            if isinstance(e, _VE):
                form.add_error(None, e.message if hasattr(e, "message") else str(e))
                return self.form_invalid(form)
            raise

        messages.success(
            self.request,
            f"Le membre « {membership.user.full_name or membership.user.email} » "
            "a été mis à jour."
        )
        return redirect(self.get_success_url())

    def get_success_url(self):
        return reverse(
            "org:members",
            kwargs={"organization_id": self.organization.id},
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        membership = self.get_membership()
        context.update({
            "membership": membership,
            "page_title": (
                f"Modifier {membership.user.full_name or membership.user.email}"
            ),
        })
        return context


class OrganizationMemberDeactivateView(OrganizationScopedMixin, TemplateView):
    """Désactivation d'un membership (POST only). On préserve l'historique.

    Réservé aux OWNER / ADMIN.
    """

    http_method_names = ["post"]
    template_name = "organization/members.html"  # placeholder, jamais rendu

    allowed_org_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
    )

    def post(self, request, *args, **kwargs):
        membership = get_object_or_404(
            OrganizationMembership.objects.select_related("user"),
            pk=kwargs["membership_id"],
            organization=self.organization,
        )

        try:
            OrganizationMemberManagementService.deactivate_member(
                actor=request.user,
                organization=self.organization,
                membership=membership,
            )
        except Exception as e:
            from django.core.exceptions import ValidationError as _VE
            if isinstance(e, _VE):
                messages.error(request, e.message if hasattr(e, "message") else str(e))
            else:
                raise
        else:
            messages.success(
                request,
                f"« {membership.user.full_name or membership.user.email} » "
                "a été désactivé. L'historique est conservé."
            )

        return redirect(
            "org:members",
            organization_id=self.organization.id,
        )


class OrganizationMemberReactivateView(OrganizationScopedMixin, TemplateView):
    http_method_names = ["post"]
    template_name = "organization/members.html"  # placeholder

    allowed_org_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
    )

    def post(self, request, *args, **kwargs):
        membership = get_object_or_404(
            OrganizationMembership.objects.select_related("user"),
            pk=kwargs["membership_id"],
            organization=self.organization,
        )

        try:
            OrganizationMemberManagementService.reactivate_member(
                actor=request.user,
                organization=self.organization,
                membership=membership,
            )
        except Exception as e:
            from django.core.exceptions import ValidationError as _VE
            if isinstance(e, _VE):
                messages.error(request, e.message if hasattr(e, "message") else str(e))
            else:
                raise
        else:
            messages.success(
                request,
                f"« {membership.user.full_name or membership.user.email} » "
                "a été réactivé."
            )

        return redirect(
            "org:members",
            organization_id=self.organization.id,
        )


class OrganizationCoursesView(OrganizationScopedMixin, TemplateView):
    template_name = "organization/courses.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        courses = (
            Course.objects.filter(company=self.organization)
            .select_related("category", "instructor")
            .annotate(
                sections_count=Coalesce(
                    Count("sections", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                lessons_count=Coalesce(
                    Count("sections__lessons", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
            )
            .order_by("-updated_at")
        )

        instructor_distribution = (
            courses.values(
                "instructor_id",
                "instructor__full_name",
                "instructor__email",
            )
            .annotate(course_count=Count("id", distinct=True))
            .order_by("-course_count")
        )

        context["courses"] = courses
        context["total_sections"] = courses.aggregate(v=Coalesce(Sum("sections_count"), 0))["v"]
        context["total_lessons"] = courses.aggregate(v=Coalesce(Sum("lessons_count"), 0))["v"]
        context["total_enrollments"] = courses.aggregate(v=Coalesce(Sum("enrolled_count"), 0))["v"]
        context["instructor_distribution"] = [
            {
                "instructor_id": row["instructor_id"],
                "instructor_name": row["instructor__full_name"] or row["instructor__email"],
                "course_count": row["course_count"],
            }
            for row in instructor_distribution
        ]
        context["page_title"] = f"Cours — {self.organization.name}"
        return context


class OrganizationCourseBuilderView(OrganizationScopedMixin, TemplateView):
    template_name = "organization/course_builder.html"

    def get_course(self):
        return get_object_or_404(
            Course.objects.select_related("category", "instructor", "company"),
            pk=self.kwargs["course_id"],
            company=self.organization,
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()

        sections = (
            CourseSection.objects.filter(course=course)
            .annotate(lessons_count=Count("lessons"))
            .prefetch_related("lessons")
            .order_by("order", "id")
        )

        context.update({
            "course": course,
            "sections": sections,
            "page_title": f"Builder — {course.title}",
            "section_create_url": reverse(
                "org:section_create",
                kwargs={
                    "organization_id": self.organization.id,
                    "course_id": course.id,
                },
            ),
        })
        return context


class OrganizationCourseSectionCreateView(OrganizationScopedMixin, FormView):
    template_name = "organization/section_create.html"
    form_class = OrganizationSectionCreateForm

    def get_course(self):
        return get_object_or_404(
            Course,
            pk=self.kwargs["course_id"],
            company=self.organization,
        )

    def form_valid(self, form):
        course = self.get_course()
        section = form.save(commit=False)
        section.course = course
        section.save()

        messages.success(self.request, "La section a été créée avec succès.")
        return redirect(self.get_success_url())

    def get_success_url(self):
        return reverse(
            "org:course_builder",
            kwargs={
                "organization_id": self.organization.id,
                "course_id": self.kwargs["course_id"],
            },
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["course"] = self.get_course()
        context["page_title"] = "Créer une section"
        return context


class OrganizationLessonCreateView(OrganizationScopedMixin, FormView):
    template_name = "organization/lesson_create.html"
    form_class = OrganizationLessonCreateForm

    def get_course(self):
        return get_object_or_404(
            Course,
            pk=self.kwargs["course_id"],
            company=self.organization,
        )

    def get_section(self):
        return get_object_or_404(
            CourseSection,
            pk=self.kwargs["section_id"],
            course=self.get_course(),
        )

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        # On expose les médias appartenant à l'organisation, pas seulement
        # ceux de l'utilisateur courant : un org admin doit pouvoir
        # rattacher une leçon à un média uploadé par n'importe quel
        # formateur de l'organisation.
        kwargs["organization"] = self.organization
        return kwargs

    def form_valid(self, form):
        section = self.get_section()

        lesson = form.save(commit=False)
        lesson.section = section
        lesson.save()

        messages.success(self.request, "La leçon a été créée avec succès.")
        return redirect(self.get_success_url())

    def get_success_url(self):
        return reverse(
            "org:course_builder",
            kwargs={
                "organization_id": self.organization.id,
                "course_id": self.kwargs["course_id"],
            },
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()
        section = self.get_section()

        context.update({
            "course": course,
            "section": section,
            "page_title": f"Créer une leçon — {section.title}",
        })
        return context


class OrganizationCourseDetailView(OrganizationScopedMixin, DetailView):
    model = Course
    template_name = "organization/course_detail.html"
    context_object_name = "course"
    pk_url_kwarg = "course_id"

    def get_queryset(self):
        return (
            Course.objects.filter(company=self.organization)
            .select_related("category", "instructor", "company")
            .annotate(
                sections_count=Coalesce(
                    Count("sections", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                lessons_count=Coalesce(
                    Count("sections__lessons", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                enrolled_count=Coalesce(
                    Count("enrollments", distinct=True),
                    0,
                    output_field=IntegerField(),
                ),
                rating_avg=Coalesce(
                    Avg(
                        "reviews__rating",
                        filter=Q(reviews__is_public=True),
                        output_field=FloatField(),
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                ),
                rating_count=Coalesce(
                    Count(
                        "reviews",
                        filter=Q(reviews__is_public=True),
                        distinct=True,
                    ),
                    0,
                    output_field=IntegerField(),
                ),
            )
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.object

        sections = (
            CourseSection.objects.filter(course=course)
            .annotate(
                lessons_count=Coalesce(
                    Count("lessons", distinct=True),
                    0,
                    output_field=IntegerField(),
                )
            )
            .prefetch_related("lessons")
            .order_by("order", "id")
        )

        enrollments = (
            Enrollment.objects.filter(course=course)
            .select_related("user")
            .order_by("-created_at")[:10]
        )

        progress_avg = (
            LessonProgress.objects.filter(enrollment__course=course)
            .aggregate(
                v=Coalesce(
                    Avg("progress_percent"),
                    Value(0.0),
                    output_field=FloatField(),
                )
            )["v"]
        )

        issues = []

        if course.sections_count == 0:
            issues.append("Aucune section")
        if course.lessons_count == 0:
            issues.append("Aucune leçon")
        if course.pricing_type != Course.PricingType.FREE and Decimal(str(course.price or 0)) <= 0:
            issues.append("Prix non défini")
        if not course.thumbnail:
            issues.append("Thumbnail manquant")
        if not course.instructor_id:
            issues.append("Formateur non défini")

        context.update({
            "page_title": f"Détail cours — {course.title}",
            "organization": self.organization,
            "sections": sections,
            "recent_enrollments": enrollments,
            "progress_avg": progress_avg,
            "issues": issues,
            "builder_url": reverse(
                "org:course_builder",
                kwargs={
                    "organization_id": self.organization.id,
                    "course_id": course.id,
                },
            ),
            "courses_url": reverse(
                "org:courses",
                kwargs={"organization_id": self.organization.id},
            ),
            "course_create_url": reverse(
                "org:course_create",
                kwargs={"organization_id": self.organization.id},
            ),
            "section_create_url": reverse(
                "org:section_create",
                kwargs={
                    "organization_id": self.organization.id,
                    "course_id": course.id,
                },
            ),
        })

        return context


class OrganizationCourseAssignLearnersView(OrganizationScopedMixin, FormView):
    template_name = "organization/course_assign_learners.html"
    form_class = OrganizationCourseAssignLearnersForm

    def get_course(self):
        if not hasattr(self, "_course"):
            self._course = get_object_or_404(
                Course,
                pk=self.kwargs["course_id"],
                company=self.organization,
                company_only=True,
            )
        return self._course

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["organization"] = self.organization
        kwargs["course"] = self.get_course()
        return kwargs

    def form_valid(self, form):
        course = self.get_course()
        learners = form.cleaned_data["learners"]

        created_count = 0
        existing_count = 0

        for learner in learners:
            enrollment, created = Enrollment.objects.get_or_create(
                user=learner,
                course=course,
                defaults={
                    "status": Enrollment.Status.ACTIVE,
                    "source": Enrollment.Source.COMPANY,
                    "company": self.organization,
                },
            )

            if created:
                created_count += 1
            else:
                existing_count += 1
                changed_fields = []
                if enrollment.status != Enrollment.Status.ACTIVE:
                    enrollment.status = Enrollment.Status.ACTIVE
                    changed_fields.append("status")
                if enrollment.source != Enrollment.Source.COMPANY:
                    enrollment.source = Enrollment.Source.COMPANY
                    changed_fields.append("source")
                if enrollment.company_id != self.organization.id:
                    enrollment.company = self.organization
                    changed_fields.append("company")
                if changed_fields:
                    enrollment.save(update_fields=changed_fields)

        messages.success(
            self.request,
            f"{created_count} apprenant(s) affecté(s). {existing_count} déjà inscrit(s)."
        )

        return redirect(self.get_success_url())

    def get_success_url(self):
        return reverse(
            "org:course_detail",
            kwargs={
                "organization_id": self.organization.id,
                "course_id": self.get_course().id,
            },
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()

        context.update({
            "course": course,
            "page_title": f"Affecter des apprenants — {course.title}",
        })

        return context


# ----------------------------------------------------------------------
# Affectation d'un cours à un FORMATEUR de l'organisation.
#
# Règle métier (cf. demande user) : on ne peut affecter un formateur
# QUE si le cours appartient à l'organisation (``company == org``) ; ce
# qui est garanti par ``get_object_or_404(... company=self.organization)``
# couplé au ``clean()`` du formulaire.
# ----------------------------------------------------------------------
class OrganizationCourseAssignInstructorView(OrganizationScopedMixin, FormView):
    template_name = "organization/course_assign_instructor.html"
    form_class = OrganizationCourseAssignInstructorForm

    # Réservé aux OWNER / ADMIN — pas aux MANAGER.
    allowed_org_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
    )

    def get_course(self):
        if not hasattr(self, "_course"):
            self._course = get_object_or_404(
                Course.objects.select_related("instructor"),
                pk=self.kwargs["course_id"],
                company=self.organization,
            )
        return self._course

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["organization"] = self.organization
        kwargs["course"] = self.get_course()
        return kwargs

    def form_valid(self, form):
        course = self.get_course()
        new_instructor = form.cleaned_data["instructor"]

        previous = course.instructor
        course.instructor = new_instructor
        course.save(update_fields=["instructor", "updated_at"])

        if previous and previous.pk == new_instructor.pk:
            messages.info(
                self.request,
                f"« {course.title} » est déjà affecté à "
                f"{new_instructor.full_name or new_instructor.email}.",
            )
        else:
            messages.success(
                self.request,
                f"« {course.title} » a été affecté à "
                f"{new_instructor.full_name or new_instructor.email}.",
            )

        return redirect(self.get_success_url())

    def get_success_url(self):
        return reverse(
            "org:course_detail",
            kwargs={
                "organization_id": self.organization.id,
                "course_id": self.kwargs["course_id"],
            },
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()
        context.update({
            "course": course,
            "page_title": f"Affecter un formateur — {course.title}",
        })
        return context


# ----------------------------------------------------------------------
# Quiz côté organisation.
#
# Pré-requis : le cours doit être rattaché à l'organisation (``company``).
# C'est ce qui garantit qu'un OWNER ne peut pas créer de quiz sur un
# cours externe à son périmètre.
# ----------------------------------------------------------------------
class _OrganizationQuizScopedMixin(OrganizationScopedMixin):
    """Helpers communs aux vues quiz côté org."""

    def get_course(self):
        if not hasattr(self, "_course"):
            self._course = get_object_or_404(
                Course.objects.select_related("instructor", "company"),
                pk=self.kwargs["course_id"],
                company=self.organization,
            )
        return self._course

    def get_quiz(self):
        if not hasattr(self, "_quiz"):
            course = self.get_course()
            self._quiz = get_object_or_404(
                Quiz.objects.select_related("course", "section"),
                pk=self.kwargs["quiz_id"],
                course=course,
            )
        return self._quiz


class OrganizationCourseQuizListView(_OrganizationQuizScopedMixin, TemplateView):
    template_name = "organization/quiz_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()
        quizzes = (
            Quiz.objects.filter(course=course)
            .select_related("section")
            .annotate(
                question_count=Count("questions", distinct=True),
                attempt_count=Count("attempts", distinct=True),
                pass_rate=Coalesce(
                    Avg(
                        "attempts__score_percent",
                        filter=Q(attempts__submitted_at__isnull=False),
                    ),
                    Value(0.0),
                    output_field=FloatField(),
                ),
            )
            .order_by("section__order", "title")
        )
        context.update({
            "course": course,
            "quizzes": quizzes,
            "page_title": f"Quiz — {course.title}",
            "quiz_create_url": reverse(
                "org:quiz_create",
                kwargs={
                    "organization_id": self.organization.id,
                    "course_id": course.id,
                },
            ),
        })
        return context


class OrganizationQuizCreateView(_OrganizationQuizScopedMixin, FormView):
    template_name = "organization/quiz_create.html"
    form_class = OrganizationQuizCreateForm

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["course"] = self.get_course()
        return kwargs

    def form_valid(self, form):
        quiz = form.save()
        messages.success(
            self.request,
            f"Le quiz « {quiz.title} » a été créé. Vous pouvez maintenant "
            "ajouter des questions.",
        )
        return redirect(
            "org:quiz_detail",
            organization_id=self.organization.id,
            course_id=self.kwargs["course_id"],
            quiz_id=quiz.id,
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()
        context.update({
            "course": course,
            "page_title": f"Créer un quiz — {course.title}",
        })
        return context


class OrganizationQuizDetailView(_OrganizationQuizScopedMixin, FormView):
    """Détail + édition rapide d'un quiz côté organisation.

    L'édition fine des questions/réponses passe par les endpoints API
    instructor existants (qui acceptent désormais aussi les org admins
    grâce à l'élargissement de ``IsInstructor``).
    """

    template_name = "organization/quiz_detail.html"
    form_class = OrganizationQuizCreateForm

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["course"] = self.get_course()
        kwargs["instance"] = self.get_quiz()
        return kwargs

    def form_valid(self, form):
        quiz = form.save()
        messages.success(self.request, "Le quiz a été mis à jour.")
        return redirect(
            "org:quiz_detail",
            organization_id=self.organization.id,
            course_id=self.kwargs["course_id"],
            quiz_id=quiz.id,
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        course = self.get_course()
        quiz = self.get_quiz()
        questions = (
            quiz.questions
            .prefetch_related("choices")
            .order_by("order", "id")
        )
        attempts_qs = quiz.attempts.filter(submitted_at__isnull=False)
        attempts_count = attempts_qs.count()
        passed_count = attempts_qs.filter(passed=True).count()
        avg_score = attempts_qs.aggregate(
            v=Coalesce(Avg("score_percent"), Value(0.0), output_field=FloatField())
        )["v"]

        context.update({
            "course": course,
            "quiz": quiz,
            "questions": questions,
            "stats": {
                "questions_count": questions.count(),
                "attempts_count": attempts_count,
                "passed_count": passed_count,
                "pass_rate": (passed_count / attempts_count * 100.0) if attempts_count else 0.0,
                "avg_score": avg_score,
            },
            "page_title": f"Quiz — {quiz.title}",
        })
        return context


# ----------------------------------------------------------------------
# Bibliothèque média côté organisation.
#
# On filtre sur ``MediaAsset.organization == self.organization`` ; les
# médias purement personnels d'un membre (sans org) ne fuitent pas vers
# l'admin org.
# ----------------------------------------------------------------------
class OrganizationMediaLibraryView(OrganizationScopedMixin, ListView):
    template_name = "organization/media_library.html"
    context_object_name = "assets"
    paginate_by = 24

    def get_queryset(self):
        qs = (
            MediaAsset.objects.filter(organization=self.organization)
            .select_related("owner")
            .order_by("-created_at")
        )
        kind = (self.request.GET.get("kind") or "").strip()
        if kind:
            qs = qs.filter(kind=kind)
        q = (self.request.GET.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(object_key__icontains=q))
        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        all_qs = MediaAsset.objects.filter(organization=self.organization)
        context.update({
            "page_title": f"Bibliothèque média — {self.organization.name}",
            "filter_kind": self.request.GET.get("kind", ""),
            "filter_q": self.request.GET.get("q", ""),
            "totals": {
                "all": all_qs.count(),
                "video": all_qs.filter(kind="video").count(),
                "audio": all_qs.filter(kind="audio").count(),
                "doc": all_qs.filter(kind="doc").count(),
                "pending": all_qs.filter(processing_status="pending").count(),
                "processing": all_qs.filter(processing_status="processing").count(),
                "ready": all_qs.filter(processing_status="ready").count(),
                "failed": all_qs.filter(processing_status="failed").count(),
            },
            # Endpoint API existant utilisé par le widget d'upload.
            "media_upload_init_url": "/api/media/upload/init/",
            "media_upload_finalize_url": "/api/media/upload/finalize/",
        })
        return context
