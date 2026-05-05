from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from assessments.models import Quiz
from catalog.models import Course, CourseSection, Lesson, MediaAsset, Category
from compte.models import InstructorProfile, LearnerProfile
from organizations.models import Organization, OrganizationMembership, BusinessInterestRequest

User = get_user_model()


class OrganizationMemberCreateForm(forms.Form):
    role = forms.ChoiceField(
        choices=OrganizationMembership.Role.choices,
        label="Rôle",
    )

    full_name = forms.CharField(
        max_length=160,
        required=False,
        label="Nom complet",
    )

    email = forms.EmailField(
        label="Email",
    )

    phone = forms.CharField(
        max_length=30,
        required=False,
        label="Téléphone",
    )

    password = forms.CharField(
        required=False,
        widget=forms.PasswordInput,
        label="Mot de passe",
        help_text="Laissez vide pour envoyer une invitation.",
    )

    send_invitation_if_no_password = forms.BooleanField(
        required=False,
        initial=True,
        label="Envoyer une invitation si aucun mot de passe n’est défini",
    )

    def clean_email(self):
        return self.cleaned_data["email"].strip().lower()

    def clean_password(self):
        password = self.cleaned_data.get("password")
        if password:
            validate_password(password)
        return password

    def clean(self):
        cleaned = super().clean()
        password = cleaned.get("password")
        send_invitation = cleaned.get("send_invitation_if_no_password")

        if not password and not send_invitation:
            raise forms.ValidationError(
                "Définissez un mot de passe ou activez l’envoi d’invitation."
            )

        return cleaned


class OrganizationCourseCreateForm(forms.ModelForm):
    class Meta:
        model = Course
        fields = [
            "title",
            "subtitle",
            "slug",
            "description",
            "category",
            "instructor",
            "course_type",
            "pricing_type",
            "price",
            "currency",
            "thumbnail",
            "preview_video_url",
            "status",
        ]

    def __init__(self, *args, organization=None, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.organization = organization
        self.user = user

        if organization is not None and "instructor" in self.fields:
            self.fields["instructor"].required = False
            self.fields["instructor"].queryset = User.objects.filter(
                organization_memberships__organization=organization,
                organization_memberships__is_active=True,
                organization_memberships__role=OrganizationMembership.Role.INSTRUCTOR,
                is_active=True,
            ).distinct()

    def clean_instructor(self):
        instructor = self.cleaned_data.get("instructor")

        if instructor:
            return instructor

        user = self.user
        organization = self.organization

        if not user or not organization:
            raise forms.ValidationError("Aucun formateur sélectionné.")

        is_org_instructor = OrganizationMembership.objects.filter(
            organization=organization,
            user=user,
            is_active=True,
            role=OrganizationMembership.Role.INSTRUCTOR,
        ).exists()

        if is_org_instructor:
            return user

        raise forms.ValidationError(
            "Veuillez sélectionner un formateur rattaché à cette organisation."
        )

    def save(self, commit=True):
        course = super().save(commit=False)

        if self.organization is not None:
            course.company = self.organization
            course.company_only = True

        if commit:
            course.save()
            self.save_m2m()

        return course


class OrganizationSectionCreateForm(forms.ModelForm):
    class Meta:
        model = CourseSection
        fields = ["title", "order"]


class OrganizationLessonCreateForm(forms.ModelForm):
    class Meta:
        model = Lesson
        fields = [
            "title",
            "order",
            "lesson_type",
            "is_preview",
            "duration_sec",
            "content",
            "video_url",
            "file",
            "media_asset",
        ]

    def __init__(self, *args, user=None, organization=None, **kwargs):
        super().__init__(*args, **kwargs)

        # On élargit la queryset ``media_asset`` aux médias visibles dans
        # l'organisation courante (et plus seulement ceux dont ``owner``
        # est le user) : un org admin doit pouvoir réutiliser les médias
        # uploadés par n'importe quel membre INSTRUCTOR de son org.
        if "media_asset" in self.fields:
            qs = MediaAsset.objects.none()
            if organization is not None:
                qs = MediaAsset.objects.filter(organization=organization)
                if user is not None:
                    qs = qs | MediaAsset.objects.filter(owner=user)
            elif user is not None:
                qs = MediaAsset.objects.filter(owner=user)
            self.fields["media_asset"].queryset = qs.distinct()


class OrganizationCourseAssignInstructorForm(forms.Form):
    """Affecte un cours d'organisation à un formateur de cette organisation.

    Règles métier :
    - le cours doit déjà être rattaché à l'organisation (``company=org``) ;
    - le formateur cible doit être un membership actif ``INSTRUCTOR`` de
      cette même organisation (filtre côté queryset).
    """

    instructor = forms.ModelChoiceField(
        queryset=User.objects.none(),
        required=True,
        label="Formateur",
        help_text="Choisissez un formateur rattaché à cette organisation.",
    )

    def __init__(self, *args, organization=None, course=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.organization = organization
        self.course = course

        if organization is not None:
            self.fields["instructor"].queryset = (
                User.objects.filter(
                    organization_memberships__organization=organization,
                    organization_memberships__is_active=True,
                    organization_memberships__role=(
                        OrganizationMembership.Role.INSTRUCTOR
                    ),
                    is_active=True,
                )
                .distinct()
                .order_by("full_name", "email")
            )

    def clean(self):
        cleaned = super().clean()

        # Garde-fou : on ne laisse affecter un formateur QUE si le cours
        # est bien créé pour / rattaché à l'organisation. Cela couvre la
        # contrainte demandée : « uniquement si le cours est créé par
        # l'admin ou un membre de l'organisation ».
        if self.course is None or self.organization is None:
            raise forms.ValidationError(
                "Contexte d'affectation invalide."
            )

        if self.course.company_id != self.organization.id:
            raise forms.ValidationError(
                "Ce cours n'appartient pas à votre organisation et ne "
                "peut donc pas être réaffecté ici."
            )

        return cleaned


class OrganizationQuizCreateForm(forms.ModelForm):
    """Création / édition d'un quiz lié à un cours d'organisation.

    Le ``course`` est imposé par la vue (FK courante d'URL) — on ne le
    met PAS dans le formulaire pour éviter qu'un user manipule la
    requête. Idem pour ``section`` qui est limité aux sections du cours.
    """

    class Meta:
        model = Quiz
        fields = [
            "title",
            "section",
            "passing_score",
            "max_attempts",
            "is_active",
        ]
        widgets = {
            "passing_score": forms.NumberInput(attrs={"min": 0, "max": 100}),
            "max_attempts": forms.NumberInput(attrs={"min": 1}),
        }

    def __init__(self, *args, course=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.course = course

        if course is not None and "section" in self.fields:
            self.fields["section"].required = False
            self.fields["section"].queryset = (
                CourseSection.objects.filter(course=course).order_by("order")
            )
            self.fields["section"].help_text = (
                "Optionnel : rattachez le quiz à une section précise du "
                "cours pour qu'il s'affiche au bon endroit."
            )

    def save(self, commit=True):
        quiz = super().save(commit=False)
        if self.course is not None:
            quiz.course = self.course
        if commit:
            quiz.save()
            self.save_m2m()
        return quiz


class OrganizationCourseAssignLearnersForm(forms.Form):
    learners = forms.ModelMultipleChoiceField(
        queryset=User.objects.none(),
        widget=forms.CheckboxSelectMultiple,
        required=True,
        label="Apprenants à affecter",
    )

    def __init__(self, *args, organization=None, course=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.organization = organization
        self.course = course
        self.fields["learners"].queryset = User.objects.filter(
            organization_memberships__organization=organization,
            organization_memberships__is_active=True,
            organization_memberships__role=OrganizationMembership.Role.LEARNER,
            is_active=True,
        ).distinct().order_by("full_name", "email")


class BusinessInterestRequestForm(forms.ModelForm):
    categories = forms.ModelMultipleChoiceField(
        queryset=Category.objects.all().order_by("name"),
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label="Formations / domaines souhaités",
    )
    class Meta:
        model = BusinessInterestRequest
        fields = [
            "organization_name",
            "contact_name",
            "email",
            "phone",
            "learners_count",
            "categories",
            "message",
        ]