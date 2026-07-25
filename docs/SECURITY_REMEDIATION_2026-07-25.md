# Corrections des bloqueurs de livraison — 25 juillet 2026

## Problèmes corrigés

### Détection de secrets

- Le jeton JWT d'exemple de `docs/API_FRONTEND_CONTRACT.md` ressemblait à un
  secret réel. Il a été remplacé par une valeur manifestement fictive.
- Le faux positif historique correspondant est ignoré par son empreinte exacte
  dans `.gitleaksignore`; aucune règle globale n'est désactivée.
- Le fichier `.env` local, non versionné, est exclu précisément par
  `.gitleaks.toml`. Les autres fichiers d'environnement restent analysés.
- Les source maps de production ne sont plus générées par défaut.

Les scans Gitleaks de l'historique Git et du répertoire de travail retournent
zéro constat.

### Alertes de sécurité hautes

- Le conteneur frontend Nginx s'exécute maintenant avec l'utilisateur non
  privilégié `nginx`, sur le port 8080, avec uniquement les répertoires
  nécessaires accessibles en écriture.
- `postcss` et les dépendances frontend vulnérables ont été actualisés.
- L'ancienne chaîne Workbox/PWA, qui apportait des dépendances vulnérables, a
  été remplacée par un service worker natif conservant l'installation et la
  mise à jour PWA.
- React Router a été actualisé vers la version corrective 6.30.4.

Les audits npm du projet racine et du frontend retournent zéro vulnérabilité
critique ou haute. Deux paquets React Router restent signalés au niveau modéré :
les avis portent sur certaines navigations construites depuis une entrée non
fiable et sur l'hydratation SSR. L'application n'utilise pas le SSR et ses
destinations de navigation sont déclarées en interne. Une migration majeure
vers React Router 7 devra néanmoins être planifiée pour supprimer ces avis.

### Échecs de la suite globale

Les 33 échecs initiaux provenaient de plusieurs causes regroupées :

- contamination du cache et des compteurs de throttling entre tests;
- transitions de cycle de vie évaluées sur des objets Django périmés;
- détection incorrecte du séparateur CSV du glossaire;
- import local d'`Enrollment` après sa première utilisation;
- variables de salutation absentes et échappement HTML attendu incorrect;
- identifiant JWT sérialisé en chaîne par la version courante de SimpleJWT.

Les corrections isolent le cache entre tests sans désactiver le throttling,
rechargent les cours sous verrou avant validation, fiabilisent le parseur CSV
et alignent les assertions sur les contrats actuels.

## Vérifications exécutées

- Suite globale : 297 tests réussis.
- Régressions devis et aperçus multiples : 19 tests réussis.
- TypeScript : contrôle de types réussi.
- Frontend : compilation de production réussie, sans source map.
- Django : contrôle système réussi, aucune migration manquante.
- OStack : aucun bloqueur critique ou haut; verdict de sécurité
  `APPROVE_WITH_OBSERVATIONS`.

La construction de l'image Docker n'a pas pu être exécutée localement, car le
moteur Docker n'était pas démarré. La configuration Compose a été validée et
le contrôle Semgrep ne signale plus l'exécution du Dockerfile en root.
