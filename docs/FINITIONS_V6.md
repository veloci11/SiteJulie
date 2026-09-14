# Finitions V6 — vues dégagées, passage réel et figuiers

Cette passe remplace les deux choix V5 refusés : les retours de mur qui cachaient les œuvres en vue oblique, et le changement de pièce masqué par un fondu. L’administration et les données d’accrochage existantes sont conservées.

## Vue sur les œuvres

Les quatre retours perpendiculaires sont retirés. Les détails muraux sont adossés aux parois, dans les intervalles entre baies : inserts de bois lisses du sol au plafond, relief minéral et céramique. Leur profondeur maximale est de 6,5 cm. Ils restent derrière la surface des peintures ; aucun rebord ne doit dépasser cette enveloppe. Le coin lecture, les bancs, les sculptures et le figuier central restent présents.

Le contrôle V5 vérifiait les collisions et les baies libres de face, ce qui ne suffisait pas. `scripts/museum-sightlines-qa.mjs` ajoute 720 poses par boucle et quatre formats, avec neuf rayons par toile visible et les deux ratios extrêmes à chaque emplacement. Le rapport compare l’ancien volume des cloisons au nouveau contrat. Cette mesure concerne les ajouts muraux, pas une garantie de visibilité simultanée de tous les tableaux derrière tout le décor ; les vues navigateur restent nécessaires.

## Déplacement entre pièces

Le voile opaque et le repositionnement caché disparaissent. Une seule trajectoire traverse le portail existant et rejoint directement la promenade de la salle choisie, sans retour vers une position d’accueil ni seconde approche. Le regard anticipe la courbe réelle et vise l’ouverture lors du franchissement ; la vitesse ralentit localement dans les virages. L’orientation prépare la marche pour ne pas reculer ni glisser de côté à vitesse normale. La hauteur reste à 1,75 m ; le roulis et le balancement restent absents. La vitesse et la rotation sont bornées et la préférence de réduction des animations est respectée.

Une sélection d’œuvre interrompt toujours la promenade ; un clic dans le vide ne la relance pas. Les popups éditoriaux utilisent la pièce courante. L’arrivée dans une autre pièce reprend automatiquement la marche.

## Figuiers et finesse du rendu

Les deux silhouettes restent différentes. Les feuilles sont reconstruites en surfaces courbes, avec des contours plus fins et plusieurs morphologies, et des nervures moins géométriques. Les doubles surfaces superposées sont remplacées par un limbe double face. Le revers est légèrement éclairci et désaturé dans le matériau Three, sans géométrie ni passe transparente supplémentaire. L’anisotropie des textures végétales est limitée à 8, selon le GPU, pour conserver les détails dans les vues obliques.

Le tronc et les grosses branches sont fusionnés localement pour supprimer les jonctions de cylindres visibles. Les rameaux, pétioles et limbes restent séparés du remeshing : leurs coordonnées sont conservées. Le grain du tronc est discret, avec de petites irrégularités de surface.

La [fiche botanique de NC State](https://plants.ces.ncsu.edu/plants/ficus-carica/) sert de contrôle morphologique : feuilles à trois ou cinq lobes et écorce gris clair relativement lisse. Elle n’est pas utilisée comme texture. Les modèles et cartes procédurales restent fabriqués localement ; aucune image d’œuvre n’est altérée.

## Vérifications de cette passe

- Compilation production réussie avec les modèles et le manifeste définitifs. 81 tests unitaires validés : le lancement parallèle avec la compilation a dépassé le délai de 5 s du test de compression d’image (80 autres tests passés) ; le fichier média relancé seul passe ses 2 tests en 3,1 s, sans changer son délai ni les images.
- `npx tsx scripts/museum-sightlines-qa.mjs --assert-clear` : 55 808 rayons testés, **zéro interception par les nouveaux ajouts muraux**, contre 6 673 avec les anciens volumes sur ces mêmes vues. Rapport `artifacts/finishing-v6/sightlines.json`. Les contrôles des véritables sommets Draco confirment 10 420 sommets de détails dans leurs boîtes, au moins 9,4 cm derrière les toiles.
- `npx tsx scripts/museum-room-routes-cpu.mjs` : 30 départs/formats, aucune collision, rotation≤39,93°/s, accélération angulaire≤59,41°/s² ; regard à≤41,2° du déplacement à plus de1m/s et≤18,1° de l’axe du portail. Raccord de vitesse à la promenade avec écart inférieur à 0,0012 m/s. La traversée physique peut prendre5,15 à12,91s selon le départ ; depuis l’accueil,8,32s dont la porte atteinte après5,11s. Le demi-tour depuis une œuvre au fond prend nécessairement plus de temps. Il ne s’agit pas d’un changement instantané.
- `npx playwright test tests/e2e/tour.spec.ts --reporter=list` : **7/7** sur le build final, boucle complète, passage réel du portail, reprise automatique sans seconde approche, pause et redimensionnement mobile, mouvement réduit, popups et immobilisation après fermeture.
- `node scripts/museum-detail-views-qa.mjs` : 16 vues réelles de promenade, deux salles en 1440×900 et 390×844. `MUSEUM_VIEWS_OUTPUT=artifacts/finishing-v6/views node scripts/museum-finishing-v4-qa.mjs` : 20 vues supplémentaires, dont 320×568,667×375 et701×600. Commandes accessibles, popups centrés, aucun débordement ni erreur JavaScript. Captures dans `artifacts/finishing-v6/promenades/` et `views/` ; vues obliques, hall, salon et téléphone inspectés.
- `MUSEUM_WEBKIT_OUTPUT=artifacts/finishing-v6/webkit node scripts/museum-webkit-qa.mjs` : formats 390×844 et 1440×900 réussis ; œuvres verticale/horizontale, cartel entier, compteur de collection, retour navigateur et Canvas conservé. `webkit/refined-webkit-report.json`.
- `npx tsx scripts/capture-arrival.ts` : six nouveaux aperçus, deux salles vides publiques et quatre vues d’œuvres privées. Fingerprint `contemporary-sightlines-v6`. Les originaux et `.local/data.json`/`seed.json` restent identiques. `node scripts/museum-arrival-alignment-qa.mjs` passe sur quatre formats : écart absolu moyen1,20 à2,64/255 entre aperçu et image réelle, sans déplacement de caméra au raccord.

## Mesures natives finales

Après arrêt de Blender et des autres tests, Chrome natif, ANGLE Metal Apple M1 Pro,1440×900,densité écran2 et rendu plafonné à1,5 :

- `node scripts/museum-room-transfer-qa.mjs` passe dans les deux sens : aucune téléportation, aucun voile, portail réellement franchi, regard orienté vers l’ouverture, aucune pause au raccord (vitesse minimale0,344m/s), même Canvas. Les deux intervalles de présentation ont une médiane16,7ms et un95epercentile≤16,8ms. Départs testés : œuvre05 puis retour depuis la promenade nouvellement rejointe ; durées observées12,93s et11,08s, avec des chemins de14,09m et7,03m. Un clic dans le vide conserve l’œuvre sélectionnée. `artifacts/finishing-v6/transfers/report.json`.
- `PERF_OUTPUT=artifacts/finishing-v6/performance node scripts/museum-performance-qa.mjs` : trois contextes sans cache, aucune erreur, assets stables. Scène prête en 1,51 s sur l’accueil local et 1,43 s sur l’œuvre08 ; avec réseau limité à 10 Mbit/s et 60 ms, 7,57 s. La première frame après chargement de l’aperçu est observée à environ 18 ms depuis le début de navigation locale, et 428 ms dans le scénario limité. Environ 8,05 Mio transférés pour l’accueil complet. Les définitions exactes des horloges figurent dans le script et le rapport.

Le décor actif pèse **4 697 868 octets / 4,48 Mio**, avec 310 594 triangles et 56 lots, hors œuvres et application. Ces mesures concernent ce Mac : les formats mobiles et WebKit ont été testés, pas un GPU de téléphone physique. Les branches et les feuilles peuvent masquer partiellement une œuvre pendant un passage oblique, comme un objet réel ; aucun nouveau mur ne coupe sa vue. Les œuvres sélectionnées restent cadrées et leur média original est conservé.
