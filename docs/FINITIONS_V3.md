# Finitions, composition et circulation — 13 septembre 2026

Demande du 13 septembre : conserver les salles appréciées, mais réduire les pots, agrandir/détailler les figuiers, composer un point central, varier les sculptures et le mobilier, lisser la paroi terminale et les jonctions, reprendre les inscriptions, raccourcir les trajets et supprimer le raccord visible à l’arrivée. Retirer les contrôles play/pause et le texte de promenade du premier écran.

## Direction et changements intégrés

- Deux figuiers : un latéral dans le hall, un central décalé dans le salon. Modèle partagé mature de 4,35 m, 206 feuilles et branches plus fines ; pots d’environ 75 cm. La réduction du nombre d’instances permet davantage de détail par arbre sans augmenter la géométrie totale de la végétation.
- Hall : assise latérale, sculpture évidée et galets équilibrés. Salon : composition centrale avec assise orientée différemment, sculpture élancée et petit anneau terre cuite. Les modèles décoratifs sont originaux et n’affirment aucune attribution d’artiste.
- Une variante architecturale terminale possède un mur plein intégré. Les modules intermédiaires conservent un passage réel ; le salon final ne superpose plus un bouchon au cadre d’une porte.
- Les inscriptions éditoriales sont abaissées, avec des proportions typographiques conservées, filtrage anisotrope et un relief millimétrique. Les noms de salle flottants en hauteur sont retirés ; ils restent dans l’interface.
- Le CTA d’accueil ouvre le choix des œuvres. Le dock indique le nom de la prochaine salle et rend les boutons plus explicites. Play/pause et légende ne sont plus superposés à la visite ; une préférence de vue fixe reste disponible dans les menus et les mouvements réduits du système sont respectés.
- Le départ recule à `[0, 1.75, 7.2]` dans chaque salle et regarde presque dans l’axe (6°). Le figuier central est entièrement visible dans les captures ordinateur et téléphone. Le fond diffus du titre protège sa lisibilité lorsqu’une peinture passe derrière.
- Le début de la promenade attend la fin de la révélation de 1,2 s. Les images d’arrivée ont été régénérées avec exactement la même pose et la même projection que le runtime ; la variante portrait suit aussi le recadrage `object-fit: cover`. La version du décor participe à l’invalidation des captures privées.
- Les trajets manuels utilisent les passages visibles autour des obstacles réels, au lieu d’imposer un passage par les mêmes points. L’œil reste à 1,75 m ; les virages ralentissent localement et les pivots inutiles avant/après une œuvre sont retirés. Le dernier clic reste prioritaire.

La composition s’appuie sur les références fournies et les galeries déjà évoquées. La [présentation du mobile central de l’East Building par la National Gallery](https://www.nga.gov/stories/articles/calders-mobile-breathes-life-east-building) illustre le rôle d’un point focal dans un espace de visite ; les [vues d’installation Perrotin](https://www.perrotin.com/en/events/window-and-scales-2021-seoul/viewer) sont une référence de sobriété d’exposition. Aucun de leurs médias ni aucune de leurs œuvres ne sont intégrés au musée.

## Circulation et charge du décor

Sur 112 parcours calculés entre les huit œuvres en deux formats, la durée médiane est de 6,09 s, le 95e percentile de 8,98 s et le maximum de 9,37 s. Le trajet 03 → 08 passe de 13,53 s à 6,01 s. Ce sont les durées du plan de caméra, indépendantes des éventuels ralentissements du navigateur : `artifacts/interior-tour/manual-comparison.json`.

Le calcul échantillonné mesure un maximum de 39,92°/s pour la rotation manuelle et de 3,10 m/s² pour l’accélération de translation. L’interpolation adoucit l’entrée et la sortie des mouvements. La promenade seule reste à 0,35 m/s, avec une boucle de 30,61 m / 87,44 s et un regard mesuré à moins de 11,69°/s. Pas de roulis, balancement ni changement de focale pendant la marche. Ces limites visent à réduire les mouvements brusques, sans garantir un confort universel.

Hall, salon terminal, textures de détail et figuier partagé représentent 3 469 794 octets, légèrement moins que la version précédente, hors application et peintures. Les deux arbres totalisent 125 448 triangles contre 154 544 pour les quatre anciennes instances. Les modèles sont originaux ; les photographies des œuvres restent séparées. Voir [les sources et validations Blender](CONTEMPORARY_ROOM_ASSETS.md).

## Vérification du build

- `npm test` : 61 tests passent, dont 36 tests de navigation/cadrage/collisions et de cadence de caméra.
- `npm run build` : compilation de production et TypeScript valides.
- `npx tsx scripts/capture-arrival.ts` : six images régénérées, avec œuvres en stockage privé et replis publics sans peintures. Les originaux et l’accrochage n’ont pas changé.
- `node scripts/museum-arrival-alignment-qa.mjs` : pose/cadrage alignés en 1440×900, 390×844, 667×375 et 650×550. L’erreur moyenne absolue par canal est comprise entre 1,03 et 2,04 sur 255 ; les écarts restants incluent la compression WebP et l’interpolation du redimensionnement. Rapport et paires de captures dans `artifacts/arrival-alignment`.

- `npm run test:e2e` : 15 tests passent en 4,3 min, dans Chrome avec WebGL logiciel. La boucle est observée jusqu’au raccord réel ; menu, reprise, sélection rapide, pause persistante, mouvement réduit, tactile, historique et repli sans WebGL sont vérifiés.
- Après la dernière correction d’horloge, `npx playwright test tests/e2e/tour.spec.ts tests/e2e/arrival.spec.ts` repasse les six cas concernés (2,8 min) : boucle complète, pause/reprise, préférence persistante, mouvement réduit et arrivée avec/sans JavaScript. Les poses et le décor n’ont pas changé ; les captures d’arrivée restent valides.
- `node scripts/museum-webkit-qa.mjs` : deux formats (390×844 et 1440×900), œuvres verticales/horizontales, retours navigateur, changements de salle, titre long et miniatures réductibles ; aucune erreur JavaScript ni débordement.
- `node scripts/museum-finishing-v3-qa.mjs` : 12 vues réelles (hall, salon, atelier et contact, en 1440×900 / 701×600 / 390×844), commandes accessibles sans chevauchement, aucun texte ou bouton play/pause superposé à la visite. Captures inspectées dans `artifacts/finishing-v3`.
- `npx tsx scripts/museum-decor-views-qa.mjs` : huit captures prises pendant la vraie promenade dans les deux salles. Le pot du hall, les sculptures différentes, les contacts au sol et le mur terminal sans cadre ont été inspectés ; `artifacts/contemporary/decor-views`.

## Mesures natives

`PERF_OUTPUT=artifacts/perf-v3 node scripts/museum-performance-qa.mjs` a été exécuté après les bakes et les autres contrôles navigateur. Chrome natif utilise ANGLE Metal sur Apple M1 Pro, viewport 1440×900, DPR de scène plafonné à 1,5. Chaque scénario dispose d’un contexte neuf avec cache HTTP désactivé ; le cache de programmes GPU peut persister dans le processus.

| Scénario                          | Image chargée / frame suivante | Scène prête |
| --------------------------------- | -----------------------------: | ----------: |
| Accueil local                     |                          22 ms |      1,43 s |
| Lien direct œuvre 08              |                          19 ms |      1,39 s |
| Accueil limité à 10 Mb/s et 60 ms |                         434 ms |      6,54 s |

La mesure de l’image instrumente son chargement et la frame suivante, pas le premier pixel photographié à l’écran. Environ 6,57 Mio sont reçus avant que l’accueil soit prêt. Les scénarios complets incluent ensuite l’ouverture du catalogue pour activer la vue fixe et éventuellement une sélection, soit des requêtes d’images supplémentaires avec le cache désactivé ; leur volume total ne se compare pas directement à l’ancien bouton de pause. Aucun échec ni erreur JavaScript ; empreintes des assets identiques avant/après.

Le directeur utilise désormais l’horodatage RAF de présentation transmis par Fiber, plutôt qu’une lecture de `performance.now()` au milieu du callback. Un retard d’exécution JavaScript ne fait donc plus avancer la pose trop loin avant de compenser à la frame suivante. La preuve du défaut initial est conservée dans `artifacts/museum/motion-clock-audit.json`.

La vérification native finale `node scripts/museum-motion-qa.mjs` passe sur quatre parcours, dont des changements de salle et trois sélections rapprochées : médiane et 95e percentile à 16,7 ms, maximum 16,8 ms (environ 60 images/s sur ce Mac). Durées observées : 3,98 / 6,51 / 3,37 / 8,03 s. Le plus grand changement d’orientation est de 0,659° par frame et le pic observé de 39,69°/s, contre 52,56°/s avant correction de l’horloge. Chaque horodatage de pose correspond exactement au RAF courant ou précédent de l’observateur ; aucune dérive mesurée. Aucun rendu supplémentaire pendant deux secondes d’immobilité, aucune erreur JavaScript. Rapport complet : `artifacts/museum/motion-report.json`.

Les anciennes mesures de [l’itération contemporaine précédente](CONTEMPORARY_EXHIBITION.md) restent historiques. Aucun téléphone physique n’a été utilisé : les formats mobiles et WebKit ont été vérifiés sur cet ordinateur. Les dimensions physiques des tableaux restent à fournir ; les proportions des photographies sont préservées et leur échelle est explicitement indicative.
