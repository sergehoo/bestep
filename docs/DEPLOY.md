# Best-Épargne — Runbook de déploiement production

Procédure pas à pas pour déployer une nouvelle version en production.
Complémentaire à [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md)
(checklist go-live) et à [`../deploy/GO_LIVE_RUNBOOK.md`](../deploy/GO_LIVE_RUNBOOK.md)
(première mise en prod).

## Architecture (R26+)

Depuis R26, la SPA React remplace le frontend HTML Django. L'infra prod :

```
                Internet
                    │
                    ▼
             ┌─────────────┐
             │   Traefik   │  (HTTPS + Let's Encrypt)
             └──────┬──────┘
                    │ Host(ayo-group.com)
                    ▼
             ┌─────────────┐
             │  bestfront  │  nginx alpine
             │  (SPA + RP) │  /assets/*.html  → dist/
             └──────┬──────┘  /api/, /admin/  → bestweb
                    │
                    ▼  (network internal, non exposé)
             ┌─────────────┐
             │   bestweb   │  gunicorn + Django
             │   (API)     │
             └─────────────┘
                    │
        ┌───────────┼──────────┐
        ▼           ▼          ▼
      bestDB      redis     bestminio
```

- **`bestfront`** (nouveau) : image nginx multi-stage qui build le bundle
  React (`frontend/Dockerfile`) et sert `dist/`. Fait aussi le reverse-proxy
  vers `bestweb` pour les préfixes `/api/`, `/admin/`, `/media/`, `/static/`.
- **`bestweb`** : Django + gunicorn, network `internal` uniquement (plus de
  label Traefik). Reste joignable via `bestfront` sur le network interne.
- Les URLs HTML historiques de Django (HomeView, `/catalog/`, `/dashboard/…`)
  restent définies dans `urls.py` mais ne sont plus atteignables du public
  puisque nginx ne les proxifie pas. Cf. commentaire au haut de `urls.py`.

## Vue d'ensemble

```
   Local / CI                          Serveur prod
┌──────────────┐                    ┌────────────────┐
│  git tag +   │──── docker push ──▶│  registry pull │
│  npm build   │                    │                │
│  tests       │◀──── deploy ───────┤ preflight.sh   │
│              │                    │ migrate        │
│              │                    │ collectstatic  │
│              │                    │ restart        │
│              │                    │ smoke_prod.sh  │
└──────────────┘                    └────────────────┘
```

## 1. Préparer la release (poste dev)

```bash
# 1. Vérifier que main est vert
git checkout main && git pull

# 2. Typecheck frontend + tests backend
cd frontend && ./node_modules/.bin/tsc --noEmit
cd .. && pytest -x -q

# 3. Build frontend production
cd frontend
cp .env.production.example .env.production
# → éditer VITE_API_URL etc.
npm run build
ls -la dist/

# 4. Créer tag semver
git tag -a v1.0.0 -m "Release v1.0.0 — <description>"
git push origin v1.0.0
```

## 2. Preflight sur le serveur cible

```bash
# Se connecter au serveur
ssh deploy@ayo-group.com
cd /srv/best_epargne

# Récupérer la version cible
git fetch --tags
git checkout v1.0.0

# Charger l'environnement prod
set -a; source .env; set +a

# Lancer les vérifications
./deploy/preflight.sh
```

Si le script retourne **exit code 1**, corriger les erreurs (variables manquantes,
Redis injoignable, etc.) **avant** de continuer.

## 3. Backup DB (obligatoire)

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec best_epargne_db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "backups/pre_deploy_${TIMESTAMP}.sql.gz"

# Vérifier la taille et l'intégrité
ls -lh "backups/pre_deploy_${TIMESTAMP}.sql.gz"
gzip -t "backups/pre_deploy_${TIMESTAMP}.sql.gz" && echo OK
```

## 4. Déploiement

### Option A — Docker Compose

```bash
# 1. Pull nouvelle image
docker-compose pull web

# 2. Appliquer les migrations
docker-compose run --rm web python manage.py migrate --noinput

# 3. Collecter les statiques
docker-compose run --rm web python manage.py collectstatic --noinput

# 4. Restart des services applicatifs (pas de la DB)
docker-compose up -d --no-deps --build web celery celery-beat

# 5. Vérifier les logs pendant 2 min
docker-compose logs -f --tail=50 web
```

### Option B — Systemd (Gunicorn direct)

```bash
sudo systemctl stop best_epargne
git pull origin v1.0.0
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput
sudo systemctl start best_epargne
sudo systemctl status best_epargne
```

## 5. Smoke test post-deploy

```bash
./deploy/smoke_prod.sh
```

Le script vérifie :
- Landing publique répond 200
- `/api/health/` répond OK
- `/api/public/courses/` renvoie une liste JSON
- `/api/auth/login/` accepte les POST (400 sur credentials vides est OK)

## 6. Vérification manuelle (5 min)

- [ ] Ouvrir https://ayo-group.com → landing s'affiche + logos OK
- [ ] `/catalogue` → liste des cours
- [ ] `/login` → formulaire fonctionnel
- [ ] Connexion avec un compte existant → redirection vers `/learn` ou `/instructor`
- [ ] Ouvrir un cours et le lecteur → progression enregistrée
- [ ] Console navigateur : pas d'erreur JS bloquante
- [ ] Sentry : dernières erreurs, vérifier qu'il n'y a rien de nouveau critique

## 7. Communication

Poster sur le canal de release (Slack / Discord / Email) :

```
🚀 Best-Épargne v1.0.0 déployée en production
- Commit : <sha>
- Changelog : docs/RELEASE_NOTES.md
- Sentry release : v1.0.0
```

---

## Rollback

Si un incident critique est détecté dans les 30 min post-deploy :

### Rollback code

```bash
# 1. Repérer le tag précédent
git tag --sort=-creatordate | head -5

# 2. Revenir en arrière
git checkout v0.9.0
docker-compose pull web
docker-compose up -d --no-deps --build web celery celery-beat
```

### Rollback DB (SI ET SEULEMENT SI la migration est incompatible)

Les migrations Best-Épargne sont **additives-safe** — un rollback DB
n'est normalement pas nécessaire. Si toutefois une migration a introduit
une contrainte cassante :

```bash
# Restaurer le backup pris à l'étape 3
gunzip -c backups/pre_deploy_20260709_143000.sql.gz \
  | docker exec -i best_epargne_db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

⚠ **Toute donnée créée entre le deploy et le rollback sera perdue.**
À ne faire qu'en dernier recours.

---

## Cadence recommandée

| Type          | Fréquence           | Fenêtre                       |
|---------------|---------------------|-------------------------------|
| Patch (fix)   | À la demande        | Heures ouvrées                |
| Minor         | Bi-mensuel          | Mardi/Mercredi 10h-16h        |
| Major         | Trimestriel         | Fenêtre annoncée 7 j à l'avance |

Éviter :
- Les déploiements le vendredi après-midi
- Les fenêtres critiques (fin de mois pour l'équipe finance client)
- Les périodes où l'astreinte est limitée
