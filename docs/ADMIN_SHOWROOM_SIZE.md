# Taille des œuvres dans le showroom

Les grandes bandes marron de l’aperçu provenaient de sa hauteur minimale de 160 px : sur une colonne étroite, elle étirait les cadres malgré le ratio du mur. L’aperçu respecte désormais ses dimensions proportionnelles, et les marges du cadre utilisent la même géométrie que le showroom. Les images conservent leur ratio sans recadrage.

## Réglages

- **Largeur réelle / Hauteur réelle** : dimensions en cm. Leur saisie ou modification définit un nouveau 100 % et remet le tableau à cette taille, dans la place disponible.
- **Taille dans le showroom** : pourcentage relatif aux dimensions réelles, agrandissable au-delà de 100 % si la zone le permet, avec largeur/hauteur liées au ratio de l’image. Sans dimensions réelles, la référence reste le maximum de la zone.
- **Poignée ↘** sur le tableau sélectionné : redimensionnement à la souris ou au toucher. Flèches au clavier, Maj pour un pas plus grand, Début/Fin pour les bornes.
- **Revenir à 100 % · dimensions réelles** : remise à la référence déclarée, ramenée aux limites disponibles. Si le ratio de la photo diffère, elle tient dans les deux dimensions sans déformation ; l’interface explique cet ajustement.

Les changements de taille conservent le centre. L’agrandissement s’arrête à la limite de la place ou avant un cadre voisin. Les champs acceptent une virgule décimale ; les valeurs numériques trop grandes sont ramenées à la limite à la sortie du champ, et une saisie vide ou invalide bloque l’enregistrement. Le serveur revalide les limites. Dans la réorganisation d’une salle, un geste complet correspond à une seule annulation. Le plan vu du dessus reste toujours déplié, sans commande de fermeture.

## Données et compatibilité

Le champ existant `displayScale` porte ce réglage ; les dimensions de la description, images et autres métadonnées restent indépendantes. Les 26 œuvres du catalogue local avaient toutes des dimensions réelles non renseignées lors du contrôle : leur taille de showroom existante est conservée. Un autre catalogue qui utilisait déjà ces dimensions pour dimensionner les tableaux doit vérifier ses accrochages lors de cette évolution. L’empreinte des anciennes captures d’arrivée est invalidée pour ces œuvres.

La migration `supabase/migrations/202609220001_independent_showroom_size.sql` prépare l’alignement des fonctions géométriques SQL. Elle n’a pas été exécutée ni testée sur un service distant. Le mode de réorganisation collective reste réservé aux adapters local et Blob.

La validation actuelle des pourcentages, du cadrage et de D centre est décrite dans [DIMENSIONS_CAMERA.md](DIMENSIONS_CAMERA.md). La réouverture, la sauvegarde et les modifications des autres champs ne remettent pas la taille à zéro.

## Vérification initiale du 22 septembre 2026 UTC

Ces premiers résultats précèdent le passage aux zones partagées. Voir [ADMIN_ZONES.md](ADMIN_ZONES.md) pour le fonctionnement actuel et sa validation.

TypeScript et compilation de production réussis. Les 107 tests de sept suites passent : placement, administration, disposition de salle, navigation, stockage Blob et captures d’arrivée. La navigation couvre notamment la taille minimale de 10 %.

```sh
npx vitest run tests/placement.test.ts tests/admin.test.ts tests/room-layout.test.ts tests/navigation.test.ts tests/blob-data.test.ts tests/arrival.test.ts tests/arrival-generation.test.ts
node scripts/admin-showroom-size-qa.mjs
```

La campagne navigateur a réussi à 02:01:27 UTC sur une copie temporaire du catalogue et des médias. Ses six groupes couvrent la séparation des dimensions, la persistance, les proportions des cadres, le redimensionnement souris/clavier/tactile simulé, les limites d’emplacement et de voisinage, l’annulation d’un geste, l’application collective, les formats de 390 et 300 px, la saisie décimale sous WebKit et le cadrage de l’œuvre enregistrée dans le vrai rendu WebGL. Aucune erreur navigateur ni violation axe sur l’écran WebKit instrumenté. Le catalogue principal est inchangé ; le serveur et la fixture ont été supprimés.

La génération automatique des posters d’arrivée est isolée de cette campagne : le statut est simulé comme prêt pour éviter ses rendus concurrents. Le test WebGL de l’œuvre utilise bien le renderer du site. Les tests des captures d’arrivée sont exécutés séparément. Cette vérification n’est ni un benchmark GPU ni un essai sur téléphone physique.

Rapport : `artifacts/admin-showroom-size/report.json`. Captures du navigateur inspectées :

- `wall-proportions-desktop.png` et `wall-proportions-mobile.png` : cadres corrigés ;
- `independent-size-fields.png` et `resize-mobile.png` : champs et poignée ;
- `resized-work-webgl.png` : résultat dans la galerie.

Modifications locales uniquement, sans déploiement ni modification de données de production.
