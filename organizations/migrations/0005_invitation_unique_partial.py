"""Migration V2.B — CORRECTIF ORG-04.

Remplace la contrainte d'unicité absolue (organization, email, role) par
une contrainte PARTIELLE conditionnée à ``accepted_at IS NULL``. Permet
ainsi de réinviter le même email/role après acceptation ou expiration.

ATTENTION : si des doublons existent déjà côté ``accepted_at IS NULL``,
résoudre manuellement avant migrate :

    SELECT organization_id, email, role, count(*)
    FROM organizations_organizationinvitation
    WHERE accepted_at IS NULL
    GROUP BY organization_id, email, role HAVING count(*) > 1;
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0004_businessinterestrequest"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="organizationinvitation",
            name="unique_pending_invitation_per_role",
        ),
        migrations.AddConstraint(
            model_name="organizationinvitation",
            constraint=models.UniqueConstraint(
                condition=models.Q(("accepted_at__isnull", True)),
                fields=("organization", "email", "role"),
                name="unique_pending_invitation_per_role",
            ),
        ),
    ]
