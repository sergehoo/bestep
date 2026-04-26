"""Ajout du champ ``MediaAsset.organization`` + backfill.

Contexte
--------
Avant cette migration, ``MediaAsset`` ne possédait que ``owner``. Le partage
des médias entre membres d'une même organisation n'était donc pas possible
(``InstructorMediaListView`` testait ``hasattr(MediaAsset, "organization")``,
qui retournait toujours ``False`` silencieusement).

Cette migration :

1. Ajoute la FK ``organization`` (nullable, ``ON DELETE SET NULL``) ;
2. Ajoute deux index ``(organization, kind)`` et ``(organization, created_at)``
   pour les requêtes de la bibliothèque média ;
3. **Rétro-rattache** chaque média existant à l'organisation de son
   propriétaire — uniquement si l'utilisateur n'appartient qu'à **une seule**
   organisation active. Sinon on laisse ``NULL`` : le rattachement
   demanderait un choix métier qu'on ne peut pas faire automatiquement.

Sécurité du backfill : ``schema_editor.connection.alias`` permet de cibler
correctement la base, et on évite tout import direct de modèles applicatifs
(via ``apps.get_model``) pour rester historique-safe.
"""

from django.db import migrations, models
import django.db.models.deletion


def backfill_organization(apps, schema_editor):
    MediaAsset = apps.get_model("catalog", "MediaAsset")
    OrganizationMembership = apps.get_model("organizations", "OrganizationMembership")
    db = schema_editor.connection.alias

    # 1. Pour chaque user qui a UN SEUL membership actif → on retient l'org.
    # On évite N+1 en passant par values_list et un dict en mémoire.
    memberships = (
        OrganizationMembership.objects
        .using(db)
        .filter(is_active=True, organization__is_active=True)
        .values_list("user_id", "organization_id")
    )

    user_to_orgs: dict = {}
    for user_id, org_id in memberships:
        user_to_orgs.setdefault(user_id, set()).add(org_id)

    single_org_users = {
        user_id: next(iter(orgs))
        for user_id, orgs in user_to_orgs.items()
        if len(orgs) == 1
    }

    if not single_org_users:
        return

    # 2. Pour chaque media sans organisation, si l'owner est dans
    # ``single_org_users`` → on rattache.
    qs = MediaAsset.objects.using(db).filter(organization__isnull=True)
    for media in qs.iterator(chunk_size=500):
        org_id = single_org_users.get(media.owner_id)
        if org_id is not None:
            media.organization_id = org_id
            media.save(update_fields=["organization"])


def noop_reverse(apps, schema_editor):
    """Reverse : on n'efface pas les organization_id (idempotence)."""
    return


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0007_alter_course_company"),
        # 0003 introduit OrganizationMembership.organization (FK) — requis
        # par le backfill ci-dessus.
        ("organizations", "0003_delete_company_delete_companyinvitation_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="mediaasset",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "Organisation propriétaire du média (partagé en lecture "
                    "entre ses membres). NULL = média personnel."
                ),
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="media_assets",
                to="organizations.organization",
            ),
        ),
        migrations.AddIndex(
            model_name="mediaasset",
            index=models.Index(
                fields=["organization", "kind"],
                name="catalog_med_org_kind_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="mediaasset",
            index=models.Index(
                fields=["organization", "created_at"],
                name="catalog_med_org_created_idx",
            ),
        ),
        migrations.RunPython(backfill_organization, noop_reverse),
    ]
