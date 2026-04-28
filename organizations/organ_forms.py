from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

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

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)

        if user and "media_asset" in self.fields:
            self.fields["media_asset"].queryset = MediaAsset.objects.filter(owner=user)


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