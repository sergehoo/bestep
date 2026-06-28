from django.urls import path

from assessments.views import onboarding_quiz, onboarding_result

app_name = "assessments"
urlpatterns = [
    path("onboarding/quiz/", onboarding_quiz, name="onboarding_quiz"),
    path("onboarding/result/<int:attempt_id>/", onboarding_result, name="onboarding_result"),

]
