from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("commerce", "0006_coupon_audit_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Brouillon"),
                    ("PENDING", "En attente"),
                    ("PAID", "Payée"),
                    ("FAILED", "Échouée"),
                    ("CANCELED", "Annulée"),
                    ("REFUND_PENDING", "Remboursement en cours"),
                    ("REFUND_FAILED", "Remboursement échoué"),
                    ("REFUNDED", "Remboursée"),
                ],
                default="DRAFT",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="companylicense",
            name="order",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="company_licenses",
                to="commerce.order",
            ),
        ),
    ]
