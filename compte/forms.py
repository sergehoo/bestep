from allauth.account.forms import SignupForm
from django import forms
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from tinymce.widgets import TinyMCE

from catalog.models import Lesson
from compte.models import LearnerProfile, LearnerKYC
User = get_user_model()

# class CustomSignupForm(SignupForm):
#     ROLE_CHOICES = (
#         ("learner", "Apprenant"),
#         ("instructor", "Formateur"),
#         ("business", "Entreprise"),
#     )
#
#     role = forms.ChoiceField(choices=ROLE_CHOICES, widget=forms.RadioSelect)
#
#     def save(self, request):
#         user = super().save(request)
#         role = self.cleaned_data["role"]
#
#         # Reset propre (évite états incohérents)
#         for f in ("is_learner", "is_instructor", "is_company_admin"):
#             if hasattr(user, f):
#                 setattr(user, f, False)
#
#         if role == "instructor" and hasattr(user, "is_instructor"):
#             user.is_instructor = True
#         elif role == "business" and hasattr(user, "is_company_admin"):
#             user.is_company_admin = True
#         elif hasattr(user, "is_learner"):
#             user.is_learner = True
#
#         user.save()
#         return user

class CustomSignupForm(SignupForm):
    full_name = forms.CharField(
        label="Nom complet",
        max_length=160,
        required=True,
        widget=forms.TextInput(attrs={"placeholder": "Ex: Serge Laroche"})
    )
    phone = forms.CharField(
        label="Téléphone",
        max_length=30,
        required=True,
        widget=forms.TextInput(attrs={"placeholder": "Ex: +225 07 00 00 00 00"})
    )

    # KYC (orientation)
    education_level = forms.ChoiceField(
        label="Niveau d’étude",
        required=False,
        choices=[("", "— Sélectionner —")] + list(LearnerKYC.EducationLevel.choices),
    )
    goal = forms.ChoiceField(
        label="Objectif",
        required=False,
        choices=[("", "— Sélectionner —")] + list(LearnerKYC.Goal.choices),
    )
    domain_interest = forms.CharField(
        label="Domaine d’intérêt",
        required=False,
        max_length=120,
        widget=forms.TextInput(attrs={"placeholder": "Ex: Data, Finance, Développement Web..."})
    )
    availability = forms.ChoiceField(
        label="Disponibilité",
        required=False,
        choices=[("", "— Sélectionner —")] + list(LearnerKYC.Availability.choices),
    )
    country = forms.CharField(label="Pays", required=False, initial="Côte d’Ivoire", max_length=80)
    city = forms.CharField(label="Ville", required=False, max_length=80)

    accept_terms = forms.BooleanField(
        label="J’accepte les Conditions d’utilisation",
        required=True,
    )
    accept_marketing = forms.BooleanField(
        label="Je souhaite recevoir des offres et conseils",
        required=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        base = "w-full pl-10 pr-10 py-3 rounded-2xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-400 transition"
        for name, field in self.fields.items():
            css = field.widget.attrs.get("class", "")
            field.widget.attrs["class"] = (css + " " + base).strip()

    def clean_phone(self):
        phone = (self.cleaned_data.get("phone") or "").strip()
        if len(phone) < 8:
            raise ValidationError("Numéro de téléphone invalide.")
        return phone

    def save(self, request):
        user = super().save(request)  # crée user email + password
        user.full_name = self.cleaned_data["full_name"]
        user.phone = self.cleaned_data["phone"]
        # Par défaut : utilisateur plateforme "USER" (pas admin).
        # Le rôle métier "apprenant" est matérialisé par le LearnerProfile
        # créé juste après.
        user.save(update_fields=["full_name", "phone"])

        # Profil apprenant : rend user.is_learner == True
        LearnerProfile.objects.get_or_create(user=user)

        # KYC
        kyc, _ = LearnerKYC.objects.get_or_create(user=user)
        kyc.education_level = self.cleaned_data.get("education_level") or ""
        kyc.goal = self.cleaned_data.get("goal") or ""
        kyc.domain_interest = self.cleaned_data.get("domain_interest") or ""
        kyc.availability = self.cleaned_data.get("availability") or ""
        kyc.country = self.cleaned_data.get("country") or "Côte d’Ivoire"
        kyc.city = self.cleaned_data.get("city") or ""
        kyc.accept_terms = self.cleaned_data.get("accept_terms") or False
        kyc.accept_marketing = self.cleaned_data.get("accept_marketing") or False
        kyc.save()

        return user

class LessonForm(forms.ModelForm):
    class Meta:
        model = Lesson
        fields = ["title", "lesson_type", "content", "video_url", "is_preview", "duration_sec"]
        widgets = {
            "content": TinyMCE(
                attrs={"cols": 80, "rows": 20},
                mce_attrs={
                    "height": 420,
                    "menubar": True,
                    "plugins": "advlist autolink lists link image charmap preview code fullscreen table",
                    "toolbar": "undo redo | blocks | bold italic underline | "
                               "alignleft aligncenter alignright | bullist numlist | "
                               "link image table | code fullscreen preview",
                },
            ),
        }