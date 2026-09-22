# Plusieurs tableaux dans une zone

L’administration utilise 12 zones par salle. **A2 est une seule zone** : l’ancien « A2 bas » appartient à A2, comme « B2 bas » à B2. La conversion conserve exactement la taille de l’image et sa position dans la galerie. Elle accepte aussi les anciens brouillons et ne réécrit pas le catalogue à sa lecture.

## Placement

- Les limites en pointillés restent visibles pour toutes les zones du mur. Les zones pleines restent accessibles avec leur bouton **Ajouter ici +**.
- Chaque tableau a sa propre zone de clic, correspondant au cadre visible. Le glissement modifie sa position dans les deux axes ; il s’arrête aux limites et aux cadres voisins. Un geste correspond à une annulation.
- L’ajout cherche un rectangle libre, aux limites de la zone et autour des œuvres présentes. Si nécessaire, seule la nouvelle œuvre est réduite, en conservant son ratio. Aucune œuvre déjà placée n’est déplacée ou redimensionnée.
- L’ajout automatique refuse une taille dont le petit côté serait inférieur à **25 cm dans le showroom**. L’œuvre reste dans la réserve avec un message explicite. Les réglages manuels de taille restent indépendants de ce seuil d’ajout automatique.
- Les dimensions réelles de la description sont indépendantes de la taille dans le showroom. La poignée et les champs de largeur/hauteur utilisent la même géométrie que la galerie ; les champs acceptent la virgule décimale. Les valeurs arrondies à l’écran ne bloquent plus une taille valide.
- Les cartels sont masqués lorsqu’ils entreraient en collision avec un autre cadre ou cartel. Le titre reste disponible dans la fiche et la liste des œuvres.

Le plan de salle reste déplié. La réserve et le brouillon appartiennent uniquement à la salle ouverte. Un brouillon incomplet peut être enregistré ; appliquer à la galerie exige toutes les œuvres placées sans chevauchement. Les anciens identifiants d’emplacement restent lisibles, mais les nouveaux accrochages utilisent la zone partagée.

## Validation et stockage

Le serveur autorise plusieurs œuvres avec le même identifiant de zone et vérifie leurs rectangles réels, la marge de 4 cm entre cadres, les bornes, les révisions et l’appartenance à la salle. Une disposition invalide est rejetée avant toute écriture. Les brouillons restent privés. Les protections de session, d’origine et de concurrence Blob restent actives.

La migration `202609220001_independent_showroom_size.sql` prépare les bornes et la suppression de l’ancienne unicité d’emplacement pour Supabase. Elle n’a pas été exécutée sur un service distant. Le site de production utilise Blob ; aucun import ou remplacement de son catalogue n’est nécessaire. Le contrôle public préalable à cette livraison retrouve 26 œuvres, deux salles et aucune dimension réelle renseignée, donc aucun changement de taille dû à la séparation des dimensions.

## Vérifications du 22 septembre 2026 UTC

```sh
npm test
npm run build
node scripts/admin-zones-qa.mjs
node scripts/admin-showroom-size-qa.mjs
```

**305 tests réussis dans 25 suites**, compilation de production et TypeScript réussis. Les deux campagnes navigateur ont réussi à 02:45 UTC sur des copies temporaires des données et médias, supprimées après les essais ; le catalogue principal reste inchangé.

La campagne zones contrôle A2 avec ses deux œuvres historiques puis une troisième : dimensions/positions des œuvres présentes inchangées, déplacement latéral de l’ancien tableau inférieur, annulation/rétablissement, brouillon et reprise, refus d’une zone pleine, réserve conservée, rejet serveur d’un chevauchement, application et isolation de la salle 2. Elle teste également souris, clavier, toucher simulé, Chrome à 1440, 390 et 300 px, et WebKit à 390 px.

La campagne taille contrôle les dimensions descriptives indépendantes, la saisie numérique et décimale, les bornes de la poignée, la persistance et la conservation des métadonnées. Les deux campagnes ouvrent l’œuvre sauvegardée dans le vrai renderer WebGL. Aucune erreur JavaScript ; aucune violation axe dans les deux écrans WebKit instrumentés. Ce contrôle ne constitue pas une certification complète d’accessibilité ni une mesure de fluidité sur un téléphone physique.

Les statuts des posters d’arrivée sont simulés comme prêts dans ces campagnes, pour éviter un second rendu concurrent. Les mécanismes d’arrivée sont couverts séparément par la suite de tests. Les scripts historiques de placement par emplacement ne constituent pas les critères d’acceptation du nouveau modèle.

Rapports locaux : `artifacts/admin-zones/report.json` et `artifacts/admin-showroom-size/report.json`. Captures navigateur inspectées : `three-paintings-a2.png`, `zones-mobile.png`, `shared-zone-webgl.png` dans `artifacts/admin-zones/`. Le contrôle de production intervient après cette validation locale, lors du déploiement GitHub/Vercel explicitement demandé.
