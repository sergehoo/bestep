# Runbook production Best Épargne

> Phase 6 — Procédures opérationnelles consolidées.
> Déploiement, smoke test, monitoring, rollback.

---

## Pré-requis

- Accès SSH à `srv823238` (utilisateur `root`)
- Clé GitHub configurée pour le pull
- Variables d'environnement de prod dans `/home/ubuntu/bestep/.env`

---

## Procédure de déploiement standard

### 1. Préparation locale (machine de dev)

```bash
cd /Users/ogahserge/Documents/best_epargne

# Vérifier les tests passent
pytest tests/ -v --tb=short 2>&1 | tail -20

# Vérifier qu'on est sur la bonne branche
git branch --show-current
# Attendu : chore/audit-remediation-2026-05

# Vérifier qu'on a tout commit
git status --short
# Attendu : working tree clean

# Push
git push
```

### 2. Déploiement prod

```bash
ssh root@srv823238 << 'SCRIPT'
set -e
cd /home/ubuntu/bestep

# 1. Backup rapide DB (snapshot logique)
docker compose exec -T bestDB pg_dump -U bestuser -d bestdb > /tmp/db_backup_$(date +%Y%m%d_%H%M%S).sql || echo "WARN: pg_dump skip"

# 2. Pull
git fetch origin
git checkout chore/audit-remediation-2026-05
git pull --ff-only

# 3. Migrations (si présentes)
docker compose exec -T bestweb python manage.py migrate --noinput

# 4. Rebuild Tailwind (si modif tailwind.config.js ou app.css)
docker compose exec -T bestweb npm run build:css 2>&1 | tail -3

# 5. Static files
docker compose exec -T bestweb python manage.py collectstatic --noinput 2>&1 | tail -3

# 6. Restart
docker compose restart bestweb

# 7. Vérifier que ça boot
sleep 5
docker compose logs bestweb --tail=20
SCRIPT
```

### 3. Smoke test post-deploy

```bash
# Test rapide via curl
./deploy/smoke_prod.sh

# Ou manuel
curl -sf https://ayo-group.com/healthz/ && echo "✓ healthz"
curl -sf https://ayo-group.com/readyz/  && echo "✓ readyz"
curl -sI https://ayo-group.com/landinghome/catalogue/ | head -3
curl -sI https://ayo-group.com/account/login/ | head -3
```

---

## Rollback

### Si le déploiement échoue immédiatement

```bash
ssh root@srv823238 << 'SCRIPT'
cd /home/ubuntu/bestep

# 1. Revert au commit précédent
git log --oneline -5
PREV_COMMIT=$(git log --skip=1 -1 --format=%H)
git checkout $PREV_COMMIT

# 2. Rollback migrations (DANGER : seulement si la nouvelle migration n'a pas
#    été appliquée à du contenu utilisateur — sinon utiliser le backup SQL)
# Liste des dernières migrations appliquées :
docker compose exec -T bestweb python manage.py showmigrations --verbosity=0 \
  | grep -E "\\[X\\]" | tail -20

# Si tu veux dé-migrer une app spécifique au commit précédent :
# docker compose exec -T bestweb python manage.py migrate <app> <previous_migration_id>

# 3. Restart
docker compose restart bestweb
SCRIPT
```

### Si la régression est détectée après plusieurs minutes

Préférer un **fix forward** (corriger + redéployer) plutôt qu'un rollback si :
- des utilisateurs ont déjà créé/modifié des données dans la nouvelle version
- la migration ajoute des champs/tables (rollback = perte de données)

---

## Migrations potentiellement bloquantes

### Migrations posées en Phases 1-6

| Phase | Migration | Type | Réversible |
|---|---|---|---|
| P1 | `catalog/0011_course_lifecycle` | AddField `archived_at` + AddTable `CourseLifecycleEvent` | ✓ (sans casse) |
| P3 | `compte/0006_user_avatar_userpreferences` | AddField `avatar` + AddTable `UserPreferences` | ✓ (sans casse) |

Toutes nullable ou ajout de table → migration safe en avant comme en arrière.

### Backfill éventuel (post-déploiement)

```bash
# Pré-créer les UserPreferences pour les comptes existants
docker compose exec -T bestweb python manage.py shell -c "
from compte.models import User, UserPreferences
for u in User.objects.all():
    UserPreferences.objects.get_or_create(user=u)
print('OK backfill UserPreferences')
"

# Pré-renseigner archived_at pour les cours ARCHIVED legacy
docker compose exec -T bestweb python manage.py shell -c "
from catalog.lifecycle import backfill_archived_at
n = backfill_archived_at()
print(f'OK backfill archived_at sur {n} cours')
"
```

---

## Monitoring post-deploy

### Logs en temps réel

```bash
ssh root@srv823238 'cd /home/ubuntu/bestep && docker compose logs -f bestweb --tail=50'
```

### Erreurs Django

```bash
# Compter les erreurs récentes (5 dernières minutes)
ssh root@srv823238 'cd /home/ubuntu/bestep && \
  docker compose logs bestweb --since 5m 2>&1 \
  | grep -cE "(ERROR|CRITICAL|Internal Server Error)"'
# Attendu : 0 ou très faible

# Détail des dernières erreurs
ssh root@srv823238 'cd /home/ubuntu/bestep && \
  docker compose logs bestweb --since 5m 2>&1 \
  | grep -A 5 "ERROR" | tail -30'
```

### Performance des dashboards

```bash
# Temps de réponse moyens (200 dernières requêtes)
ssh root@srv823238 'cd /home/ubuntu/bestep && \
  docker compose logs bestweb --tail=500 \
  | grep -oE "response_time_ms\":[0-9.]+" \
  | sort -t: -k2 -n | tail -10'
```

---

## Variables d'environnement critiques

| Variable | Description | Valeur prod |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | Settings module | `best_epargne.settings.prod` |
| `DJANGO_SECRET_KEY` | Clé secrète | (env Docker) |
| `DJANGO_DEBUG` | **DOIT être 0 en prod** | `0` |
| `DJANGO_ALLOWED_HOSTS` | Hosts autorisés | `ayo-group.com,www.ayo-group.com` |
| `POSTGRES_*` | DB credentials | (env Docker) |
| `DB_SSLMODE` | SSL Postgres | `disable` (Docker mono-host) |
| `REDIS_URL` | Cache + sessions | `redis://redis:6379/1` |
| `MINIO_*` | Stockage médias | (env Docker) |
| `STRIPE_WEBHOOK_SECRET` | Vérif signature Stripe | (env Docker) |

⚠️ **Si `DJANGO_DEBUG=1` en prod** : fuit les credentials, la stacktrace et l'env var → désactiver immédiatement.

---

## Endpoints de monitoring

| Endpoint | Statut attendu | Usage |
|---|---|---|
| `/healthz/` | 200 OK | Healthcheck Docker / load balancer |
| `/readyz/` | 200 OK | DB + Redis OK |
| `/api/docs/` | 200 OK (Swagger) | Documentation API |
| `/admin/` | 302 vers login | Admin Django |

---

## Tests à exécuter avant chaque release

```bash
# Suite complète (depuis machine de dev)
pytest tests/ -v --tb=short

# Ou sous-ensemble critique
pytest tests/test_p1_*.py tests/test_p3_*.py tests/test_p4_*.py tests/test_p6_*.py -v
```

Au minimum :
- ✅ `test_p1_course_lifecycle.py` (17 tests)
- ✅ `test_p3_profiles_permissions.py` (20 tests)
- ✅ `test_p4_perf_n_plus_1.py` (11 tests perf)
- ✅ `test_p6_workflows_e2e.py` (13 tests E2E)

= **61 tests minimum** doivent passer avant tout déploiement.

---

## Incidents fréquents et solutions rapides

| Symptôme | Cause probable | Fix |
|---|---|---|
| `ValueError: Missing staticfiles manifest entry` | Fichier static non collecté | `python manage.py collectstatic --noinput` |
| `connection failed: server does not support SSL` | DB en SSL strict + Postgres Docker | `DB_SSLMODE=disable` dans `.env` |
| `No module named 'dotenv'` | `python-dotenv` non installé | Le module `settings/__init__.py` est défensif maintenant — le check est gracieux. |
| `ContextDict.__init__() got multiple values for argument 'context'` | Variable nommée `context` passée à `{% include %}` | Renommer en `card_context` ou autre |
| `Failed lookup for key [user] in <User: ...>` | View passe User mais template attend OrganizationMembership | Voir P3 — utiliser `OrganizationMembership.objects.filter(user=...)` |
| Page blanche `/dashboard/learner/courses/<id>/` | Cours non PUBLISHED / pas d'Enrollment | Voir `LearnerCoursePlayerView.dispatch` |
| Console : `Alpine Expression Error` | Code non CSP-safe (eval / x-html / mots-clés JS) | Voir `learner-course-player.js` pour les patterns CSP-safe |

---

## Contacts

- **Devops** : Serge Ogah (serge.ogah@kaydangroupe.com)
- **Repo GitHub** : sergehoo/bestep
- **Branche prod** : `chore/audit-remediation-2026-05`
- **Domaine** : ayo-group.com
