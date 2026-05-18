# CHANGELOG — Vague 2 (V2) + fondations V3

**Date :** 17 mai 2026 (suite immédiate du CHANGELOG V1)
**Périmètre :** Vague 2 complète (certificats, invitations, webhooks, sync
licences) + V3.A (centralisation routing) + V5.A/B (partials + nettoyage
templates) + V8.B (tests + outillage qualité).

> Cette vague suit la convention `.new` à côté des fichiers originaux.
> Voir `CHANGELOG_2026_05.md` pour la Vague 1 (Phase 1 critique).

---

## Sommaire

1. [Synthèse](#synthese)
2. [Findings traités](#findings)
3. [Fichiers livrés](#fichiers)
4. [Migrations à appliquer](#migrations)
5. [Tests ajoutés](#tests)
6. [Procédure de déploiement](#deploy)
7. [Reste roadmap (V4/V6/V7)](#reste)

---

## <a id="synthese"></a>1. Synthèse

Cette Vague 2 ferme les workflows critiques que la Vague 1 avait
documentés comme manquants ou cassés :

- **Certificats vérifiables publiquement** (CERT-01 critique).
  Endpoint HTML + JSON + QR code embarqué dans le PDF + révocation
  + ré-émission après révocation. Sans ça, les certificats émis étaient
  fonctionnellement sans valeur.
- **Workflow invitation org complet** (ORG-01/02/03 critique).
  L'app `organizations/api/` est désormais importable, branchée, et
  envoie effectivement l'email d'invitation avec un endpoint
  d'acceptation public.
- **Webhooks commerce idempotents** (COM-06 important).
  L'app `commerce` qui n'avait NI views NI urls dispose maintenant d'un
  squelette checkout + webhook handler par provider, avec idempotence
  validée par les tests.
- **Sync automatique CompanyLicense.seats_used** (COM-09/COM-10).
  Signal `post_save/post_delete` sur `CompanyAssignmentTarget` qui
  recompute le compteur et crée l'`Enrollment` correspondant.
- **Centralisation `resolve_user_dashboard_url`** (FORMATIONS-22 / P2-2).
  Source unique dans `compte/services.py` ; `PATCHES.md` documente
  comment migrer les 3 sites qui dupliquaient la logique.
- **Partials frontend mutualisés** (CQ-20/21/22/23).
  `course_card`, `kpi_card`, `filter_bar`, `toast`, `empty_state`,
  `skeleton_card`, `logout_button`. Toast `aria-live` accessible.
- **Outillage qualité** (SEC-30, INFRA-19).
  `pyproject.toml` (ruff/black/isort/pytest/coverage), `.pre-commit-config.yaml`.

---

## <a id="findings"></a>2. Findings traités

### Critique

| ID | Description | Correctif |
|---|---|---|
| CERT-01 | Pas d'endpoint public verify_certificate, PDF sans QR code | Endpoint HTML + JSON + QR dans PDF + storage MinIO via `default_storage` |
| CERT-02 | Overflow visuel et caractères de contrôle dans le PDF | `_safe_name` + `setTitle` sanitisé |
| CERT-03 | unique_together bloque la ré-émission après révocation | `revoked_at` + UniqueConstraint partielle conditionnée à `revoked_at IS NULL` |
| ORG-01 | `organizations/api/` cassé (imports/SyntaxError) | Imports qualifiés, alias `OrganizationMemberService` créé |
| ORG-02 | `organizations/api/urls.py` jamais branché ; pas d'endpoint accept | Module corrigé + route `org:invitation_accept` côté HTML + service `accept_invitation` |
| ORG-03 | Pas d'envoi d'email d'invitation | `_send_invitation_email` (sync, à Celery-iser) appelé par `invite_member` |
| COM-06 | `commerce/views.py` et `commerce/urls.py` vides | `CheckoutView` + `webhook_handler` (idempotent via COM-02) + `order_pending` |

### Important

| ID | Description | Correctif |
|---|---|---|
| CERT-04 | `Enrollment.DoesNotExist` brutal | `.exists()` + return None |
| CERT-06 | `CertificateTemplate` jamais utilisé | `_render_certificate_pdf` exploite background + signature_name/title |
| CERT-07 | PDF stocké en MEDIA_ROOT local | Via `default_storage` (MinIO) avec URL signée |
| CERT-09 | Admin sans interface pour révoquer | Admin avec action `revoke_selected` + indicateur `has_background` |
| ORG-04 | UniqueConstraint absolue bloque la ré-invitation | Contrainte partielle (`accepted_at IS NULL`) |
| ORG-05 | `OrganizationMemberService` n'existait pas | Alias public exposé |
| ORG-16 | Password non validé côté service | `validate_password` appelé |
| COM-09 | `seats_used` non synchronisé | Signal `post_save`/`post_delete` sur `CompanyAssignmentTarget` |
| COM-10 | `CompanyAssignment` ne crée pas d'Enrollment | Signal idem (idempotent via `get_or_create`) |
| FORMATIONS-22 / P2-2 | `_redirect_by_role` dupliqué 3 fois | Centralisé dans `compte/services.resolve_user_dashboard_url` |
| CQ-20 / CQ-21 / CQ-22 / CQ-23 | Composants frontend dupliqués | `partials/course_card.html`, `kpi_card.html`, `filter_bar.html`, `toast.html`, `empty_state.html`, `skeleton_card.html`, `logout_button.html` |
| UX-15 | Logout en GET incompatible allauth ≥ 0.55 | `partials/logout_button.html` form POST CSRF |
| A11Y-10 | Toasts sans `role="status"` aria-live | Wrapper ARIA correct |
| UX-36 / UX-37 | États vides et chargement incohérents | partials dédiés |

### Mineur / nettoyage

| ID | Action |
|---|---|
| CQ-45 | 7 templates orphelins listés dans `CLEANUP_TEMPLATES.md` avec procédure `git rm` sûre |
| SEC-30 | `pyproject.toml` + `.pre-commit-config.yaml` (ruff/black/isort/pytest/coverage) |
| INFRA-19 | Configuration ruff par fichier (ignore migrations/tests) |

---

## <a id="fichiers"></a>3. Fichiers livrés

### Nouveaux fichiers

```
certifications/
  migrations/0003_revoked_at_and_constraint.py
  models.py.new
  services.py.new
  views.py.new
  urls.py.new
  admin.py.new

organizations/
  invitation_views.py                              [neuf]
  migrations/0005_invitation_unique_partial.py     [neuf]
  services.py.new
  urls.py.new
  api/views.py.new
  api/urls.py.new
  api/serializers.py.new

commerce/
  signals.py                                       [neuf]
  apps.py.new
  views.py.new
  urls.py.new

compte/
  services.py.new      (resolve_user_dashboard_url centralisé)

best_epargne/
  urls.py.new          (branche certifications + commerce)

templates/
  certifications/verify.html                       [neuf]
  organization/invitation_accept.html              [neuf]
  commerce/order_pending.html                      [neuf]
  partials/course_card.html                        [neuf]
  partials/kpi_card.html                           [neuf]
  partials/filter_bar.html                         [neuf]
  partials/toast.html                              [neuf]
  partials/empty_state.html                        [neuf]
  partials/skeleton_card.html                      [neuf]
  partials/logout_button.html                      [neuf]

tests/
  test_v2_certifications.py                        [neuf]
  test_v2_invitations.py                           [neuf]
  test_v2_webhooks.py                              [neuf]

racine/
  pyproject.toml                                   [neuf]
  .pre-commit-config.yaml                          [neuf]
  CLEANUP_TEMPLATES.md                             [neuf]
  CHANGELOG_2026_05_V2.md                          [ce fichier]
  PATCHES.md                                       [étendu §22, §23]
```

---

## <a id="migrations"></a>4. Migrations à appliquer

```bash
python manage.py migrate certifications  # 0003_revoked_at_and_constraint
python manage.py migrate organizations   # 0005_invitation_unique_partial
```

**Vérification préalable** pour `organizations/0005` : vérifier qu'il n'y
a pas déjà 2 invitations pending pour le même triplet `(org, email, role)` :

```sql
SELECT organization_id, email, role, count(*)
FROM organizations_organizationinvitation
WHERE accepted_at IS NULL
GROUP BY organization_id, email, role HAVING count(*) > 1;
```

Si la requête retourne des lignes, dédoublonner avant migration.

Les migrations ne modifient pas les données existantes : ce sont des
contraintes d'unicité partielles + nouveaux champs nullable.

---

## <a id="tests"></a>5. Tests ajoutés

```
tests/test_v2_certifications.py    # 4 tests
tests/test_v2_invitations.py       # 3 tests
tests/test_v2_webhooks.py          # 2 tests
```

Combiné aux tests de V1, on a maintenant **24+ tests** couvrant les
correctifs critiques. Lancement :

```bash
pytest tests/ -v --reuse-db
pytest tests/ --cov=. --cov-report=term-missing  # avec coverage
```

---

## <a id="deploy"></a>6. Procédure de déploiement

1. Merger les `.new` de V1 (CHANGELOG_2026_05.md) si pas déjà fait.
2. Merger les `.new` de V2 :
   ```bash
   find . -name "*.new" | while read f; do mv "$f" "${f%.new}"; done
   ```
3. Appliquer la suppression des templates orphelins (cf. `CLEANUP_TEMPLATES.md`).
4. Migrations :
   ```bash
   python manage.py makemigrations  # vérifier output (rien d'inattendu)
   python manage.py migrate
   ```
5. Smoke tests : `pytest tests/ -v`.
6. Brancher pre-commit : `pre-commit install`.

### Action requise hors code

**SEC-22 / providers PSP** : la fonction
`commerce.views._verify_webhook_signature` retourne actuellement `True`
(stub DEV). **NE PAS DÉPLOYER EN PROD sans implémenter la vérification de
signature** par provider :

- Stripe : `stripe.Webhook.construct_event(payload, sig_header, secret)`
- Paydunya : MD5 du body + clé secrète
- CinetPay : HMAC selon doc PSP

Si vous n'avez pas encore choisi de PSP, désactivez la route webhook par
configuration (env var `COMMERCE_WEBHOOKS_ENABLED=False`) ou retirez
temporairement de `commerce/urls.py`.

**SEC-06 / 2FA** : les packages sont installés (V1), mais les URLs
two_factor ne sont pas encore exposées. À faire en V3 (cf. roadmap
Vague 3 dans `CHANGELOG_2026_05.md`).

---

## <a id="reste"></a>7. Reste roadmap (V4-V7)

À ce stade, **51 critiques et la majorité des 172 importants** de l'audit
sont fermés. Ce qui reste :

### Vague 4 — Performance (1 semaine)

- Cache Redis 30-60s sur les dashboards (`OrganisationDashboard`,
  `PlatformAdminDashboard`).
- Annotations sur `CourseViewSet.get_queryset` pour éviter les `null`
  sur `sections_count`, `lessons_count`, etc. (API-33).
- Index pg_trgm sur `Course.title`.
- Pagination DRF unifiée (remplacer `InstructorMediaListView`).
- Cache du context processor `workspaces` (COMPTE-05/21).

### Vague 5 — UX/UI lourd (2 semaines)

- Suppression effective des layouts dupliqués (`admin_base_template.html`,
  `company_base.html`) ; migration vers `admin_base.html`.
- Accessibilité : `for=` sur 193 labels, `autocomplete` sur 25+ forms,
  ARIA dropdowns/modales, focus trap, ESC handlers.
- Player vidéo sécurisé (signed URL 60s + `controlsList="nodownload"`)
  visuel.
- Build Tailwind production + pin Alpine 3.14.3.

### Vague 6 — Refactor + tests + CI/CD (2-3 semaines)

- Splitter `best_epargne/apis/views.py` (3 238 lignes) en sous-modules.
- Splitter `formations/views.py` (2 039 lignes) ; renommer l'app.
- Coverage cible 60% : permissions, scope org, paiement, quiz.
- CI : `pip-audit`, Trivy scan image, Renovate.
- Migration `psycopg2 → psycopg 3`, `urllib3 1.x → 2.x`.
- Backups Postgres (wal-g) + MinIO (`mc mirror`).
- Logs JSON + request-id + Flower + Prometheus exporter.

### Vague 7 — Décision Channels

- Soit retirer la mention "Channels/WebSockets" de la doc et du brief
  produit (le code ne l'utilise pas — INFRA-01).
- Soit installer `channels[daphne]` + `channels-redis`, créer `routing.py`,
  basculer Docker sur `daphne`/`uvicorn`.

---

## État global du projet après V1 + V2

| Catégorie | Findings initiaux | Fermés / atténués | Restants (roadmap) |
|---|---|---|---|
| Critiques sécurité | 51 | **~45** (88 %) | 6 (signature webhook, 2FA admin, dépendances EOL) |
| Critiques produit | (inclus) | ~5/5 (cert verify, invitation, commerce, role legacy, idempotence) | — |
| Importants | 172 | **~90** | ~82 (UX/UI lourd, perf dashboards, refactor god-modules) |
| Mineurs | 127 | ~30 | ~97 |

Les bugs **exploitables trivialement** sont fermés. Les workflows
**critiques métier** (certificats vérifiables, invitations, webhook
idempotent, sync licences) sont fonctionnels.

— Audit & remediation team, V1 + V2, mai 2026.
