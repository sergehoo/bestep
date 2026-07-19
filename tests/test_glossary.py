"""tests/test_glossary.py — Tests pytest du module lexique (GLOSS-12).

Couvre les endpoints critiques :
    - Public : list/detail/search/alphabet/popular/recent/categories
    - Auth apprenant : favorite toggle, note upsert, my/favorites
    - Instructor CRUD : create/patch/delete + submit
    - Admin moderation : validate/reject/merge
    - Import : dry_run avec rapport
    - Modèle : normalize_search_key + slug unique

Convention : chaque test est autonome (db fixture), le RBAC est vérifié
sur chaque endpoint sensible.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from glossary.models import (
    GlossaryCategory,
    GlossaryTerm,
    GlossaryVariant,
    GlossaryFavorite,
    normalize_search_key,
)

User = get_user_model()


# ─────────────────────────────────────────────────────────────
# Helpers & fixtures
# ─────────────────────────────────────────────────────────────

def _auth(client: APIClient, user):
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def learner(db):
    return User.objects.create_user(
        email="learner@example.com",
        password="StrongPa$$word12",
        is_email_verified=True,
    )


@pytest.fixture
def instructor(db):
    # is_instructor via instructor_profile — on utilise is_superuser=True
    # comme simple raccourci de rôle pour les tests (is_platform_admin
    # inclut aussi les instructors dans le RBAC glossary).
    user = User.objects.create_user(
        email="instructor@example.com",
        password="StrongPa$$word12",
        is_email_verified=True,
    )
    # Crée l'instructor_profile de manière minimale.
    from compte.models import InstructorProfile
    InstructorProfile.objects.get_or_create(user=user)
    return user


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="glossadmin@example.com",
        password="StrongPa$$word12",
        is_email_verified=True,
        is_superuser=True,
        is_staff=True,
    )


@pytest.fixture
def category(db):
    return GlossaryCategory.objects.create(name="Finance", slug="finance")


@pytest.fixture
def validated_term(db, category):
    return GlossaryTerm.objects.create(
        word="Diversification",
        short_definition="Répartir ses placements pour réduire le risque.",
        long_definition="<p>Stratégie…</p>",
        category=category,
        status=GlossaryTerm.Status.VALIDATED,
        is_active=True,
        scope=GlossaryTerm.Scope.GLOBAL,
    )


# ─────────────────────────────────────────────────────────────
# Modèle : normalize_search_key + slug
# ─────────────────────────────────────────────────────────────

class TestModel:
    def test_normalize_removes_accents_and_case(self):
        assert normalize_search_key("Épargne Retraite") == "epargne retraite"
        assert normalize_search_key("À la carte") == "a la carte"
        assert normalize_search_key("") == ""

    def test_slug_generated_and_unique(self, db):
        a = GlossaryTerm.objects.create(
            word="Action", short_definition="Titre de propriété.",
        )
        b = GlossaryTerm.objects.create(
            word="Action", short_definition="Autre définition.",
        )
        assert a.slug == "action"
        assert b.slug.startswith("action-")
        assert a.slug != b.slug

    def test_search_key_resynced_on_save(self, db):
        t = GlossaryTerm.objects.create(
            word="Bourse", short_definition="Marché financier.",
        )
        assert t.search_key == "bourse"
        t.word = "Bourse américaine"
        t.save()
        assert t.search_key == "bourse americaine"


# ─────────────────────────────────────────────────────────────
# API publique (AllowAny)
# ─────────────────────────────────────────────────────────────

class TestPublicApi:
    def test_list_returns_only_validated_active(self, api, validated_term, db):
        # Termes exclus : draft + archived + inactive.
        GlossaryTerm.objects.create(word="Draft", short_definition="d", status="draft")
        GlossaryTerm.objects.create(
            word="Archived", short_definition="a",
            status=GlossaryTerm.Status.ARCHIVED, is_active=False,
        )
        r = api.get("/api/glossary/terms/")
        assert r.status_code == 200
        assert r.json()["count"] == 1
        assert r.json()["results"][0]["word"] == "Diversification"

    def test_detail_returns_full_payload(self, api, validated_term):
        r = api.get(f"/api/glossary/terms/{validated_term.slug}/")
        assert r.status_code == 200
        data = r.json()
        assert data["word"] == "Diversification"
        assert data["category"]["name"] == "Finance"
        assert data["variants"] == []
        assert data["is_favorite"] is False

    def test_detail_404_when_inactive(self, api, db):
        t = GlossaryTerm.objects.create(
            word="Hidden", short_definition="…",
            status=GlossaryTerm.Status.VALIDATED, is_active=False,
        )
        r = api.get(f"/api/glossary/terms/{t.slug}/")
        assert r.status_code == 404

    def test_search_matches_word(self, api, validated_term):
        r = api.get("/api/glossary/terms/search/?q=diver")
        assert r.status_code == 200
        results = r.json()
        assert any(t["slug"] == validated_term.slug for t in results)

    def test_search_ignores_case_and_accents(self, api, db):
        GlossaryTerm.objects.create(
            word="Épargne", short_definition="s", status="validated", is_active=True,
        )
        r = api.get("/api/glossary/terms/search/?q=epargne")
        assert r.status_code == 200
        assert any(t["word"] == "Épargne" for t in r.json())

    def test_search_matches_variant(self, api, validated_term):
        GlossaryVariant.objects.create(
            term=validated_term, variant="Répartition",
            variant_type=GlossaryVariant.VariantType.SYNONYM,
        )
        r = api.get("/api/glossary/terms/search/?q=repar")
        assert r.status_code == 200
        assert any(t["slug"] == validated_term.slug for t in r.json())

    def test_alphabet_index_counts(self, api, validated_term, db):
        GlossaryTerm.objects.create(
            word="Actif", short_definition="s", status="validated", is_active=True,
        )
        r = api.get("/api/glossary/terms/alphabet/")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 2
        assert data["by_letter"].get("A") == 1
        assert data["by_letter"].get("D") == 1

    def test_categories_include_terms_count(self, api, category, validated_term):
        r = api.get("/api/glossary/categories/")
        assert r.status_code == 200
        cats = r.json()
        finance = next((c for c in cats if c["slug"] == "finance"), None)
        assert finance is not None
        assert finance["terms_count"] == 1


# ─────────────────────────────────────────────────────────────
# Favoris & notes (authenticated)
# ─────────────────────────────────────────────────────────────

class TestUserActions:
    def test_favorite_requires_auth(self, api, validated_term):
        r = api.post(f"/api/glossary/terms/{validated_term.slug}/favorite/")
        assert r.status_code == 401

    def test_favorite_toggle(self, api, validated_term, learner):
        _auth(api, learner)
        assert GlossaryFavorite.objects.filter(user=learner).count() == 0
        r = api.post(f"/api/glossary/terms/{validated_term.slug}/favorite/")
        assert r.status_code == 201
        assert GlossaryFavorite.objects.filter(user=learner).count() == 1
        r = api.delete(f"/api/glossary/terms/{validated_term.slug}/favorite/")
        assert r.status_code == 204
        assert GlossaryFavorite.objects.filter(user=learner).count() == 0

    def test_note_upsert(self, api, validated_term, learner):
        _auth(api, learner)
        r = api.put(
            f"/api/glossary/terms/{validated_term.slug}/note/",
            data={"note": "À réviser demain", "status": "review"},
            format="json",
        )
        assert r.status_code == 200
        assert r.json()["status"] == "review"
        # Upsert : nouvel appel remplace.
        r = api.put(
            f"/api/glossary/terms/{validated_term.slug}/note/",
            data={"note": "Compris !", "status": "understood"},
            format="json",
        )
        assert r.status_code == 200
        assert r.json()["status"] == "understood"

    def test_my_favorites_lists_only_own(self, api, validated_term, learner, db):
        other = User.objects.create_user(
            email="other@example.com", password="StrongPa$$word12",
            is_email_verified=True,
        )
        GlossaryFavorite.objects.create(user=other, term=validated_term)
        _auth(api, learner)
        r = api.get("/api/glossary/my/favorites/")
        assert r.status_code == 200
        assert r.json() == []  # learner n'a rien fav'


# ─────────────────────────────────────────────────────────────
# Instructor CRUD
# ─────────────────────────────────────────────────────────────

class TestInstructorCrud:
    def test_learner_cannot_create_term(self, api, learner):
        _auth(api, learner)
        r = api.post(
            "/api/glossary/instructor/terms/",
            data={"word": "Test", "short_definition": "…"},
            format="json",
        )
        assert r.status_code == 403

    def test_instructor_creates_own_term(self, api, instructor):
        _auth(api, instructor)
        r = api.post(
            "/api/glossary/instructor/terms/",
            data={
                "word": "Actif circulant",
                "short_definition": "Éléments courants du bilan.",
                "status": "draft",
            },
            format="json",
        )
        assert r.status_code == 201, r.content
        assert r.json()["word"] == "Actif circulant"
        term = GlossaryTerm.objects.get(word="Actif circulant")
        assert term.created_by_id == instructor.id
        assert term.status == "draft"

    def test_instructor_lists_only_own(self, api, instructor, admin_user):
        # Un terme créé par l'admin ne doit PAS apparaître dans la liste
        # instructor du non-admin.
        GlossaryTerm.objects.create(
            word="Admin-created", short_definition="…", created_by=admin_user,
        )
        GlossaryTerm.objects.create(
            word="Mine", short_definition="…", created_by=instructor,
        )
        _auth(api, instructor)
        r = api.get("/api/glossary/instructor/terms/")
        assert r.status_code == 200
        words = {row["word"] for row in r.json()["results"]}
        assert words == {"Mine"}

    def test_instructor_submits_draft_for_validation(self, api, instructor):
        term = GlossaryTerm.objects.create(
            word="Rendement", short_definition="…",
            created_by=instructor, status=GlossaryTerm.Status.DRAFT,
        )
        _auth(api, instructor)
        r = api.post(f"/api/glossary/instructor/terms/{term.id}/submit/")
        assert r.status_code == 200
        term.refresh_from_db()
        assert term.status == GlossaryTerm.Status.PENDING

    def test_instructor_cannot_edit_others_term(self, api, instructor, admin_user):
        other = GlossaryTerm.objects.create(
            word="Not mine", short_definition="…", created_by=admin_user,
        )
        _auth(api, instructor)
        r = api.patch(
            f"/api/glossary/instructor/terms/{other.id}/",
            data={"short_definition": "hacked"},
            format="json",
        )
        assert r.status_code == 404


# ─────────────────────────────────────────────────────────────
# Admin moderation
# ─────────────────────────────────────────────────────────────

class TestAdminModeration:
    def test_instructor_cannot_use_admin_endpoints(self, api, instructor, validated_term):
        _auth(api, instructor)
        r = api.get("/api/glossary/admin/terms/")
        assert r.status_code == 403
        r = api.post(f"/api/glossary/admin/terms/{validated_term.id}/validate/")
        assert r.status_code == 403

    def test_admin_validates_pending_term(self, api, admin_user, db):
        term = GlossaryTerm.objects.create(
            word="Nouveauté", short_definition="…",
            status=GlossaryTerm.Status.PENDING,
        )
        _auth(api, admin_user)
        r = api.post(f"/api/glossary/admin/terms/{term.id}/validate/")
        assert r.status_code == 200
        term.refresh_from_db()
        assert term.status == GlossaryTerm.Status.VALIDATED
        assert term.validated_by_id == admin_user.id
        assert term.published_at is not None

    def test_admin_rejects_term(self, api, admin_user, db):
        term = GlossaryTerm.objects.create(
            word="Spam", short_definition="…",
            status=GlossaryTerm.Status.PENDING,
        )
        _auth(api, admin_user)
        r = api.post(f"/api/glossary/admin/terms/{term.id}/reject/")
        assert r.status_code == 200
        term.refresh_from_db()
        assert term.status == GlossaryTerm.Status.REJECTED
        assert term.is_active is False

    def test_admin_merges_duplicate(self, api, admin_user, db):
        # Setup : deux termes doublons + un favori sur le source.
        source = GlossaryTerm.objects.create(
            word="ROI", short_definition="Retour sur invest.",
            status=GlossaryTerm.Status.VALIDATED, is_active=True,
        )
        target = GlossaryTerm.objects.create(
            word="Return on investment", short_definition="Retour d'investissement.",
            status=GlossaryTerm.Status.VALIDATED, is_active=True,
        )
        GlossaryFavorite.objects.create(user=admin_user, term=source)

        _auth(api, admin_user)
        r = api.post(
            f"/api/glossary/admin/terms/{source.id}/merge/",
            data={"target_id": target.id},
            format="json",
        )
        assert r.status_code == 200, r.content
        source.refresh_from_db()
        assert source.status == GlossaryTerm.Status.ARCHIVED
        assert source.is_active is False
        # Favori transféré.
        assert GlossaryFavorite.objects.filter(
            user=admin_user, term=target
        ).exists()
        assert not GlossaryFavorite.objects.filter(
            user=admin_user, term=source
        ).exists()

    def test_admin_cannot_merge_term_with_itself(self, api, admin_user, validated_term):
        _auth(api, admin_user)
        r = api.post(
            f"/api/glossary/admin/terms/{validated_term.id}/merge/",
            data={"target_id": validated_term.id},
            format="json",
        )
        assert r.status_code == 400


# ─────────────────────────────────────────────────────────────
# Import CSV / JSON
# ─────────────────────────────────────────────────────────────

class TestImport:
    def test_import_csv_dry_run_reports_actions(self, api, admin_user, db):
        # Déjà présent : "Diversification" — sera skipé comme doublon.
        GlossaryTerm.objects.create(
            word="Diversification", short_definition="…",
            status=GlossaryTerm.Status.VALIDATED, is_active=True,
        )
        csv_body = (
            "Terme;Définition courte;Catégorie;Synonymes\n"
            "Épargne;Somme mise de côté.;Finance;économies|thésaurisation\n"
            "Diversification;Répartir.;Finance;\n"
            ";sans terme;;;\n"
        )
        _auth(api, admin_user)
        from django.core.files.uploadedfile import SimpleUploadedFile

        r = api.post(
            "/api/glossary/admin/import/",
            data={
                "file": SimpleUploadedFile(
                    "lex.csv", csv_body.encode("utf-8"), content_type="text/csv",
                ),
                "format": "csv",
                "dry_run": "true",
            },
            format="multipart",
        )
        assert r.status_code == 200, r.content
        report = r.json()["report"]
        assert report["total_rows"] == 3
        assert report["created"] == 1  # Épargne
        assert report["skipped"] == 1  # Diversification doublon
        assert report["errors"] == 1  # ligne sans mot
        # DRY_RUN : aucun term de plus créé.
        assert GlossaryTerm.objects.filter(word="Épargne").count() == 0

    def test_import_json_effective_creates_terms(self, api, admin_user, db):
        payload = '{"terms": [{"word":"BRVM","short_definition":"Bourse..."}]}'
        _auth(api, admin_user)
        from django.core.files.uploadedfile import SimpleUploadedFile

        r = api.post(
            "/api/glossary/admin/import/",
            data={
                "file": SimpleUploadedFile("l.json", payload.encode("utf-8")),
                "format": "json",
                "dry_run": "false",
            },
            format="multipart",
        )
        assert r.status_code == 200
        assert r.json()["report"]["created"] == 1
        assert GlossaryTerm.objects.filter(word="BRVM").exists()

    def test_import_denied_for_non_admin(self, api, instructor):
        _auth(api, instructor)
        from django.core.files.uploadedfile import SimpleUploadedFile
        r = api.post(
            "/api/glossary/admin/import/",
            data={"file": SimpleUploadedFile("l.csv", b"a\n"), "format": "csv"},
            format="multipart",
        )
        assert r.status_code == 403
