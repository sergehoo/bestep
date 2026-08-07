# Best-Épargne

Plateforme e-learning dédiée à la finance, l'épargne et l'investissement.
Trois espaces : apprenant, formateur, organisation.

Backend Django + API REST, frontend React servi séparément.

## Stack

| Composant | Technologie |
|---|---|
| Backend | Django 4.2 · Django REST Framework · Python 3.9 |
| API | OpenAPI 3.0 via drf-spectacular (`/api/schema/`, `/api/docs/`) |
| Frontend | React 18 · TypeScript · Vite 6 |
| Base de données | PostgreSQL |
| Cache / files | Redis · Celery · Celery Beat |
| Stockage objet | MinIO |
| Reverse proxy | nginx (SPA) derrière Traefik |

## Démarrage local

Prérequis : PostgreSQL et Redis joignables en local, Python 3.9, Node 18+.

### Backend

```bash
python -m venv venv && ./venv/bin/pip install -r requirements.txt
DJANGO_SETTINGS_MODULE=best_epargne.settings.dev ./venv/bin/python manage.py migrate
DJANGO_SETTINGS_MODULE=best_epargne.settings.dev ./venv/bin/python manage.py runserver
```

L'API répond alors sur `http://localhost:8000/api/`.
Schéma OpenAPI : `/api/schema/` · Documentation : `/api/docs/`.

### Frontend

```bash
cd frontend && npm install && npm run dev
```

Le SPA démarre sur `http://localhost:5173`.

### Pile complète

```bash
docker compose up
```

Démarre `bestweb` (Django), `bestfront` (nginx + SPA), PostgreSQL, Redis,
MinIO, Celery et Celery Beat.

## Configuration

`manage.py` pointe par défaut sur `best_epargne.settings.prod`. Pour
développer, exporter explicitement :

```bash
export DJANGO_SETTINGS_MODULE=best_epargne.settings.dev
```

Les réglages vivent dans `best_epargne/settings/` (`base.py`, `dev.py`,
`prod.py`). Le fichier `best_epargne/settings.py` est déprécié et lève une
`ImportError` : Python donne la priorité au package sur le module homonyme.

Variables d'environnement : voir `.env.example`. Trois sont critiques en
production et n'ont pas de valeur par défaut exploitable :

- `DJANGO_SECRET_KEY` — le démarrage est refusé hors `DEBUG` si elle manque
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_FRONTEND_BASE_URL` — base de tous les liens envoyés par e-mail
  (vérification d'adresse, validation formateur). Si elle est vide, les liens
  partent en relatif et sont inutilisables dans un client mail.

En développement, les e-mails sortent sur la console.

## Tests

```bash
./venv/bin/python -m pytest tests/ -q      # backend
cd frontend && npm run typecheck           # types
cd frontend && npm run lint                # lint
cd frontend && npm run e2e                 # Playwright
```

## Sécurité

Le contenu riche saisi par les instructeurs et le lexique est assaini des
deux côtés, volontairement :

- à l'écriture, par `core/sanitizers.py` (bleach, allowlist partagée)
- au rendu, par `frontend/src/lib/sanitize.ts` (DOMPurify)

Les deux allowlists doivent rester synchronisées. Une balise autorisée d'un
côté et retirée de l'autre disparaît silencieusement à l'affichage.

Un hook `validate_*` de serializer ne protège que les vues qui font
réellement transiter la donnée par le serializer : plusieurs vues formateur
sont des `APIView` qui écrivent directement depuis `request.data` et doivent
appeler `sanitize_rich_html` explicitement.

La CSP du SPA est posée par `frontend/nginx.conf`, pas par Django : le
middleware CSP ne couvre que les réponses rendues par Django. Les en-têtes de
sécurité y sont répétés dans `location /`, car nginx n'hérite pas des
`add_header` du niveau `server` dès qu'un `location` en définit un.

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/API_FRONTEND_CONTRACT.md` | Contrat API consommé par le SPA |
| `docs/DEPLOY.md` | Procédure de déploiement |
| `docs/FRONTEND_SETUP.md` | Mise en place du frontend |
| `docs/PRODUCTION_CHECKLIST.md` | Vérifications avant mise en production |
| `docs/GLOSSARY_MODULE.md` | Module lexique |
| `docs/PROJECT_STATUS.md` | État du projet |
| `AGENTS.md` / `CLAUDE.md` | Conventions pour les agents IA |

## Méthode

Le projet est équipé du framework OStack : toute affirmation de réussite doit
être adossée à une preuve exécutée. Voir `CLAUDE.md` et `.ostack/`.
