# Exposition contemporaine — 13 septembre 2026

Compte rendu historique de la première itération contemporaine. Les finitions, arbres, compositions, trajets et résultats actuels sont documentés dans [Finitions V3](FINITIONS_V3.md) ; les mesures ci-dessous concernent le build précédent.

Cette itération suit la demande de salles contemporaines plus douces, d’une pièce par collection, de figuiers et d’une promenade qui avance sans s’arrêter devant les tableaux.

## Parti pris

Les références consultées sont la géométrie moderne de l’[East Building de la National Gallery of Art](https://www.nga.gov/educational-resources/new-angles-art/i-m-pei-and-geometry-nga) et les [vues d’installation de Leslie Hewitt chez Perrotin](https://www.perrotin.com/en/events/soft-tremulous-light-2025-new-york/viewer). La seconde référence a été examinée dans le navigateur : parois dégagées, lumière indirecte, accrochage sobre. Ces références orientent la composition ; aucune photographie de ces galeries n’est intégrée au site.

Les anciennes moulures, arches rapportées, poutres et caissons sont remplacés par des plafonds fermés, des passages aux angles adoucis et des rails d’exposition. La première salle associe enduit crème, bois clair au plafond et soubassement, assises en lin et livres. La seconde utilise un plafond terre rosée, des assises argile, des céramiques et du noyer dans les alcôves. Le sol en pierre est discret ; les photographies des peintures restent intactes et ne reçoivent aucun filtre chaud.

Deux grands figuiers de 3,64 m occupent les côtés de chaque pièce. Leurs pots, couronnes et assises voisines possèdent des volumes de collision. Les arbres du fond ont été retirés pour dégager l’accrochage. Les cartels utilisent les titres provisoires des œuvres, sur une plaque mate proche du mur.

## Accrochage de démonstration

Les noms ci-dessous sont des regroupements descriptifs de travail, pas des titres de séries attribués à l’artiste. Les titres des tableaux restent provisoires et les identifiants/URL ne changent pas.

| Salle  | Collection        | Œuvres et emplacements                                         |
| ------ | ----------------- | -------------------------------------------------------------- |
| room-1 | Visages           | 03 : fond centre, 06 : gauche, 07 : droite, 08 : entrée droite |
| room-2 | Récits & paysages | 01 : gauche, 02 : droite, 04 : fond gauche, 05 : entrée droite |

Le bandeau montre les quatre œuvres de la salle actuelle. Le catalogue de sélection donne accès aux huit œuvres et filtre par salle. Le nom public d’une salle est dérivé de la collection qu’elle contient. Dans l’administration, l’emplacement automatique rejoint la salle d’une collection existante ; une autre collection exige une salle vide. La validation serveur refuse de mélanger des collections nommées ou de disperser la même collection dans plusieurs salles. Les salles encore sans nom restent compatibles avec les anciennes données. Les dimensions physiques des peintures ne sont pas encore fournies : les tailles restent provisoires et conservent le rapport de chaque photographie.

## Promenade

Un seul CameraDirector possède toujours la caméra. La promenade utilise une courbe fermée parcourue à longueur d’arc constante. Le regard rejoint progressivement les œuvres réellement accrochées pendant que la marche continue. Une interpolation périodique assure la continuité de la direction, de sa vitesse et de son accélération. Elle ne déclenche ni URL d’œuvre, ni fiche, ni arrêt de détail. La hauteur reste à 1,75 m, sans balancement ni inclinaison latérale ; la focale reste constante pendant la promenade.

Le tracé mesure environ 21,66 m, la vitesse stabilisée 0,35 m/s et le cycle 61,88 s. L’accélération de départ dure 2 s après un délai initial de 2 s ; aucun arrêt ne se produit au raccord de la boucle. Le calcul mesure une rotation maximale de 11,54°/s et une accélération angulaire maximale de 2,79°/s² sur ces deux accrochages. Les volumes des yeux et du torse sont vérifiés contre les obstacles. Pause, menu, onglet masqué et préférence de mouvements réduits arrêtent le temps de la promenade. Le choix de pause est conservé dans ce navigateur après rechargement. Une sélection manuelle reprend depuis la pose visible ; sa limite angulaire est réduite à 40°/s. Ces limites réduisent les mouvements brusques, sans garantir le confort de toutes les personnes.

## Arrivée sans écran de chargement

Une balise picture est rendue dans le HTML initial, avec variante portrait et priorité haute. Elle affiche une capture du vrai musée, puis un fondu de 1,2 s révèle le Canvas prêt. Les liens HTML sont accessibles pendant la préparation de la 3D et sans JavaScript. Les liens profonds sont interprétés côté serveur pour éviter un accueil fugace sur une mauvaise salle.

Les captures avec œuvres sont privées sous `.local/arrival`, jamais copiées dans `public`. L’API compare leur empreinte à l’accrochage public courant avant de servir l’image, sans cache partagé. Un retrait, un remplacement de média ou un déplacement rend l’ancienne capture inéligible. Le repli public ne contient que l’architecture, sans œuvres. La variante avec œuvres ne fonctionne que dans l’adapter de démonstration local ; elle ne prétend pas être raccordée au stockage de production.

Reproduction après construction et redémarrage du serveur : `npx tsx scripts/capture-arrival.ts`. Le script crée un serveur local éphémère sur 3002 avec une fixture sans œuvres pour les replis, puis capture les vraies salles sur 3000. Il vérifie que l’accrochage n’a pas changé pendant la capture.

## Assets et vérifications

Le figuier est décrit dans `assets/museum/trees/fig/README.md`, avec sa provenance botanique, ses sources et sa validation. Son modèle est original et ses textures sont partagées par les instances. Les sources et résultats architecturaux sont conservés séparément de l’ancien décor.

Vérifications exécutées sur le build local :

- `npm test` : 53 tests passent, dont calculs des trajets, collisions des grands figuiers, placement par collection et invalidation des images d’arrivée privées.
- `npm run build` : compilation de production et TypeScript valides.
- `npm run test:e2e` : 15 tests passent (Chrome avec rendu logiciel). Ils couvrent la boucle complète sans arrêt, la pause conservée après rechargement, l’arrêt dans les menus, la reprise au même endroit, la sélection manuelle, les préférences de mouvement réduit, l’arrivée sans JavaScript ou avec GLB bloqués, l’historique et la navigation tactile.
- `npx tsx scripts/museum-tour-visual-qa.mjs` : Chrome natif, quatre formats 1440×900, 390×844, 320×568 et 667×375. Caméra à 1,75 m, vitesse à 0,35 m/s aux points observés, aucune erreur JavaScript ni débordement horizontal ; cible de pause de 44 px minimum. Les captures réelles sont sous `artifacts/interior-tour`.
- `node scripts/admin-collection-qa.mjs` : publication par collection sur une fixture jetable, refus sans salle libre, puis publication en salle 3 après activation de celle-ci. Les données principales sont restées inchangées.

La revue visuelle de la première passe chaude a repéré trois défauts : un chant de plafond salon coplanaire au mur du hall causait des bandes noires, le soubassement bois masquait le cartel du portrait central, et les normales inversées des pots les rendaient noirs. Le plafond est rentré dans l’épaisseur du mur, le panneau culmine à 0,72 m et les normales du mobilier sont corrigées. Les atlas de lumière concernés ont été recalculés. Une erreur distincte dans la capture d’arrivée laissait des icônes SVG visibles : les overlays HTML sont maintenant totalement retirés pendant la capture.

Les captures finales sous `artifacts/contemporary/finishing` ont été inspectées en 1440×900 et 390×844 : raccord propre, cartel et cadre entiers, pots correctement éclairés. `node scripts/museum-room-finishing-qa.mjs` passe dans ces deux formats sans erreur JavaScript. Les deux tests d’arrivée ont été rejoués après régénération des posters et passent. La QA WebKit 26.6 finale, dans les mêmes deux formats, passe aussi : œuvres 08/04 complètes, canvas unique, historique et changements de collection corrects (`artifacts/museum/refined-webkit-report.json`).

## Mesures du build final

`PERF_OUTPUT=artifacts/perf-contemporary node scripts/museum-performance-qa.mjs` a été exécuté après les bakes et les autres contrôles navigateur. Chrome natif utilise ANGLE Metal sur Apple M1 Pro, viewport 1440×900 ; le DPR de la scène est plafonné à 1,5. Contextes HTTP neufs et cache désactivé ; le cache de programmes GPU du processus peut persister.

| Scénario                                     | Image d’arrivée chargée / frame suivante | Scène interactive |
| -------------------------------------------- | ---------------------------------------: | ----------------: |
| Accueil local                                |                                    19 ms |            1,52 s |
| Lien direct œuvre 08                         |                                    21 ms |            1,45 s |
| Accueil limité à 10 Mb/s et 60 ms de latence |                                   459 ms |            6,70 s |

L’instant de l’image est instrumenté au chargement puis à la frame suivante, pas une mesure photométrique du premier pixel écran. Le réseau jusqu’au premier rendu représente environ 6,66 Mio ; le scénario complet environ 6,83 Mio. La mémoire estimée des textures observées est 246,84 Mio, ce qui ne constitue pas une lecture de la mémoire du pilote GPU. Aucun échec ni erreur JavaScript, et les empreintes des assets sont restées identiques pendant les trois scénarios.

`node scripts/museum-motion-qa.mjs` a ensuite mesuré quatre parcours réels, dont les changements de salle et trois sélections rapprochées. Médiane et 95e percentile des intervalles : 16,7 ms (environ 60 images/s sur ce Mac), maximum 16,8 ms. Plus grand changement d’orientation observé entre deux images : 0,71°. Les parcours durent respectivement 10,6 s, 9,0 s, 3,3 s et 7,0 s ; la dernière sélection l’emporte. Aucun rendu supplémentaire pendant deux secondes d’immobilité, aucune erreur JavaScript. Rapport : `artifacts/museum/motion-report.json`. La vitesse angulaire calculée par un observateur RAF distinct peut différer légèrement du plafond du directeur à cause du décalage de phase entre observations.

Les calculs de trajet et les essais de formats mobiles ne constituent pas une mesure sur un téléphone réel. Aucun appareil physique n’a été utilisé pour cette intervention.
