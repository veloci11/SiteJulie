# Salles, promenade et accrochage — septembre 2026

Cette passe traite les retours sur les changements de salle en marche arrière, la reprise automatique après une sélection manuelle, le hall trop vide, les raccords noirs au sol, les figuiers et les réglages d’administration.

## Comportements intégrés

- Un changement manuel de salle emprunte le passage, tourne le regard vers la direction de marche et s’arrête juste après le seuil. Il ne relance pas la promenade. Le retour à la salle courante conserve la position au lieu de retourner au point d’accueil.
- Un clic dans le vide ne ferme pas une œuvre. La fiche possède un bouton explicite de retour à la salle.
- L’accueil conserve sa promenade continue. « À propos » et « Contact » ouvrent un vrai dialogue centré, accessible au clavier ; la promenade continue dans la salle courante derrière ce dialogue. Sa fermeture fige la vue. Les mouvements réduits du système restent respectés.
- Les inscriptions éditoriales ne sont plus rendues dans la scène. La préférence « Garder une vue fixe à l’accueil » et le bouton de réduction des miniatures sont retirés. La présentation mobile conserve ses commandes compactes.
- L’atelier permet de sélectionner une salle, un mur puis une zone libre, de régler la position horizontalement/verticalement et la taille de présentation, et de modifier le contenu et la disponibilité. Les enveloppes et les chevauchements sont validés côté serveur. Voir [le guide de placement](ADMIN_PLACEMENT.md).
- Une œuvre vendue reste publiée ; sa présentation 3D est atténuée avec un cartel « VENDUE », et ses miniatures sont désaturées. Le fichier original et les dimensions déclarées restent intacts. La fiche classique conserve la reproduction originale avec le statut écrit.
- Les captures d’arrivée privées sont invalidées après un changement de placement, taille ou disponibilité. Elles ne peuvent donc pas conserver un ancien accrochage après modification du catalogue.

## Direction visuelle

Le hall reçoit un coin lecture asymétrique, avec fauteuil, table, livres et tapis. Le salon conserve son figuier central et son assise. Deux modèles de figuiers distincts remplacent les instances identiques : fourche, densité, taille des feuilles et silhouette diffèrent.

La vue d’arrivée du hall est prise en diagonale depuis `[3.3, 1.75, 8.2]`, pour montrer ce coin lecture dès l’ouverture. Le regard est adapté au portrait. La boucle de promenade et les images d’arrivée utilisent ce même départ. Le cadrage d’une œuvre inclut désormais toute la hauteur de son cartel, même avec une taille d’accrochage réduite et sur écran étroit : le dock ne masque plus la mention VENDUE.

Les petites faces inférieures biseautées recevaient un éclairage noir dans l’atlas. Leur correction géométrique fait descendre la face verticale éclairée jusqu’au sol. Une légère ombre de contact reste souhaitable ; une bande noire indépendante de l’éclairage ne l’est pas. Un second défaut au seuil provenait de deux plans de mortier coplanaires se chevauchant sur 25 cm. Chaque module est maintenant borné à ses 18 m ; les 18 rayons de vérification ne rencontrent qu’un seul plan de mortier.

Les deux salles actives, deux figuiers et textures de détail totalisent 4 189 972 octets (4,00 Mio), 293 090 triangles et 46 lots de décor, hors œuvres et application. Les sources, mesures et commandes de validation des trois modules sont consignées dans [le guide des assets](CONTEMPORARY_ROOM_ASSETS.md).

Les références de composition restent les maquettes fournies, le [point focal de l’atrium de la National Gallery](https://www.nga.gov/stories/articles/calders-mobile-breathes-life-east-building) et les [vues d’exposition de Perrotin](https://www.perrotin.com/en/events/thirteen-forms-2025-paris/viewer). Ce sont des références d’organisation spatiale, pas des médias copiés dans le décor.

## Vérification

Les contrôles ci-dessous portent sur le build et les modèles finaux de cette passe. Les résultats de la [passe V3](FINITIONS_V3.md) restent historiques.

- `npm run build`, TypeScript et 75 tests unitaires réussis. Les tests géométriques incluent les enveloppes d’accrochage, les obstacles, les raccords de la boucle et le dégagement du cartel.
- `node scripts/museum-finishing-v4-qa.mjs` : 20 vues natives Chrome sur 1440×900, 701×600, 390×844, 320×568 et 667×375. Hall, salon et deux popups : pas de débordement, commandes accessibles et aucun contrôle supprimé encore présent. Captures et résultats dans `artifacts/finishing-v4/views/`.
- `node scripts/museum-webkit-qa.mjs` : deux formats 390×844 et 1440×900, œuvres horizontales/verticales, changement de salle, titres longs et conservation du Canvas ; aucune erreur navigateur. Preuves dans `artifacts/finishing-v4/webkit/`.
- `npx tsx scripts/capture-arrival.ts` puis `node scripts/museum-arrival-alignment-qa.mjs` : six images actualisées, raccord vérifié sur quatre formats. Écart absolu moyen image/scène de 1,15 à 2,44 sur 255. Les captures privées restent hors des ressources publiques ; `artifacts/arrival-alignment/`.
- `node scripts/admin-placement-qa.mjs` et `node scripts/admin-sold-webgl-qa.mjs` : placement par glisser, réglages, contenu, persistance, refus de déplacement hors mur et comparaison rendue vendu/disponible. Le cartel est entier et l’œuvre vendue reste publiée. Les médias et le catalogue principal gardent leurs empreintes. Voir `artifacts/admin-placement/` et `artifacts/admin-sold-webgl/`, ainsi que le [compte rendu détaillé](ADMIN_PLACEMENT.md).

- `npx playwright test tests/e2e/tour.spec.ts tests/e2e/mobile.spec.ts` : 11/11 réussis sur le build final, puis `tests/e2e/arrival.spec.ts` : 2/2 réussis. Boucle complète réelle, vitesse de marche stable, rotation de promenade inférieure à 12°/s, pause/resize, changements de salle, clic vide, popups avec marche puis fermeture figée, mouvements réduits et image d’arrivée sans JavaScript. Les tests `public.spec.ts` avaient également passé dans la suite de 16 scénarios de cette passe avant les derniers ajustements de cadrage. Les captures mobiles finales ont été inspectées. Le rendu logiciel SwiftShader de ces tests sert à vérifier les comportements, pas les performances.

`node scripts/museum-motion-qa.mjs` a ensuite réussi sur Chrome natif, ANGLE Metal / Apple M1 Pro, 1440×1000 et densité 2, sans autre test navigateur ni export Blender en parallèle. Les six parcours réels donnent une médiane et un 95e percentile de 16,7 ms par image, un maximum de 16,8 ms et aucune image supplémentaire une fois immobile. La rotation maximale mesurée est de 40,34°/s, avec un écart d’alignement pose/horloge RAF nul. Pour les deux changements de salle, le produit scalaire minimal déplacement/regard vaut 0,864 et 0,866 : la caméra marche vers l’avant. Les durées incluent la rotation préparatoire et le déplacement : 8,0 et 11,1 s sur ces deux parcours ; elles ne sont pas des coupes instantanées. Données par image dans `artifacts/finishing-v4/motion/motion-report.json`.

`PERF_OUTPUT=artifacts/perf-v4 node scripts/museum-performance-qa.mjs` a réussi sur Chrome natif, cache HTTP désactivé et modèles inchangés pendant les mesures. Sur ce Mac, l’image d’accueil est peinte à 18 ms et la scène prête à 1,37 s en local ; avec 10 Mbit/s et 60 ms de latence simulés, l’image apparaît à 436 ms et la 3D à 7,09 s. L’entrée directe sur l’œuvre 08 est prête à 1,35 s. Aucun échec ni erreur JavaScript sur les trois scénarios. Transfert observé : 7,46 à 7,59 Mio, application et œuvres comprises. Les allocations de textures observées représentent environ 224 Mio avec mipmaps : estimation à partir des dimensions, pas une mesure de mémoire GPU du pilote. Le budget peut donc rester sensible sur un ancien téléphone et n’est pas une validation matérielle mobile. Rapport complet : `artifacts/perf-v4/report.json`.

Le serveur final utilise la sortie standalone du build vérifié sur `http://127.0.0.1:3000`. Les données principales n’ont pas changé : empreinte du seed `0789570affe01afa627a4b32c688c68cd1e65313f5e294bdc8f0b49c647cd18d`, aucun `data.json` principal créé par les essais. Les navigateurs de mesure et serveurs de fixtures ont été fermés.

Les essais administratifs utilisent des copies jetables du catalogue et des médias. Les formats mobiles sont testés sur Mac, pas sur un téléphone physique. Aucune migration Supabase distante, publication externe ou émission d’email réel n’est incluse dans cette passe. Les dimensions physiques restent à fournir pour l’accrochage définitif.
