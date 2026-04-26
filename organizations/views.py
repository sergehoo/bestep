from __future__ import annotations

from decimal import Decimal
from functools import cached_property

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.exceptions import PermissionDenied
from django.db.models import Avg, Count, DecimalField, IntegerField, Q, Sum, Value, FloatField
from django.db.models.functions import Coalesce
from django.http import Http404
from django.shortcuts import redirect, get_object_or_404
from django.urls import NoReverseMatch, reverse
from django.views.generic import FormView, TemplateView, DetailView
from catalog.models import Category, Course, Lesson, Payment, CourseSection
from enrollments.models import Enrollment, LessonProgress
from formations.Rolemixin import RoleRequiredMixin
from formations.views import _redirect_by_role
from organizations.models import OrganizationMembership, Organization
from organizations.organ_forms import OrganizationMemberCreateForm, OrganizationCourseCreateForm, \
    OrganizationSectionCreateForm, OrganizationLessonCreateForm, OrganizationCourseAssignLearnersForm
from organizations.services import OrganizationMemberManagementService
from organizations.utils import get_current_organization_for_user, get_user_admin_organizations

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
            except (Organization.DoesNotExist, ValueError, TypeError):
                raise PermissionDenied("Organisation introuvable.")

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
        except (ValueError, TypeError):
            raise PermissionDenied("Organisation introuvable.")

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

        recent_instructors = instructors_qs.order_by("-created_at")[:8]
        recent_learners = learners_qs.order_by("-created_at")[:8]

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

        context.update({
            "page_title": f"Dashboard — {organization.name}",
            "stats": stats,
            "recent_courses": recent_courses,
            "recent_instructors": recent_instructors,
            "recent_learners": recent_learners,
            "top_categories": top_categories,
            "courses_needing_work": courses_needing_work,
            "member_create_url": reverse(
                "org:member_create",
                kwargs={"organization_id": organization.id},
            ),
            "course_create_url": reverse(
                "org:course_create",
                kwargs={"organization_id": organization.id},
            ),
        })

        return context


class OrganizationMemberCreateView(OrganizationScopedMixin, FormView):
    template_name = "organization/member_create.html"
    form_class = OrganizationMemberCreateForm

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

        memberships = (
            OrganizationMembership.objects.filter(
                organization=self.organization,
                is_active=True,
            )
            .select_related("user", "invited_by")
            .order_by("role", "user__full_name", "user__email")
        )

        context["memberships"] = memberships
        context["page_title"] = f"Membres — {self.organization.name}"
        return context


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
                },
            )

            if created:
                created_count += 1
            else:
                existing_count += 1
                if enrollment.status != Enrollment.Status.ACTIVE:
                    enrollment.status = Enrollment.Status.ACTIVE
                    enrollment.save(update_fields=["status"])

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
