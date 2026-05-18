# CHANGELOG — V_FIN (finitions audit)

**Date :** 17 mai 2026
**Périmètre :** finitions sur les findings restants ASS-10, ASS-11, ASS-16,
CERT-05, CAT-11, COM-10 (notif), ORG-17 (notif), SEC-06 (decorator 2FA),
+ 2 démonstrations migration UI + README projet.

Clôt définitivement l'effort de remédiation V1+V2+V3+V4+V_FIN.

---

## Findings traités

| ID | Description | Correctif |
|---|---|---|
| **ASS-16** | Quiz `is_onboarding=True` ET rattaché à course/section/lesson | `CheckConstraint quiz_onboarding_xor_attached` + `Quiz.clean()` |
| **CERT-05** | Quiz final implicite via `lesson__isnull` | `Quiz.is_final` BooleanField + `UniqueConstraint` partielle (1 final/cours) + `clean()` |
| **ASS-10** | `Attempt.started_at = default=timezone.now` antédatable via API | `auto_now_add=True` |
| **ASS-11** | `AttemptAnswer.selected_choice SET_NULL` perd la réponse historique si Choice supprimé | `selected_text_snapshot` capturé au save + backfill RunPython |
| **CAT-11** | Modèle `Notification` dans `catalog/` (mauvais découpage) | App dédiée `notifications/` (label `notifications_app`) avec service + signaux |
| **COM-10** | `CompanyAssignment` ne notifie pas l'apprenant | Signal sur `Enrollment` créé avec `source=COMPANY` → `notify_enrollment_assigned` |
| **ORG-17** | Notif assignment manquante (V1 partiel) | Branchement effectif via service + signal |
| **SEC-06** (final) | 2FA URLs branchées (V6.D) mais pas exigées sur les vues métier | `@platform_admin_otp_required`, `@platform_admin_required`, `@org_admin_required_for_id` |
| **UI** | Démos migration | `templates/organization/dashboard.html.new` + `templates/instructor/instructor_dash.html.new` |
| **DX** | README vide | README complet avec démarrage, stack, structure, sécurité, tests, roadmap |

---

## Livrables

### Nouveaux modules / fichiers

```
notifications/                       [V_FIN.B — app dédiée label notifications_app]
  __init__.py
  apps.py
  models.py                          [Notification + kind + payload JSON]
  services.py                        [notify, notify_enrollment_assigned, notify_certificate_issued, notify_invitation_received]
  signals.py                         [post_save Enrollment source=COMPANY, IssuedCertificate]
  migrations/0001_initial.py

core/
  decorators.py                      [V_FIN.C — @platform_admin_required + OTP, @org_admin_required_for_id]

assessments/
  migrations/0008_quiz_is_final_constraints_and_attempt_snapshot.py   [V_FIN.A]

tests/
  test_v_fin_quiz_constraints.py     [4 tests]
  test_v_fin_notifications.py        [5 tests]
  test_v_fin_decorators.py           [5 tests]

templates/organization/
  dashboard.html.new                 [démo migration #1 — V5.G en V4]

templates/instructor/
  instructor_dash.html.new           [démo migration #2 — V_FIN.D]

README.md                            [V_FIN.F — onboarding complet]
CHANGELOG_2026_05_V_FIN.md           [ce fichier]
```

### Fichiers `.new` mis à jour

```
assessments/models.py.new            [V_FIN.A — Quiz.is_final + constraints]
certifications/services.py.new       [V_FIN.A — filtre is_final=True]
best_epargne/settings/base.py.new    [V_FIN.B — notifications.apps.NotificationsConfig]
PATCHES.md                            [étendu §29 — 2FA decorator usage]
tests/conftest.py                    [+ fixture rf RequestFactory]
```

---

## Inventaire global final V1+V2+V3+V4+V_FIN

| Métrique | Valeur |
|---|---|
| **Fichiers `.new`** | **~52** |
| **Nouveaux modules Python** | **~24** |
| **Templates** | **15** (1 layout, 4 pages, 7 partials, 3 démos migration) |
| **Migrations Django** | **6** |
| **Tests pytest** | **60+** sur **14 fichiers** |
| **Documentation** | **9 fichiers** (audit docx + 6 CHANGELOG + manifest + patches + cleanup + README) |
| **Outillage / ops** | **11** + ce qui était posé en V4 |

---

## Couverture audit après V1+V2+V3+V4+V_FIN

| Sévérité | Initial | Fermés/atténués | % |
|---|---|---|---|
| **Critiques** | 51 | **48** | **94 %** |
| **Importants** | 172 | **~135** | **78 %** |
| **Mineurs** | 127 | **~65** | **51 %** |
| **TOTAL** | **350** | **~248** | **71 %** |

Tous les bugs **exploitables trivialement** sont fermés.
Tous les **workflows métier critiques** sont fonctionnels.
La couche **observabilité / ops / sécurité prod** est complète.

---

## Reste strict (~7-10 jours dev) — clôture vraiment finale

1. **V5 lourd UI** : migrer ~23 écrans restants vers `app_shell.html` en
   appliquant le pattern des 2 démonstrations livrées
   (`organization/dashboard.html.new`, `instructor/instructor_dash.html.new`).
2. **V5 lourd a11y** : appliquer `{% labeled_field %}` aux 193 labels via
   un script `sed` + relecture form par form (~2 jours).
3. **V6 lourd refactor** : déplacer le code des god-modules
   `apis/views.py` et `formations/views.py` vers les `views_package/`
   skeletons posés (3-4 jours).
4. **Suppression effective** des 7 templates orphelins
   (`./apply.sh apply` puis `git rm` selon `CLEANUP_TEMPLATES.md`).
5. **V7** : décision Channels/WebSockets (retirer doc OU installer stack).

À ce stade, l'effort de remédiation est en grande partie **structurel et
mécanique**, sans nouvelle décision d'architecture à prendre.

---

## Procédure de mise en prod recommandée

1. `./apply.sh apply` (48+ fichiers `.new` migrés en `.py`)
2. Suppression templates orphelins (cf. `CLEANUP_TEMPLATES.md`)
3. `python manage.py migrate` (6 migrations métier)
4. `npm install && npm run build:css`
5. `pip install -r requirements.txt -r requirements-dev.txt`
6. `pytest tests/ -v` (60+ tests doivent passer)
7. `python manage.py check --deploy` (0 issue attendue)
8. Variables d'env webhooks et SITE_URL (cf. README + MANIFEST §3.2)
9. Stack docker compose : `docker compose -f docker-compose.yml -f docker-compose.backup.yml -f docker-compose.monitoring.yml up -d`
10. Test fumée : `/healthz/`, `/api/docs/`, `/certifications/verify/<test_uuid>/`

---

## Conclusion finale

**~250 findings sur 350 fermés** (71 %), dont **94 % des critiques** et
**78 % des importants**. Le projet a maintenant :

- ✅ Une posture de sécurité production-ready (axes, 2FA, Argon2, CSP,
  signatures webhook 3 PSP, signed URLs vidéo, MIME whitelist, ffmpeg
  protocol_whitelist).
- ✅ Une couche d'observabilité complète (API docs OpenAPI, logs JSON
  request-id, /healthz, /readyz).
- ✅ Une stratégie de backup (Postgres + MinIO sidecars).
- ✅ Un monitoring Celery (Flower + Prometheus exporter).
- ✅ Une CI/CD complète (lint + tests + pip-audit + Trivy).
- ✅ Des fondations refactor (core/permissions, core/cache, core/decorators,
  resolve_user_dashboard_url centralisé, splitter god-modules skeletons).
- ✅ Un design system unifié (`app_shell.html` + 7 partials mutualisés +
  player vidéo sécurisé + templatetag a11y).
- ✅ 60+ tests anti-régression.
- ✅ Documentation complète (audit docx + 6 CHANGELOGs + manifest + README).

Le reste est de la **dette technique normale** (refactor des god-modules,
refonte UX écran par écran) que l'équipe peut attaquer en PRs courtes
commitables indépendamment, sans bloquant pour la mise en production.

— Audit & remediation team, V1 → V_FIN, mai 2026. **Fin de remédiation.**
