# Murs lisses et fermeture terminale

Cette variante répond à la demande de murs moins pixelisés et de suppression de la sortie extérieure. Elle conserve les deux modules connectés et toutes leurs ancres. Le raffinement des joints retire uniquement des faces internes superposées des arches, rend les nervures de voûte légèrement saillantes et réduit la profondeur du mortier. Les fichiers précédents `*-baked.glb` et leurs sources restent disponibles ; la première variante clean est conservée dans `assets/museum/clean-before-joint-refine`. Aucun serveur n'est modifié par les scripts.

| Asset | Poids | Triangles | Batches |
|---|---:|---:|---:|
| `hall-clean.glb` | 2 316 844 octets | 157 520 | 7 |
| `extension-clean.glb` | 2 471 896 octets | 173 336 | 8 |
| `end-cap.glb` | 5 668 octets | 12 | 1 |

Par rapport aux variantes baked, les modules pèsent respectivement27% et30% de moins. Chaque salle utilise trois atlas2048² au lieu de4096²+2048², soit40% de texels en moins. Le cap a un petit atlas512². Les GLB utilisent WebP qualité88 et Draco positions20bits, UV16bits.

## Murs : contrat Three.js

Le matériau `LIGHTMAP ...` contient uniquement la lumière diffuse directe et indirecte, calculée dans Cycles64samples puis débruitée avec OpenImageDenoise. Les variations de couleur et les normales de texture de l'ancien enduit ne sont pas incorporées. Les ombres architecturales et les rebonds restent précalculés ; un grain fin répétable peut être ajouté au runtime.

- `baseColorTexture.texCoord=1` dans le glTF : `material.map.channel=1` après chargement dans Three.
- `TEXCOORD_0` / `geometry.attributes.uv` : coordonnées métriques de surface.
- `TEXCOORD_1` / `geometry.attributes.uv1` : atlas de lumière.
- `userData.lightmapRadianceScale` : facteur de reconstruction HDR.
- `userData.plasterColorLinear` : couleur d'enduit linéaire à multiplier après décodage sRGB.

Le contrat est `MeshBasicMaterial({ map: source.map, color: Color.fromArray(plasterColorLinear).multiplyScalar(lightmapRadianceScale), toneMapped: true })`, sans normal map ni ancienne AO vertex. Le sampler doit garder son canal1. Couleurs et facteurs : hall `[.68,.57,.44]×6`, salon `[.67,.54,.42]×5.75`, cap `[.67,.54,.42]×14.75`. Le salon a été éclairci et désaturé après comparaison avec la maquette crème.

Le mobilier conserve ses coordonnées et son atlas précédents. Le sol a été recalculé après la correction physique des joints, dans un atlas2048 débruité, avec un relief de texture plus discret. Ces matériaux restent nommés `BAKED ...` et gardent `bakeRadianceScale` : sol hall1.75, sol salon1, mobilier1. La compression peut légèrement adoucir les plus petits détails.

## Diagnostic et correction des traits noirs

Le script `diagnose_dark_joints.mjs` charge les vrais GLB, projette des rayons correspondant aux pixels de la capture1440×1000 et lit les texels des WebP décodés. Le diagnostic avant correction est conservé dans `artifacts/museum/dark-joint-diagnosis-before.json`.

- Au pixel(866,133), deux surfaces de voûte étaient séparées de0.047mm ; la nervure était presque confondue avec la coque. Les quatre nervures ont été descendues de55mm, gardant le même profil et produisant un relief visible continu.
- Les segments des arches contenaient des faces internes exactement superposées, de normales opposées.132faces ont été supprimées dans le hall et176 dans le salon, sans modifier la silhouette des ouvertures.
- Les dalles avaient des joints4mm larges mais16.5mm profonds. La fondation de mortier remonte de14mm, laissant2.5mm sous le dessus des dalles. Les biseaux et les dalles restent présents ; le recalcul adoucit leurs ombres.

Le rendu source présentait des joints plus fins mais le navigateur à DPR1 gardait des pointillés. Une seconde vérification des vrais texels a identifié des biseaux plus petits qu'un texel d'atlas, avec des valeurs exactement nulles. Le correctif final `soften_joint_uv.py` ne change que leurs UV : chaque biseau échantillonne maintenant la lumière de la face supérieure de sa propre dalle, à3.5cm du bord. Le haut des dalles, la géométrie, les textures et leurs ombres ne changent pas.

Ce traitement CPU prend environ1.9s par module, pour225dalles du hall et396 du salon. Les SHA256 des trois images embarquées de chaque GLB sont identiques avant et après, preuve qu'aucune lumière ou texture n'a été éclaircie globalement. Sur la ligne de pixels y620 du sol lointain du hall, le minimum de radiance rouge passe de0 à0.481 ; le mur est numériquement inchangé. Dans le vrai navigateur, les captures finales `warm-home.png` et `warm-salon.png` confirment une nette diminution des pointillés, la continuité des dalles et la conservation des ombres. Les joints physiques et certains contacts architecturaux restent visibles.

## Fermeture terminale

`end-cap.glb` est un solide séparé, à placer avec le seul offset Z du dernier module. Pour les deux salles actuelles, cet offset est18m. Ses coordonnées locales sont x±1.74, y0..6.8, z9.01..9.38 ; sa face intérieure se trouve donc à z27.01 dans le musée. Il ferme la bouche, sa partie haute et les vues obliques derrière l'arche. Le passage interne entre les salles à z9 est préservé.

Le cap n'est inclus dans aucun GLB de salle. Pour la navigation, le proxy correspondant peut reprendre ces limites ; il doit être ajouté uniquement au dernier module. Le calcul des murs du salon tient compte de cette fermeture terminale comme occluder.

## Reproduction et validation

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_clean_rooms.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_clean_rooms.py -- extension
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/render_clean_preview.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/render_clean_preview.py -- extension
node scripts/blender/validate_clean.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/soften_joint_uv.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/soften_joint_uv.py -- extension
node scripts/blender/validate_clean.mjs joints-candidate
node scripts/blender/diagnose_dark_joints.mjs hall-joints-candidate
```

Le post-traitement produit `hall-joints-candidate.glb` et `extension-joints-candidate.glb`. Après leur comparaison dans le navigateur, ils ont été promus sous les noms `hall-clean.glb` et `extension-clean.glb`. Pour reproduire cette livraison après vérification des candidats :

```sh
cp public/museum/hall-joints-candidate.glb public/museum/hall-clean.glb
cp public/museum/extension-joints-candidate.glb public/museum/extension-clean.glb
```

Sources et EXR du bake : `assets/museum/clean-experiments`. Sources finales avec UV corrigées : `assets/museum/joint-uv-experiments/*-joints-candidate.blend`, avec rapports des nombres de faces/UV traités. Les rapports `public/museum/clean/*-report.json` décrivent le bake avant ce dernier post-traitement ; leurs poids sont donc antérieurs aux poids finaux du tableau ci-dessus. La validation réelle de GLTFLoader décode Draco et les WebP, contrôle les deux canaux UV, les ancres, les triangles et les passages, puis teste les rayons qui doivent être bloqués par le cap. Rapports finaux : `artifacts/museum/joints-candidate-export-validation.json` et `joints-candidate-texture-validation.json` ; ils portent sur les mêmes octets que les GLB promus.

Vues source : `hall-clean-home.png`, `hall-clean-wall.png`, `extension-clean-home.png`, `extension-clean-wall.png`, `extension-clean-closed-end.png` dans `artifacts/museum`. Le mur rapproché est lisse, sans les anciens motifs de plâtre grossis. Ces vues précèdent le dernier correctif UV CPU. Les captures du vrai navigateur `warm-home.png` et `warm-salon.png` montrent la variante finale avec ce correctif ; elles ont été inspectées après intégration. Les fins joints géométriques et ombres de moulures restent visibles.
