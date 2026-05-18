"""Migration P3 — CORRECTIF ENROLL-06.

Indexes manquants sur Enrollment et LessonProgress pour accélérer les
dashboards org (scope par company + status) et les requêtes de progression.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("enrollments", "0005_alter_enrollment_company"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="enrollment",
            index=models.Index(fields=["course", "status"], name="enroll_course_status_idx"),
        ),
        migrations.AddIndex(
            model_name="enrollment",
            index=models.Index(fields=["user", "status"], name="enroll_user_status_idx"),
        ),
        migrations.AddIndex(
            model_name="enrollment",
            index=models.Index(fields=["company", "status"], name="enroll_company_status_idx"),
        ),
        migrations.AddIndex(
            model_name="enrollment",
            index=models.Index(fields=["enrolled_at"], name="enroll_enrolled_at_idx"),
        ),
        migrations.AddIndex(
            model_name="lessonprogress",
            index=models.Index(fields=["enrollment", "completed"], name="lp_enroll_completed_idx"),
        ),
    ]
