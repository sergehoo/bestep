from allauth.account.forms import SignupForm
from django import forms


class CustomSignupForm(SignupForm):
    ROLE_CHOICES = (
        ("learner", "Apprenant"),
        ("instructor", "Formateur"),
        ("business", "Entreprise"),
    )

    role = forms.ChoiceField(choices=ROLE_CHOICES, widget=forms.RadioSelect)

    def save(self, request):
        user = super().save(request)
        role = self.cleaned_data["role"]

        # Reset propre (évite états incohérents)
        for f in ("is_learner", "is_instructor", "is_company_admin"):
            if hasattr(user, f):
                setattr(user, f, False)

        if role == "instructor" and hasattr(user, "is_instructor"):
            user.is_instructor = True
        elif role == "business" and hasattr(user, "is_company_admin"):
            user.is_company_admin = True
        elif hasattr(user, "is_learner"):
            user.is_learner = True

        user.save()
        return user
