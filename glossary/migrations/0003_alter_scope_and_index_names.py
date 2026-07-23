"""GLOSS-16 hotfix — Migration idempotente pour les renames d'index + AlterField scope.

Django auto-génère des `RenameIndex` chaque fois que le hash interne des
Meta.indexes change (ex. modification du help_text du champ scope, ordre
des champs). Ces opérations plantent en prod avec :

    ProgrammingError: relation "glossary_gl_course__c8de1a_idx" does not exist

car les noms d'index en base (générés au moment de `0001_initial`) ne
correspondent plus au hash calculé maintenant.

Fix : wrapper les renames dans ``SeparateDatabaseAndState`` avec des
``RunSQL`` conditionnels qui ne renomment que si l'index d'origine
existe. Le state Django est mis à jour proprement dans tous les cas.

Ce fix est calqué sur ``catalog/0013_...`` (HOTFIX #153).
"""
from django.db import migrations, models


def _rename_index_if_exists(old_name: str, new_name: str) -> migrations.RunSQL:
    """Rename PostgreSQL index only if the old name exists."""
    return migrations.RunSQL(
        sql=(
            f"DO $$ BEGIN "
            f"IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{old_name}' AND relkind = 'i') "
            f"THEN ALTER INDEX \"{old_name}\" RENAME TO \"{new_name}\"; "
            f"END IF; END $$;"
        ),
        reverse_sql=(
            f"DO $$ BEGIN "
            f"IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{new_name}' AND relkind = 'i') "
            f"THEN ALTER INDEX \"{new_name}\" RENAME TO \"{old_name}\"; "
            f"END IF; END $$;"
        ),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("glossary", "0002_pg_fts"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                _rename_index_if_exists(
                    "glossary_gl_course__c8de1a_idx",
                    "glossary_gl_course__7249c3_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_term_id_57e0a3_idx",
                    "glossary_gl_term_id_8f5118_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_term_id_a5b1c0_idx",
                    "glossary_gl_term_id_774f0a_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_status_15a3a4_idx",
                    "glossary_gl_status_3d4fb5_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_search__c05a45_idx",
                    "glossary_gl_search__75b0dc_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_status_11e30e_idx",
                    "glossary_gl_status_46893d_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_scope_1b3fd0_idx",
                    "glossary_gl_scope_88e844_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_search__c69e78_idx",
                    "glossary_gl_search__679d43_idx",
                ),
                _rename_index_if_exists(
                    "glossary_gl_user_id_37c0a1_idx",
                    "glossary_gl_user_id_aec812_idx",
                ),
            ],
            state_operations=[
                migrations.RenameIndex(
                    model_name="glossaryassociation",
                    new_name="glossary_gl_course__7249c3_idx",
                    old_name="glossary_gl_course__c8de1a_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryassociation",
                    new_name="glossary_gl_term_id_8f5118_idx",
                    old_name="glossary_gl_term_id_57e0a3_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryrevision",
                    new_name="glossary_gl_term_id_774f0a_idx",
                    old_name="glossary_gl_term_id_a5b1c0_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossarysuggestion",
                    new_name="glossary_gl_status_3d4fb5_idx",
                    old_name="glossary_gl_status_15a3a4_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryterm",
                    new_name="glossary_gl_search__75b0dc_idx",
                    old_name="glossary_gl_search__c05a45_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryterm",
                    new_name="glossary_gl_status_46893d_idx",
                    old_name="glossary_gl_status_11e30e_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryterm",
                    new_name="glossary_gl_scope_88e844_idx",
                    old_name="glossary_gl_scope_1b3fd0_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryvariant",
                    new_name="glossary_gl_search__679d43_idx",
                    old_name="glossary_gl_search__c69e78_idx",
                ),
                migrations.RenameIndex(
                    model_name="glossaryview",
                    new_name="glossary_gl_user_id_aec812_idx",
                    old_name="glossary_gl_user_id_37c0a1_idx",
                ),
            ],
        ),
        migrations.AlterField(
            model_name="glossaryterm",
            name="scope",
            field=models.CharField(
                choices=[
                    ("global", "Global (toute la plateforme)"),
                    ("course", "Cours spécifique"),
                    ("section", "Section spécifique"),
                    ("lesson", "Leçon spécifique"),
                ],
                default="global",
                help_text=(
                    "Portée du terme. Un scope=global est cherché partout ; "
                    "les autres nécessitent une GlossaryAssociation active."
                ),
                max_length=16,
            ),
        ),
    ]
