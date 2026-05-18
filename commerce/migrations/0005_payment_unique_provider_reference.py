"""Migration P1.H — CORRECTIF COM-02.

Ajoute UniqueConstraint(provider, reference) sur PaymentTransaction, conditionné
sur reference non-vide (les transactions INITIATED sans reference restent
autorisées en doublon). Idempotence des webhooks rejoués.

Vérifier au déploiement qu'il n'y a pas déjà de doublons (provider, reference)
dans la table existante. Si c'est le cas, exécuter au préalable :

    SELECT provider, reference, count(*)
    FROM commerce_paymenttransaction
    WHERE reference <> ''
    GROUP BY provider, reference HAVING count(*) > 1;

Et conserver une seule ligne par groupe (la plus récente success de préférence).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("commerce", "0004_alter_companyassignment_company_and_more"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="paymenttransaction",
            constraint=models.UniqueConstraint(
                fields=["provider", "reference"],
                condition=~models.Q(reference=""),
                name="unique_provider_reference",
            ),
        ),
    ]
