"""Migration V_FIN.A — CORRECTIFS ASS-10, ASS-11, ASS-16, CERT-05.

- Ajoute Quiz.is_final + UniqueConstraint partielle (1 final par cours).
- Ajoute CheckConstraint quiz_onboarding_xor_attached.
- AttemptAnswer.selected_text_snapshot (préserve la réponse si Choice supprimé).
- Attempt.started_at passe en auto_now_add.

Compatibilité données : aucune. Les valeurs existantes restent valides.
- is_final=False par défaut → aucun cours n'a de quiz final déclaré.
  L'admin doit aller en marquer un manuellement pour activer l'émission
  automatique de certificats (cf. certifications/services).
- selected_text_snapshot vide pour l'historique — on peut backfiller
  via RunPython si besoin (non bloquant).
"""
from django.db import migrations, models


def backfill_snapshots(apps, schema_editor):
    """Remplit selected_text_snapshot pour les réponses existantes."""
    AttemptAnswer = apps.get_model("assessments", "AttemptAnswer")
    for ans in AttemptAnswer.objects.select_related("selected_choice").filter(
        selected_text_snapshot=""
    ).iterator():
        if ans.selected_choice:
            ans.selected_text_snapshot = (ans.selected_choice.text or "")[:500]
            ans.save(update_fields=["selected_text_snapshot"])


class Migration(migrations.Migration):

    dependencies = [
        ("assessments", "0007_alter_attempt_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="quiz",
            name="is_final",
            field=models.BooleanField(
                default=False,
                help_text="Quiz final du cours. Sa réussite déclenche l'émission du certificat.",
            ),
        ),
        migrations.AddConstraint(
            model_name="quiz",
            constraint=models.CheckConstraint(
                name="quiz_onboarding_xor_attached",
                check=(
                    models.Q(
                        is_onboarding=True,
                        course__isnull=True,
                        section__isnull=True,
                        lesson__isnull=True,
                    )
                    | models.Q(is_onboarding=False)
                ),
            ),
        ),
        migrations.AddConstraint(
            model_name="quiz",
            constraint=models.UniqueConstraint(
                fields=("course",),
                condition=models.Q(is_final=True, course__isnull=False),
                name="quiz_one_final_per_course",
            ),
        ),
        migrations.AddField(
            model_name="attemptanswer",
            name="selected_text_snapshot",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.RunPython(backfill_snapshots, reverse_code=migrations.RunPython.noop),
        migrations.AlterField(
            model_name="attempt",
            name="started_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
    ]
