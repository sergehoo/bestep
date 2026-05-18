# Nettoyage des templates orphelins — V5.B (CQ-45)

**Vérifié le 17 mai 2026.** Les 7 templates ci-dessous ne sont référencés
NULLE PART dans le code (`*.py` ni `*.html`) :

```
templates/company/dashbord.html        (typo "dashbord")
templates/home/admin.html
templates/home/admin_dash.html
templates/instructor/instructor.html   (≈ 1 500 lignes legacy)
templates/instructor/admin_dash.html
templates/learner/learner.html
templates/layout/company_base.html     (duplicata d'admin_base.html)
```

**~5 000 lignes** de code mort. Risque de suppression : **nul**, vérification
faite par `grep -r` sur l'ensemble du repo (hors `venv/`, `staticfiles/`).

## Procédure de suppression

```bash
cd /Users/ogahserge/Documents/best_epargne

# 1. Double-check (doit retourner 0 résultat)
grep -rln \
  -e "company/dashbord" \
  -e "home/admin.html" \
  -e "home/admin_dash" \
  -e "instructor/instructor.html" \
  -e "instructor/admin_dash" \
  -e "learner/learner.html" \
  -e "layout/company_base" \
  --include="*.py" --include="*.html" \
  . 2>/dev/null | grep -v venv | grep -v staticfiles

# 2. Suppression (un seul commit, message clair)
git rm \
  templates/company/dashbord.html \
  templates/home/admin.html \
  templates/home/admin_dash.html \
  templates/instructor/instructor.html \
  templates/instructor/admin_dash.html \
  templates/learner/learner.html \
  templates/layout/company_base.html

git commit -m "chore(templates): supprime 7 templates orphelins (CQ-45)

~5000 lignes de code mort issues de prototypes anciens.
Vérification grep : aucune référence dans Python ni dans les autres templates."

# 3. Le dossier templates/company/ peut être vidé (un seul fichier dedans).
rmdir templates/company 2>/dev/null
```

Une fois supprimés, la structure templates devient :

```
templates/
├── account/
├── assessments/
├── business/
├── certifications/   (nouveau V2.A)
├── commerce/         (nouveau V2.C)
├── home/
├── instructor/
├── layout/
├── learner/
├── organization/
├── partials/
└── platform/
```

Beaucoup plus lisible. Le risque qu'un dev modifie un de ces fichiers en
pensant qu'il est actif disparaît.
