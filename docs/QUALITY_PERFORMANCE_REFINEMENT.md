# Qualité des salles, cadrage et fluidité

> Livraison précédente conservée comme référence de mesures. La version actuelle, avec plafond fermé, matières séparées et tour d’accueil, est décrite dans `INTERIOR_VISIT_REFINEMENT.md`.

Correction locale du 12 septembre 2026, après les retours sur les murs pixelisés, les tableaux dans les cloisons, les saccades et le chargement. Ce rapport remplace les indications de rendu et de terrasse du précédent `WARM_MOBILE_REFINEMENT.md`.

## Rendu et ressources

Les deux salles restent connectées. La sortie terminale est fermée par une vraie paroi en plâtre (`end-cap.glb`). La navigation et le chargement n'incluent plus la terrasse ni son panorama côtier.

Les murs utilisent une lumière diffuse directe et indirecte précalculée, séparée de la couleur de l'enduit et d'un grain très fin à l'échelle du mur. Les anciens gros motifs d'enduit agrandis ont été retirés. Les détails de géométrie et les atlas de lumière sont décrits dans `CLEAN_ROOM_ASSETS.md`.

Les nervures presque confondues avec la voûte ont été détachées de 5,5 cm, et les faces internes superflues entre segments d'arche retirées. Les joints du sol ont été ramenés de 16,5 à 2,5 mm de profondeur. Les biseaux plus petits qu'un pixel de l'atlas récupèrent maintenant l'éclairage de leur dalle voisine : les pointillés noirs diminuent sans filtrer les peintures ni modifier les ombres du sol. Le salon utilise un enduit plus clair, de couleur linéaire `[.67,.54,.42]`.

Le ciel des verrières reste un WebP local de 164 Ko. Les cadres, appliques et autres matériaux métalliques retrouvent une réflexion douce grâce à un éclairage Three.js RoomEnvironment précalculé en CubeUV : 32 pixels par face, fichier HDR RLE de 60 378 octets, texture de 336 × 128 en demi-précision. `scripts/build-brass-probe.mjs` génère ce fichier et vérifie son décodage avec HDRLoader. Le navigateur charge directement le résultat filtré : aucune capture de scène ou convolution PMREM à exécuter pendant la visite.

Les peintures restent indépendantes de l'architecture et ne subissent pas le tonemapping du décor. Leurs proportions sont conservées. La variante de détail est chargée seulement si elle fournit réellement plus de pixels que la texture déjà disponible pour le cadrage courant.

## Cadres et caméra

Les ancres exportées sont conservées. Un décalage de 3,5 cm le long de la normale place le dos des cadres devant la surface du mur. Le calcul de taille réserve aussi les 17 cm de débordement du cadre. Les emplacements proches des piliers limitent désormais l'ensemble à 1,56 m de large : l'œuvre 04 tient dans sa travée au lieu de déborder dans le jambage.

La caméra cadre la surface réelle de la peinture et tient compte de l'interface sur téléphone, en portrait et en paysage. Le recul reste à l'intérieur de la salle ; le champ de vision s'ajuste quand un ratio extrême l'exige.

Les trajets utilisent des courbes à vitesse continue lorsque le passage le permet. Ils conservent la position et la vitesse courantes lors d'une nouvelle sélection. Leur horloge commence à la première image effectivement rendue. La résolution reste stable pendant le déplacement et à l'arrivée ; elle n'est recalculée qu'au redimensionnement. Les limites sont de 1,5 pour le DPR, 3,2 millions de pixels sur ordinateur et 1,4 million sur petit écran. Le rendu s'arrête au repos.

## Vérifications et mesures

La compilation de production et les types passent. Les 40 tests unitaires couvrent les règles de données, la géométrie des placements, les limites du cadrage et les trajets, dont les 64 combinaisons entre les huit peintures.

Les neuf parcours navigateur couvrent le catalogue, les dialogues, les sélections rapides, le contact contextuel, les liens directs, le clavier, l'historique, les deux salles, la sortie fermée, le repli sans WebGL et le glissement tactile. Les formats mobiles sont 390 × 844, 320 × 568 et 667 × 375. Le script WebKit contrôle aussi les véritables cibles de clic et l'absence de débordement en 390 × 844 et 1440 × 900.

Les mesures finales et captures sont consignées dans `artifacts/perf-final`, `artifacts/museum/motion-report.json` et `artifacts/museum/warm-*.png`. Les aperçus de salles sont des captures du décor destinées au sélecteur ; les captures de vérification gardent l'interface.

| Mesure, même protocole | Avant | Livraison finale |
|---|---:|---:|
| Accueil prêt, réseau local | 3,20 s | 1,37 s |
| Œuvre 08 en lien direct | 2,87 s | 1,35 s |
| Accueil prêt, 10 Mbit/s et 60 ms simulés | 19,27 s | 7,66 s |
| Transfert total du scénario accueil seul | 20,43 Mio | 8,25 Mio |
| Allocations de textures estimées à l'accueil | 593 Mio | 243 Mio |
| Plus grand intervalle entre images pendant accueil → œuvre 08 | 118 ms | 20,3 ms |

Le dernier trajet instrumenté présente une médiane de 16,7 ms, un percentile 95 de 17,5 ms et aucune pause supérieure à 50 ms. L'itinéraire est plus doux et dure 7,36 s, au lieu de 4,64 s auparavant : la réduction des saccades ne vient pas d'une accélération de la visite. Les mesures `ready.at` et les transferts CDP du scénario sans trajet servent à cette comparaison. Les empreintes des cinq ressources principales sont identiques avant et après la mesure finale.

Le contrôle de mouvement séparé teste accueil → 01, 01 → 03 et trois changements rapides 02 → 05 → 08. Sur ce Mac, les intervalles restent entre 16,7 et 16,8 ms dans les séquences observées, sans erreur JavaScript. Aucun nouveau rendu en deux secondes au repos. Le cadrage de l'œuvre 04 dans sa travée étroite est aussi conservé dans `artifacts/museum/final-narrow-bay-04.png`.

Les benchmarks utilisent Chrome 152 natif, ANGLE Metal / Apple M1 Pro, macOS, viewport 1440 × 900 et écran DPR 2. Le DPR effectif du rendu est plafonné à 1,5 après correction. Chaque scénario part d'un nouveau contexte, cache HTTP désactivé ; le processus Chrome et son cache GPU peuvent être réutilisés. Les allocations de textures sont estimées d'après leurs dimensions et leur format, ce n'est pas une mesure de mémoire du pilote. Les performances d'un téléphone physique ne sont pas vérifiées par cette émulation.

Reproduction, après `npm run build` et `npm start` :

```sh
npm test
npm run test:e2e
node scripts/museum-webkit-qa.mjs
node scripts/museum-motion-qa.mjs
PERF_OUTPUT=artifacts/perf-final node scripts/museum-performance-qa.mjs
node scripts/warm-preview.mjs
```

Exécuter les mesures de performances sans autres tests navigateur ni rendu Blender simultanés. Le benchmark conserve les empreintes des fichiers utilisés pour vérifier qu'ils n'ont pas changé pendant la mesure.

## Bibliothèques examinées

Les outils de Three.js présents dans le projet suffisent ici : [RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html) et [PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html) pour les réflexions, et le budget de pixels présenté dans le [guide responsive](https://threejs.org/manual/en/responsive.html). L'architecture est regroupée en quelques meshes afin de limiter les appels de dessin, conformément au [guide d'optimisation des objets](https://threejs.org/manual/en/optimize-lots-of-objects.html). Ces sources documentent les capacités ; les réglages retenus sont spécifiques à cette galerie.

Une expérimentation avec l'outil officiel Khronos KTX-Software 4.4.2 a testé un atlas en KTX2/UASTC avec mipmaps. Le réglage essayé réduisait le stockage GPU théorique mais faisait passer le fichier d'environ 0,99 à 7,61 Mio. Il n'a pas été retenu pour cette correction du chargement. Voir `artifacts/ktx-exploration/REPORT.md` et la documentation officielle [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html). Ce résultat concerne un réglage testé, pas tous les usages de KTX2.

Le rendu reste une scène 3D interactive avec lumière architecturale statique. Les captures montrent l'application exécutée ; elles ne valent pas validation esthétique par l'utilisateur ni égalité avec la maquette de référence.
