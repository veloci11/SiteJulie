# Refonte de la visite — 12 septembre 2026

La version actuelle remplace la première salle : navigation supérieure transparente superposée à la scène, matériaux et architecture détaillés, six oliviers, verrière vitrée et branches extérieures, éclairage des tableaux, ombres obliques et reflets discrets du sol.

## Caméra et netteté

- Trajets chronométrés en temps réel, reprise de la position et des vitesses courantes lors des clics rapides, courbes arrondies validées contre les obstacles.
- Recadrage progressif lors d’un changement de taille ; ouvrir ou fermer la fiche mobile conserve la taille du Canvas. Les quatre coins de chaque format restent dans le rectangle disponible.
- CameraControls reste l’unique propriétaire de la position et de l’orientation.
- Ombres recalculées lorsque les placements changent. Le texte mural est un mesh : suppression du raycasting coûteux contre tout le décor à chaque image.
- Résolution de rendu jusqu’à 2 pixels par pixel CSS à l’arrêt, jusqu’à 1,35 pendant les déplacements. Le rendu s’arrête au repos.
- Variantes salle 1536 px / qualité 94, détail 2560 px / sans perte, sans agrandissement. Les sources actuelles sont plus petites : leurs dimensions natives sont préservées. Détail décodé et transféré au GPU après le trajet. Pas de teinte du décor appliquée aux peintures.
- Les 8 images détail ont été comparées pixel par pixel aux originaux normalisés : identiques. Les 9 fichiers originaux, le seed et les données administrées sont inchangés. Détails cumulés 11,39 Mio ; salle 3,22 Mio.

## Salle fabriquée dans Blender

Colonnes cannelées, bases et chapiteaux profilés, archivoltes doubles, corniches/denticules, joints fins, travertin en appareil décalé, bancs avec coutures et structure en bois, pieds tournés, six oliviers à feuilles courbes, ferrures et vitrage. L’occlusion ambiante est calculée par rayons dans la géométrie et exportée en couleurs de sommets ; aucune peinture n’est précalculée dans le décor. Soleil, lampes et reflets sont calculés dans Three.js. Les rebonds lumineux restent une approximation temps réel, différente d’un rendu photographique hors ligne.

Hall : 6 678 836 octets, 315 332 triangles, 25 lots de géométrie. Extension : 6 637 868 octets, 306 992 triangles. Chaque module comporte 15 textures. Draco et son décodeur sont locaux, sans CDN. Les sources Blender et exports non compressés restent dans `assets/museum`, hors publication.

`node scripts/blender/validate_export.mjs` décompresse réellement Draco et vérifie ancres, portes avec volume de caméra 60 cm, axe central, 72 segments d’approche et les 6 proxies de végétation. Résultats dans `artifacts/museum/export-validation.json`.

## Vérification de la production locale

- `npm run build` : compilation et TypeScript réussis, sortie standalone.
- `npm test` : 26 tests réussis, 4 fichiers.
- `npm run test:e2e` : 4 parcours réussis sur la sortie de production, Chrome/SwiftShader. Clique sur mesh, derniers clics rapides, historique, lieux éditoriaux, lien classique, mobile, mouvement réduit, transparence du header, Canvas stable et repli WebGL.
- `node scripts/museum-motion-qa.mjs` : Chrome natif, ANGLE Metal Apple M1 Pro, 1440 × 1000, écran facteur 2. Trois séquences enregistrées : 350 images / 3,40 s ; 379 / 3,408 s ; 423 / 3,871 s (dernière séquence : 02 → 05 → 08). Médiane 8,3 ms ; 95e percentile 16,5 / 9,2 / 10 ms. Zéro erreur JavaScript, zéro image supplémentaire pendant 2 s au repos. Mesures propres à ce Mac, pas un résultat sur téléphone physique.

- `node scripts/museum-webkit-qa.mjs` : WebKit 26.6, vues 390 × 844 et 1440 × 900, détail HD chargé, zéro erreur JavaScript ni débordement horizontal. Captures et rapport `artifacts/museum/refined-webkit-*`.

## Preuves visuelles

- `docs/captures/home-desktop.png`, `artwork-horizontal.png`, `artwork-mobile.png`, `about-3d.png`, `contact-3d.png` : captures E2E de cette production.
- `artifacts/museum/refined-home-desktop.png`, `refined-artwork-01.png`, `refined-artwork-03.png`, `refined-artwork-08.png`, `refined-artwork-mobile.png` : Chrome natif facteur 2.
- `artifacts/museum/motion-report.json` : séquences de poses et intervalles des images.

Le serveur reste local sur http://127.0.0.1:3000. Les limitations de configuration métier/Supabase de la première livraison restent valables ; cette passe ne publie ni le site ni un email.
