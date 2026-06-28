"""compte/forms.py — CORRECTIFS P1.I (audit COMPTE-07, COMPTE-08, COMPTE-09, COMPTE-29, COMPTE-30).

- COMPTE-07 : ``save()`` enveloppé dans ``@transaction.atomic``.
- COMPTE-08 : ``clean_email`` normalise case-insensitive.
- COMPTE-09 : ``clean_phone`` valide un format E.164-light.
- COMPTE-29 : ``LessonForm`` déplacé hors de cette app (laissé en place mais
  documenté comme dette ; déplacer dans `catalog/forms.py` au prochain refactor).
- COMPTE-30 : suppression des 27 lignes commentées de l'ancien `CustomSignupForm`.
"""
from __future__ import annotations

import re

from allauth.account.forms import SignupForm
from django import forms
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from tinymce.widgets import TinyMCE

from catalog.models import Lesson
from compte.models import LearnerKYC, LearnerProfile

User = get_user_model()


# Format de téléphone E.164-light : tolère espaces et tirets, mais exige
# longueur raisonnable et au moins un chiffre.
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-()]{6,24}$")

# CORRECTIF COMPTE-10 : constante partagée pour le default country.
DEFAULT_COUNTRY = "Côte d'Ivoire"


class CustomSignupForm(SignupForm):
    full_name = forms.CharField(
        label="Nom complet",
        max_length=160,
        required=True,
        widget=forms.TextInput(attrs={"placeholder": "Ex: Serge Laroche", "autocomplete": "name"}),
    )
    phone = forms.CharField(
        label="Téléphone",
        max_length=30,
        required=True,
        widget=forms.TextInput(attrs={"placeholder": "Ex: +225 07 00 00 00 00", "autocomplete": "tel"}),
    )

    # KYC (orientation)
    education_level = forms.ChoiceField(
        label="Niveau d'étude",
        required=False,
        choices=[("", "— Sélectionner —"), *list(LearnerKYC.EducationLevel.choices)],
    )
    goal = forms.ChoiceField(
        label="Objectif",
        required=False,
        choices=[("", "— Sélectionner —"), *list(LearnerKYC.Goal.choices)],
    )
    domain_interest = forms.CharField(
        label="Domaine d'intérêt",
        required=False,
        max_length=120,
        widget=forms.TextInput(attrs={"placeholder": "Ex: Data, Finance, Développement Web..."}),
    )
    availability = forms.ChoiceField(
        label="Disponibilité",
        required=False,
        choices=[("", "— Sélectionner —"), *list(LearnerKYC.Availability.choices)],
    )
    country = forms.CharField(label="Pays", required=False, initial=DEFAULT_COUNTRY, max_length=80)
    city = forms.CharField(label="Ville", required=False, max_length=80)

    accept_terms = forms.BooleanField(
        label="J'accepte les Conditions d'utilisation",
        required=True,
    )
    accept_marketing = forms.BooleanField(
        label="Je souhaite recevoir des offres et conseils",
        required=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        base = (
            "w-full pl-10 pr-10 py-3 rounded-2xl border border-gray-200 bg-white "
            "text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 "
            "focus:ring-sky-100 focus:border-sky-400 transition"
        )
        for _name, field in self.fields.items():
            css = field.widget.attrs.get("class", "")
            field.widget.attrs["class"] = (css + " " + base).strip()
        # CORRECTIF A11Y-09 : autocomplete pour les gestionnaires de mots de passe.
        if "email" in self.fields:
            self.fields["email"].widget.attrs.setdefault("autocomplete", "email")
        if "password1" in self.fields:
            self.fields["password1"].widget.attrs.setdefault("autocomplete", "new-password")
        if "password2" in self.fields:
            self.fields["password2"].widget.attrs.setdefault("autocomplete", "new-password")

    def clean_email(self):
        """CORRECTIF COMPTE-08 : normalisation case-insensitive."""
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise ValidationError("Adresse email requise.")
        return email

    def clean_phone(self):
        """CORRECTIF COMPTE-09 : validation format E.164-light."""
        phone = (self.cleaned_data.get("phone") or "").strip()
        if not _PHONE_RE.match(phone):
            raise ValidationError(
                "Numéro de téléphone invalide. Format attendu : +XXX XX XX XX XX."
            )
        return phone

    @transaction.atomic
    def save(self, request):
        """CORRECTIF COMPTE-07 : tout dans une seule transaction.

        Si la création du KYC échoue, le User et le LearnerProfile sont
        rollbackés — pas de compte partiel coincé avec un email déjà pris.
        """
        user = super().save(request)
        user.full_name = self.cleaned_data["full_name"]
        user.phone = self.cleaned_data["phone"]
        user.save(update_fields=["full_name", "phone"])

        LearnerProfile.objects.get_or_create(user=user)

        kyc, _ = LearnerKYC.objects.get_or_create(user=user)
        kyc.education_level = self.cleaned_data.get("education_level") or ""
        kyc.goal = self.cleaned_data.get("goal") or ""
        kyc.domain_interest = self.cleaned_data.get("domain_interest") or ""
        kyc.availability = self.cleaned_data.get("availability") or ""
        kyc.country = self.cleaned_data.get("country") or DEFAULT_COUNTRY
        kyc.city = self.cleaned_data.get("city") or ""
        kyc.accept_terms = self.cleaned_data.get("accept_terms") or False
        kyc.accept_marketing = self.cleaned_data.get("accept_marketing") or False
        kyc.save()

        return user


class UserProfileForm(forms.ModelForm):
    """Formulaire d'édition du profil utilisateur (full_name, phone, email)."""

    class Meta:
        model = User
        fields = ["full_name", "phone", "email"]
        widgets = {
            "full_name": forms.TextInput(attrs={"autocomplete": "name"}),
            "phone":     forms.TextInput(attrs={"autocomplete": "tel"}),
            "email":     forms.EmailInput(attrs={"autocomplete": "email"}),
        }
        labels = {
            "full_name": "Nom complet",
            "phone":     "Téléphone",
            "email":     "Adresse e-mail",
        }

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if not email:
            raise ValidationError("L'adresse e-mail est obligatoire.")
        qs = User.objects.filter(email=email).exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError("Cette adresse e-mail est déjà utilisée.")
        return email

    def clean_phone(self):
        phone = (self.cleaned_data.get("phone") or "").strip()
        if phone and not _PHONE_RE.match(phone):
            raise ValidationError("Format de téléphone invalide (ex. : +225 07 00 00 00 00).")
        return phone

    def _apply_styles(self):
        base = (
            "w-full px-4 py-2.5 rounded-xl border border-be-ink-100 dark:border-white/10 "
            "bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-4 "
            "focus:ring-be-sky-200/60 dark:focus:ring-white/10 transition"
        )
        for field in self.fields.values():
            css = field.widget.attrs.get("class", "")
            field.widget.attrs["class"] = (css + " " + base).strip()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._apply_styles()

    @transaction.atomic
    def save(self, commit=True):
        user = super().save(commit=False)
        if commit:
            user.save(update_fields=["full_name", "phone", "email"])
        return user


# CORRECTIF COMPTE-29 (dette) : LessonForm n'a rien à faire dans `compte`.
# À déplacer dans `catalog/forms.py` au prochain refactor. Laissé ici en
# attendant pour ne pas casser les imports existants.
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
                    "toolbar": (
                        "undo redo | blocks | bold italic underline | "
                        "alignleft aligncenter alignright | bullist numlist | "
                        "link image table | code fullscreen preview"
                    ),
                },
            ),
        }


# ═════════════════════════════════════════════════════════════════════
# P3 — Forms profil unifié (avatar + préférences)
# ═════════════════════════════════════════════════════════════════════

class AvatarUploadForm(forms.ModelForm):
    """
    Formulaire d'upload de la photo de profil (P3.4).

    Validations métier :
      - Taille max 5 Mo (bloquée côté serveur, pas seulement côté <input>).
      - Format JPEG / PNG / WebP uniquement (refuse les SVG = XSS vector).
      - Dimensions max raisonnables (4000×4000) pour éviter les bombes
        de pixels.
    """

    _MAX_BYTES = 5 * 1024 * 1024  # 5 Mo
    _ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    _MAX_DIMENSION = 4000  # pixels

    class Meta:
        model = get_user_model()
        fields = ["avatar"]

    def clean_avatar(self):
        avatar = self.cleaned_data.get("avatar")
        if not avatar:
            return avatar  # delete via clear=True OK

        # 1. Taille
        size = getattr(avatar, "size", 0)
        if size and size > self._MAX_BYTES:
            raise ValidationError(
                "L'image dépasse 5 Mo. Compressez-la avant de l'uploader."
            )

        # 2. Content-type (anti-SVG / EXE renommé)
        content_type = getattr(avatar, "content_type", "") or ""
        if content_type and content_type.lower() not in self._ALLOWED_CONTENT_TYPES:
            raise ValidationError(
                "Format non supporté. Utilisez JPEG, PNG ou WebP."
            )

        # 3. Dimensions (anti-pixel bomb) via Pillow.
        try:
            from PIL import Image
            avatar.seek(0)
            with Image.open(avatar) as img:
                if img.width > self._MAX_DIMENSION or img.height > self._MAX_DIMENSION:
                    raise ValidationError(
                        f"L'image dépasse {self._MAX_DIMENSION}×{self._MAX_DIMENSION} px. "
                        "Redimensionnez-la avant l'upload."
                    )
            avatar.seek(0)
        except ValidationError:
            raise
        except Exception as exc:
            # Pillow ne peut pas ouvrir l'image → corruption ou format inattendu.
            raise ValidationError(
                "Le fichier n'est pas une image valide."
            ) from exc

        return avatar


class UserPreferencesForm(forms.ModelForm):
    """Formulaire d'édition des préférences utilisateur (P3.4)."""

    class Meta:
        # Import local pour éviter une dépendance circulaire au chargement
        # du module (UserPreferences hérite de compte.models qui importe forms).
        from compte.models import UserPreferences as _UP  # noqa: PLC0415
        model = _UP
        fields = [
            "theme",
            "language",
            "notifications_email",
            "notifications_marketing",
            "notifications_course_reminders",
            "public_profile",
        ]
        labels = {
            "theme": "Thème d'affichage",
            "language": "Langue",
            "notifications_email": "Notifications par e-mail",
            "notifications_marketing": "E-mails marketing",
            "notifications_course_reminders": "Rappels de cours non terminés",
            "public_profile": "Profil public",
        }
        help_texts = {
            "notifications_email": "Publications, inscriptions, paiements importants.",
            "notifications_marketing": "Nouveaux cours, offres promotionnelles.",
            "notifications_course_reminders": "Rappels hebdomadaires des leçons non terminées.",
            "public_profile": "Rendre votre profil visible aux autres utilisateurs (formateurs uniquement).",
        }
        widgets = {
            "theme": forms.Select(attrs={"class": "be-select"}),
            "language": forms.Select(attrs={"class": "be-select"}),
        }
