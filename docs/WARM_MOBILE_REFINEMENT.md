# Refonte chaleureuse et mobile

> Rapport du jalon précédent. La terrasse a depuis été retirée, les murs et trajets repris et le chargement allégé : voir [la correction de qualité et de performances](QUALITY_PERFORMANCE_REFINEMENT.md). Les fichiers `warm-*.png` sont régénérés avec l'état courant ; les descriptions et mesures ci-dessous sont historiques.

Références privées : `references/design/warm-daylight.png` et `warm-evening.png`, fournies par Mathis. Elles orientent l'ambiance et les matières ; aucune identité, biographie ou information commerciale n'en est reprise.

## Périmètre

Deux salles réelles reliées, galerie sable et salon terre/noyer. Mobilier, tissage, livres, céramiques, oliviers, extérieur côtier et ciel. La visite reste un vrai espace Three.js, avec les huit images originales chargées indépendamment de l'architecture. L'administration et les URLs des œuvres restent stables.

Interface plein écran, navigation transparente, collection et salles en dialogue. Mobile : commandes au pouce, œuvres entièrement cadrées dans l'espace libre, fiche compacte et swipe horizontal. Le même canvas reste monté lorsque l'on ouvre/ferme les informations. Les effets de réflexion et la résolution s'adaptent aux petits écrans. Respect de la préférence de mouvement réduit.

Le premier rendu V2 a été jugé trop artificiel par Mathis. Une nouvelle passe de matières PBR et de lumière précalculée dans Cycles a été intégrée aux trois modules. Les captures `artifacts/museum/warm-home.png` et `warm-salon.png` montrent cette nouvelle version dans Chrome ; elles documentent le travail réalisé, pas une validation esthétique de l'utilisateur.

## Ciel — source externe

- Asset : **Kloofendal 38d Partly Cloudy (Pure Sky)**, Poly Haven.
- Source : https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky
- Auteurs : Greg Zaal (original), Jarod Guest (édition Pure Sky).
- Licence CC0 : https://polyhaven.com/license
- Fichier téléchargé par HTTPS vérifié : https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_38d_partly_cloudy_puresky_2k.hdr
- Copie locale : `public/museum/sky-clouds.hdr` ; aucune dépendance réseau du musée vers ce site pendant la visite.

## Validation

La compilation de production et ses vérifications TypeScript passent. Les 40 tests unitaires couvrent notamment les destinations, les trajets et les règles de publication. Les contrôles GLB, ancres, collisions et restitution des couleurs sont décrits dans `GI_BAKE_EXPERIMENT.md`.

La vérification de production a révélé que l'import CSS de la visite imbriqué après Tailwind était omis du bundle. Il est maintenant importé explicitement dans le layout. Les tests utilisent de vrais clics : un contrôle couvert par le canvas ne peut pas être considéré comme fonctionnel sur la seule base de sa présence dans le DOM. Les fiches sont également affichées seulement lorsque la scène a terminé sa préparation.

Les neuf tests navigateur publics et mobiles passent sur la version de production (2,5 minutes, Chrome avec rendu logiciel SwiftShader). Ils couvrent les formats 390×844, 320×568 et 667×375, le canvas stable, les huit œuvres, les filtres, le clavier, l'historique, les deux salles, la terrasse, le contact contextuel, le repli sans WebGL et un balayage tactile volontairement lent. La limite de durée du geste a été supprimée : un délai de calcul ou un doigt maintenu ne doit pas annuler un déplacement horizontal volontaire.

Le parcours WebKit passe aussi en 390×844 et 1440×900 avec contrôle des vrais clics, retour dans le salon, ouverture de la collection et changement de salle, sans erreur JavaScript ni débordement horizontal. Les fichiers `scripts/museum-webkit-qa.mjs`, `tests/e2e/public.spec.ts` et `tests/e2e/mobile.spec.ts` reproduisent les interactions. Le rapport WebKit est dans `artifacts/museum/refined-webkit-report.json`, le rapport E2E dans `playwright-report/index.html`.

Captures finales du navigateur : `artifacts/museum/warm-home.png`, `warm-salon.png`, `warm-art.png`, `warm-contact.png`, `warm-mobile.png`, `terrace-desktop.png`, `terrace-mobile.png` et `refined-webkit-390.png`. Les petites images `public/museum/preview-*.webp` sont des aperçus du décor seul pour le sélecteur de salles ; l'interface y est volontairement masquée pendant la capture. Les captures de vérification conservent toute l'interface.

Mesure de déplacement sur ce Mac M1 Pro, Chrome/ANGLE Metal, fenêtre 1440×1000 et écran à facteur 2 : médiane 16,7 ms, percentile 95 de 16,7–16,8 ms, pire image de 66,6 ms sur la séquence de sélections rapides testée. Zéro image supplémentaire en deux secondes au repos devant l'œuvre. Rapport complet : `artifacts/museum/motion-report.json`. Préparer les textures et shaders des deux salles avant la visite a supprimé une pause initiale de 556 ms au premier changement de salle.

Ces mesures concernent le Mac, pas un téléphone physique. Les formats mobiles et WebKit valident le cadrage et les commandes en émulation ; les performances sur iPhone/Android réels restent à mesurer. Le rendu est interactif avec lumière statique précalculée ; les fonds lointains sont panoramiques et les signes gravés utilisent un relief de matériau, pas une découpe de chaque lettre dans la maçonnerie.

## Rendu retenu après correction

Les salles utilisent `hall-baked.glb` et `extension-baked.glb` : lumière diffuse directe et indirecte calculée sous Cycles, cartes PBR, puis débruitage OpenImageDenoise. Le runtime restaure la radiance linéaire à partir des facteurs contenus dans les matériaux. Les détails fins de l'enduit sont ajoutés à l'échelle du mur. Les œuvres restent des textures indépendantes dont les couleurs ne sont pas recolorées par ce traitement.

La côte distante utilise une photographie panoramique CC0 ; la terrasse, ses accès et son mobilier restent de vraies géométries. Les anciennes falaises simplifiées ne sont plus affichées. Les petits mouvements de l'eau sont limités à la vue extérieure et arrêtés lorsque le mouvement réduit est demandé. Le ciel au-dessus des verrières utilise le panorama de ciel seul.

- Côte : [Secluded Beach](https://polyhaven.com/a/secluded_beach), Greg Zaal / Poly Haven, [CC0](https://polyhaven.com/license).
- Source publiée : https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/secluded_beach.jpg
- Dérivés locaux : WebP 6144 pixels pour ordinateur et 4096 pour téléphone ; `assets/museum/secluded-beach-source.jpg` conserve le fichier téléchargé.
- Matériaux : voir `docs/PBR_MATERIALS.md`. Reproduction du bake et limites : `docs/GI_BAKE_EXPERIMENT.md`.

Les sources de comparaison `spiaggia_di_mondello` et le premier rendu V2 restent des fichiers de travail ; ils ne sont pas affichés comme captures du site ni comme résultat accepté.
