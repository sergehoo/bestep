#!/usr/bin/env bash
#
# apply.sh — Script d'application des correctifs Best Épargne (V1+V2+V3+V4).
#
# IMPORTANT : à lancer SUR UNE BRANCHE GIT DÉDIÉE, après commit/stash de
# tout ce qui traîne, et après lecture des CHANGELOG_2026_05*.md.
#
# Usage :
#   ./apply.sh check    # liste les fichiers .new sans appliquer
#   ./apply.sh dry-run  # montre ce que mv ferait
#   ./apply.sh apply    # applique tous les .new (mv .new → original)
#   ./apply.sh undo     # restaure depuis git (au cas où)

set -euo pipefail

ACTION="${1:-check}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Couleurs (TTY only).
if [ -t 1 ]; then
  C_GREEN="\033[1;32m"; C_YELLOW="\033[1;33m"; C_RED="\033[1;31m"; C_RESET="\033[0m"
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi

find_new_files() {
  find "$ROOT_DIR" \
    -name "*.new" \
    -not -path "*/venv/*" \
    -not -path "*/staticfiles/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -type f \
    | sort
}

count_new() {
  find_new_files | wc -l | tr -d ' '
}

case "$ACTION" in
  check|list)
    echo -e "${C_YELLOW}=== Fichiers .new trouvés ===${C_RESET}"
    find_new_files
    n=$(count_new)
    echo -e "${C_YELLOW}=== Total : $n fichiers .new ===${C_RESET}"
    ;;

  dry-run)
    echo -e "${C_YELLOW}=== Simulation (aucune modif appliquée) ===${C_RESET}"
    while IFS= read -r f; do
      orig="${f%.new}"
      if [ -f "$orig" ]; then
        echo "mv $f $orig  (overwrite)"
      else
        echo "mv $f $orig  (new file)"
      fi
    done < <(find_new_files)
    ;;

  apply)
    n=$(count_new)
    if [ "$n" -eq 0 ]; then
      echo -e "${C_GREEN}Aucun .new à appliquer.${C_RESET}"
      exit 0
    fi
    echo -e "${C_YELLOW}Application de $n fichiers .new...${C_RESET}"
    # Vérif git tree clean.
    if command -v git >/dev/null 2>&1; then
      if ! git -C "$ROOT_DIR" diff --quiet 2>/dev/null; then
        echo -e "${C_RED}⚠️ Working tree non clean. Commitez/stashez avant.${C_RESET}"
        echo -e "${C_YELLOW}(Passe avec FORCE=1 pour ignorer)${C_RESET}"
        if [ "${FORCE:-0}" != "1" ]; then exit 1; fi
      fi
    fi
    applied=0
    while IFS= read -r f; do
      orig="${f%.new}"
      mv "$f" "$orig"
      echo "  ✓ $orig"
      applied=$((applied+1))
    done < <(find_new_files)
    echo -e "${C_GREEN}=== $applied fichiers appliqués ===${C_RESET}"
    echo
    echo -e "${C_YELLOW}Prochaines étapes :${C_RESET}"
    echo "  1. Relire le diff : git diff"
    echo "  2. Appliquer les migrations : python manage.py migrate"
    echo "  3. Lancer les tests : pytest tests/ -v"
    echo "  4. Smoke test : python manage.py check --deploy"
    echo "  5. Voir CLEANUP_TEMPLATES.md pour supprimer les 7 templates orphelins"
    echo "  6. Brancher 2FA : voir PATCHES.md §26"
    echo "  7. Variables d'env webhooks : voir CHANGELOG_2026_05_V3.md §5"
    ;;

  undo)
    echo -e "${C_YELLOW}Restauration depuis git...${C_RESET}"
    git -C "$ROOT_DIR" restore . || {
      echo -e "${C_RED}Échec git restore — utilisez git manuellement.${C_RESET}"
      exit 1
    }
    echo -e "${C_GREEN}Restauration terminée.${C_RESET}"
    ;;

  *)
    echo "Usage: $0 {check|dry-run|apply|undo}"
    echo
    echo "  check    : liste les fichiers .new sans appliquer"
    echo "  dry-run  : montre ce que apply ferait"
    echo "  apply    : applique tous les .new (mv → original)"
    echo "  undo     : restaure depuis git (au cas où)"
    exit 1
    ;;
esac
