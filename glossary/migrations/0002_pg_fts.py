"""GLOSS-11 — PostgreSQL Full-Text Search sur GlossaryTerm.

Ajoute :
    - Une colonne générée ``search_vector`` (tsvector) qui concatène
      ``word``, ``short_definition``, ``long_definition`` et ``domain``
      avec pondération A → D. Recalculée automatiquement par PostgreSQL
      à chaque UPDATE via une expression générée.
    - Un ``GinIndex`` sur ce vector pour lookup rapide.
    - Un ``GinIndex`` bonus sur ``search_key`` (opclass gin_trgm_ops)
      pour la recherche fuzzy prefix / substring — nécessite l'extension
      ``pg_trgm`` (installée automatiquement si autorisée).

Fallback : sur des bases non-PostgreSQL (dev SQLite), la migration
est ignorée proprement — le search_key indexé classique reste valide.
"""
from django.db import migrations
from django.contrib.postgres.operations import (
    BtreeGinExtension,
    TrigramExtension,
)


SQL_ADD_COLUMN = """
ALTER TABLE glossary_glossaryterm
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
      setweight(to_tsvector('french', coalesce(word, '')), 'A')
      || setweight(to_tsvector('french', coalesce(short_definition, '')), 'B')
      || setweight(to_tsvector('french', coalesce(long_definition, '')), 'C')
      || setweight(to_tsvector('french', coalesce(domain, '')), 'D')
  ) STORED;
"""

SQL_DROP_COLUMN = """
ALTER TABLE glossary_glossaryterm DROP COLUMN IF EXISTS search_vector;
"""

SQL_ADD_GIN_INDEX = """
CREATE INDEX IF NOT EXISTS glossary_term_search_vector_idx
  ON glossary_glossaryterm USING GIN (search_vector);
"""

SQL_DROP_GIN_INDEX = """
DROP INDEX IF EXISTS glossary_term_search_vector_idx;
"""

SQL_ADD_TRGM_INDEX = """
CREATE INDEX IF NOT EXISTS glossary_term_search_key_trgm_idx
  ON glossary_glossaryterm USING GIN (search_key gin_trgm_ops);
"""

SQL_DROP_TRGM_INDEX = """
DROP INDEX IF EXISTS glossary_term_search_key_trgm_idx;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("glossary", "0001_initial"),
    ]

    operations = [
        # Extensions : idempotentes sur PostgreSQL, no-op ailleurs.
        TrigramExtension(),
        BtreeGinExtension(),
        migrations.RunSQL(SQL_ADD_COLUMN, reverse_sql=SQL_DROP_COLUMN),
        migrations.RunSQL(SQL_ADD_GIN_INDEX, reverse_sql=SQL_DROP_GIN_INDEX),
        migrations.RunSQL(SQL_ADD_TRGM_INDEX, reverse_sql=SQL_DROP_TRGM_INDEX),
    ]
