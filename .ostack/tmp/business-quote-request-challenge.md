# Proposition à contester

Remplacer les liens `mailto:` de la page Entreprise par une modale sans
inscription. La soumission publique est limitée, validée et stockée dans
`BusinessInterestRequest`. La réponse publique est minimale. Les
administrateurs plateforme actifs reçoivent une notification interne et sont
les seuls à pouvoir consulter ou modifier la file de traitement. Le suivi
conserve statut, notes, administrateur et dates.

## Contrôles exécutés

- 11 tests API couvrent soumission anonyme, validation, anti-robot, réponse
  minimale, notification, permissions, filtres et traçabilité ;
- compilation Django et migration sans dérive ;
- typecheck et build frontend ;
- observation navigateur : trois CTA sont des boutons, la modale s’ouvre, le
  plan est prérempli et aucun lien `mailto:` public ne subsiste.

## Points à challenger

- contournement de la permission administrateur ;
- fuite de données personnelles ou de notes internes ;
- spam et charge non bornée ;
- incohérence entre ancien champ `is_processed` et le nouveau statut ;
- régression des CTA existants ou accessibilité de la modale.
