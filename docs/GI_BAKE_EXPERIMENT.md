# Éclairage statique Cycles — expérimentation locale

Les fichiers `hall-baked.glb`, `extension-baked.glb` et `outside-baked.glb` sont des variantes du décor existant. Les GLB originaux, ancres, dimensions du mobilier, ouvertures et proxies de navigation sont préservés. Pour la terrasse, les deux objets de matières `Coastal limestone` et `Distant warm island` sont exclus conformément au remplacement du paysage par un panorama photographique dans le runtime ; tous les autres triangles sont conservés et comptés contre l'original. Aucun tableau, cadre d'œuvre, prix ou texte éditorial n'est incorporé aux atlas.

Le calcul utilise Cycles 64 échantillons sur Apple M1 Pro Metal, 6 rebonds diffus, soleil chaud oblique, ciel et apports doux dans les alcôves. La passe DIFFUSE inclut couleur, direct et indirect. Les atlas de coque/sol mesurent 4096², ceux du mobilier 2048². Les cartes de matière CC0 décrites dans [PBR_MATERIALS.md](PBR_MATERIALS.md) sont utilisées avant calcul ; le plâtre est adouci et le noyer teinté. Les surfaces restent de vraies géométries.

Le débruitage explicite utilise la bibliothèque OpenImageDenoise incluse avec Blender, filtre RT HDR CPU sans guides auxiliaires. La documentation de son [API officielle](https://www.openimagedenoise.org/documentation.html) a servi à l'appel via ctypes. Les EXR linéaires originaux restent privés sous `assets/museum/bake-experiments`. Les PNG sont écrits par conversion explicite de la radiance linéaire normalisée vers sRGB, puis le GLB embarque des WebP qualité94. Draco compresse la géométrie avec positions20bits et UV16bits. Les positions16bits ont provoqué de petits rectangles noirs aux raccords de surfaces proches ; la comparaison Chrome à20bits confirme leur disparition.

## Contrat du matériau Three.js

Pour chaque matériau dont le nom commence par `BAKED ` : `MeshBasicMaterial`, map en `SRGBColorSpace`, couleur blanche multipliée par `material.userData.bakeRadianceScale`, `toneMapped=true`, `vertexColors=false`. Le facteur restitue la radiance linéaire supérieure à1 après décodage de l'atlas. Il ne faut pas appliquer à nouveau les lumières ou l'ancienne AO vertex sur ces surfaces. Feuillage, verre et diffuseurs lumineux restent PBR séparés.

Le facteur est propre à chaque atlas, enregistré aussi dans `public/museum/bakes/*-report.json`. La normalisation réserve le percentile99.98 pour éviter qu'un pixel de radiance extrême ne réduise la précision de toute l'image ; les valeurs extrêmes restantes sont écrêtées. Une évaluation visuelle reste nécessaire près des bords d'îlots et des détails fins, que le débruitage peut adoucir.

## Reproduction et contrôles

Depuis la racine du dépôt, remplacer `hall` par `extension` pour la seconde salle ou `outside` pour la terrasse :

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/bake_lighting.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/denoise_bake.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/render_baked_preview.py -- hall
node scripts/blender/check_bake_color.mjs hall
node scripts/blender/validate_bake.mjs hall
```

Le contrôle couleur décode les PNG avec Sharp puis sRGB vers linéaire et compare six pixels aux valeurs EXR normalisées après débruitage. Le contrôle GLB décode Draco et les images réellement embarquées, vérifie les ancres, l'absence d'ancienne AO, les volumes de portail et les trajets d'approche des œuvres. Les vues `*-gi-cycles.png` sont les rendus source ; `*-baked-roundtrip.png` reconstituent la radiance par un shader emission sans seconde passe d'éclairage. Elles ne remplacent pas le contrôle du vrai navigateur.

L'extérieur animé et le ciel visible relèvent du runtime. Les lampes et les œuvres administrables restent dynamiques et indépendantes de cette expérimentation.

## Résultats locaux vérifiés

| Module | GLB | Triangles | Batches | Facteur coque / mobilier |
|---|---:|---:|---:|---:|
| Hall | 3 176 016 octets | 157 784 | 6 | 3.0 / 1.0 |
| Salon | 3 506 344 octets | 173 688 | 7 | 2.25 / 1.0 |
| Terrasse | 3 078 072 octets | 115 076 | 5 | 1.0 / 1.25 |

Le hall calcule sa vue source et ses deux atlas en74s environ, le salon en63s, puis chaque module est débruité et réexporté en10s. La capture du vrai Chrome `artifacts/museum/gi-hall-browser-precision20.png` montre le hall raccordé au site et son interface, sans erreur JavaScript dans ce parcours. Les lignes fines de joints restent visibles ; les gros pixels noirs et le grain de Monte-Carlo de la première variante ont été corrigés.

La terrasse utilise exclusivement le soleil et le ciel : aucune area light de plafond ni éclairage intérieur fictif. Ses atlas sont calculés en85s puis débruités/exportés en10s ; le fichier est37% plus léger que l'extérieur original. Le rendu `artifacts/museum/outside-baked-roundtrip.png` montre la pierre crème, le noyer et les ombres de contact reconstituées ; le fond gris de ce contrôle Blender est remplacé par le panorama et la mer du runtime.
