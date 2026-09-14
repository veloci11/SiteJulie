# Salles fermées : matières indépendantes et lumière intérieure

La demande utilisateur remplace les verrières ouvertes par des plafonds clos. Les nouvelles salles conservent les coordonnées de la scène V2, les douze ancres de chaque module, les passages entre salles, les alcôves et les proxies existants. Aucun tableau, cadre d’œuvre, texte éditorial ou prix n’est intégré aux assets architecturaux.

## Livrables vérifiés

| Asset | Octets | Triangles | Meshes/batches |
|---|---:|---:|---:|
| `public/museum/hall-interior.glb` | 1 577 900 | 77 856 | 17 |
| `public/museum/extension-interior.glb` | 1 782 716 | 92 146 | 18 |
| `public/museum/end-cap-interior.glb` | 5 744 | 12 | 1 |

Les dix petites cartes partagées sous `public/museum/interior/details/` pèsent ensemble **584 456 octets**. Les trois GLB et ces cartes représentent 3 950 816 octets. Les oliviers standalone sont livrés séparément par `olive-detailed.glb` et réutilisés par instance ; ils ne sont plus embarqués dans chaque salle.

Sources privées : `assets/museum/interior-experiments/{hall,extension}/`. Le fichier `*-interior-pbr.blend` contient les matériaux physiques et lumières avant conversion ; `*-interior.blend` contient le contrat exporté, les UV finales et les matières finales. Les EXR d’irradiance restent privés. Les GLB `*-clean`, `*-baked`, les anciens `.blend` et les correctifs précédents sont conservés.

## Architecture et lumière

Le hall possède un plafond central continu, trois caissons fermés à moulures arrondies, et les voûtes latérales existantes. Le salon conserve ses poutres en noyer et reçoit deux panneaux fermés à encadrements en enduit. Les surfaces vitrées ont été supprimées, pas masquées seulement au runtime. Les nouvelles pièces se trouvent au plafond, hors volume de navigation.

Le bake Cycles utilise de grandes sources intérieures invisibles : éclairage diffus sous les caissons, source principale oblique, rebonds latéraux chauds et lumière des alcôves. Il n’utilise aucune lumière Sun ni image de ciel. Le world résiduel vaut 0,025, couleur linéaire chaude. Les appliques des tableaux restent indépendantes au runtime. L’exposition des lumières a été réduite à 0,38 après une première preview trop claire.

Cycles : Metal sur Apple M1 Pro, 128 samples, huit rebonds diffus, marges d’extension 32 pixels. Les passes DIFFUSE direct + indirect excluent l’albédo et les normales fines. Débruitage CPU Open Image Denoise ; encodage explicite linéaire → sRGB. Chaque salle utilise trois atlas 2048² : murs/plafonds, sol, mobilier. Le cap utilise 512². Aucun atlas 4096 n’a été ajouté. Temps mesurés du script, incluant preview et export : hall 155,4 s, salon 148,9 s, hors préparation et vérifications CPU.

| Atlas | Hall : facteur radiance | Salon : facteur radiance |
|---|---:|---:|
| Murs / plafond | 5 | 7,25 |
| Sol | 3,5 | 2,5 |
| Mobilier | 4 | 9 |
| Cap terminal | — | 1,25 |

## Contrat des matériaux

**UV0 / TEXCOORD_0** contient des coordonnées en mètres, indépendantes de l’atlas. Pour le bois, chaque pièce connectée projette son axe le plus long sur U : les fibres suivent la longueur du banc, de ses jambes, des consoles et des poutres. **UV1 / TEXCOORD_1** contient l’irradiance déroulée. Dans le glTF, cette texture est transportée par `pbrMetallicRoughness.baseColorTexture.texCoord = 1` ; Three la charge dans `material.map`, `channel = 1`, sRGB.

`LIGHTMAP <module> ...` : les extras `plasterColorLinear` et `lightmapRadianceScale` multiplient la radiance décodée. Murs hall `[0.73,0.65,0.53]`, salon `[0.70,0.60,0.47]`. Le grain minéral fin appartient au shader runtime ; il n’est pas imprimé dans l’atlas.

`SURFACE <module> <kind> ...` : mêmes UV et transport de lumière, avec les extras `surfaceKind`, `surfaceColorLinear`, `surfacePeriodMeters`, `surfaceRoughness`, `surfaceNormalStrength` et `lightmapRadianceScale`. `surfaceColorLinear` est exactement le multiplicateur de l’albédo partagé appliqué dans la preview physique. Ce n’est pas une couleur sRGB à convertir une seconde fois.

| Matière | Période physique | Teinte linéaire principale | Rugosité | Normale |
|---|---:|---|---:|---:|
| Stone / sol hall | 1,20 m | `[.83,.87,.92]` | .82 × carte | .14 |
| Stone / sol salon | 1,20 m | `[.85,.83,.77]` | .82 × carte | .14 |
| Wood / noyer | 1 m | `[.42,.25,.13]` | .62 × carte | .25 |
| Linen / lin | .032 m | `[.88,.82,.72]` | .94 fixe | .12 |
| Jute / tapis | .12 m | `[.83,.67,.44]` | .96 fixe | .20 |
| Jute / bordure | .12 m | `[.66,.48,.28]` | .96 fixe | .20 |

Les pots, plinthes et sculptures utilisent aussi `stone`, avec les variantes stockées dans leurs extras. Les catégories `mortar`, `ceramic`, `soil`, `paper` et `book` n’exigent pas de téléchargement de carte : leur teinte constante est conservée par matériau. Les trois couvertures et la bordure du tapis gardent leurs variantes distinctes.

Chemins : `/museum/interior/details/{stone,wood,linen,jute}-base.webp` et `-normal.webp`; stone et wood disposent aussi de `-roughness.webp`. Base sRGB, normal OpenGL et roughness non-color. Échantillonnage répétable UV0 / période. Les facteurs de rugosité multiplient la carte, comme dans Cycles.

La passe Blender représente la radiance diffuse d’une surface blanche, soit irradiance / π. Pour un MeshStandardMaterial Three dont la lumière indirecte passe par BRDF Lambert / π, il faut rétablir ce facteur (intensité lightMap = scale × π) ou un shader équivalent. Le runtime doit éviter d’ajouter une deuxième diffuse ambiante/directionnelle à ces surfaces ; ses reflets PBR restent indépendants. Le parent a pris en charge ce branchement et sa comparaison navigateur.

## Oliviers et préservation des corrections

Les anciennes matières `Olive bark`, `Olive leaves 0..2` sont retirées. Pots et terre restent dans l’architecture. Les nouveaux arbres sont importés uniquement comme occludeurs pendant le bake, puis exclus de l’export architectural.

| Position locale X,Z | Échelle | Hall rotation Y | Salon rotation Y |
|---|---:|---:|---:|
| −5, 4.1 | .9 | 0 | .4 |
| 5, 4.1 | .9 | 0 | 2.8 |
| −5, −8 | .78 | 0 | 1.5 |
| 5, −8 | .78 | 0 | 4.7 |

Les racines commencent à Y≈.87 avant échelle, dans les pots conservés. Aucun proxy ni emplacement de mobilier n’a changé.

Les 132/176 faces internes opposées des arcs restent supprimées. Les quatre nervures du hall restent abaissées de 5,5 cm pour éliminer les surfaces quasiment coplanaires. Le mortier reste à Y=.004 (joint profond de 2,5 mm). Après chaque nouveau bake, les biseaux de chaque dalle héritent de la lumière du dessus de **leur propre dalle**, avec retrait de 3,5 cm : 225/396 dalles, 7 200/12 672 faces retargetées. Seule UV1 reçoit ce correctif ; UV0 conserve la matière métrique. Cela protège le résultat des pointillés noirs dus aux faces plus petites qu’un texel d’atlas.

## Nettoyage final des raccords, vérifié sur le vrai GLB

Les premières captures navigateur ont révélé des défauts peu visibles dans Cycles. Le raycast du GLB a mesuré un intrados de garniture à 12–470 µm de la maçonnerie et une extrémité de plinthe à 4 µm du jambage. Ces faces quasi superposées recevaient une ombre noire et certaines petites faces de moulure échantillonnaient un texel d’irradiance nul. Le diagnostic n’a donc pas été limité à une hypothèse de filtrage.

`interior_precision.py` décale radialement de 35 mm la limite cachée des 72/96 panneaux de maçonnerie derrière la garniture des arches. L’intrados visible et la taille des portails ne changent pas. Les quatre bouts de plinthe s’arrêtent 20 mm avant le plan du jambage. Les dimensions des proxies et les positions des œuvres restent identiques.

Le bake de lumière passe à 128 samples. Un filtre séparable `[.06,.24,.40,.24,.06]` à support de deux pixels atténue le bruit résiduel **de l’irradiance des murs seulement**, sans toucher aux cartes de matière. Les UV des petites faces d’arrondis sont projetées vers une face valide de la même pièce connectée : 2 530 faces pour le hall, 2 316 pour le salon. Le critère de largeur effective est `2 × aire UV / plus longue arête`, seuil 2,3 pixels ; la contraction de l’échantillon protège les marges. Les grandes surfaces et leur lumière restent à leur place.

Le raycast final montre, dans les régions précédemment noires du hall, une radiance rouge minimale d’environ 0,28–0,31 sur les intrados contre 0,009 avant, et 0,55 sur le caisson contre 0. Aucun grossissement d’atlas n’a été nécessaire. Le rapport `artifacts/museum/interior-precision-comparison.json` conserve les échantillons avant/après et leurs positions.

Le mortier présente un problème distinct : son atlas représentait surtout les parties cachées sous les dalles et sa lumière visible était jusqu’à 9 fois trop faible. Sa **face supérieure plane** est maintenant divisée en 225/396 cellules qui échantillonnent chacune l’irradiance exposée de leur dalle voisine. Hauteur Y=.004, emprise et teinte inchangées ; aucune nouvelle texture. Cela ajoute 448/790 triangles et conserve les ombres locales des bancs/arbres, ainsi que le relief réel des joints. `refine_interior_mortar.py` reproduit ce seul correctif sur CPU ; le builder l’intègre aussi après le bake et la correction des biseaux.

Les fichiers précédant ce nettoyage sont conservés dans `assets/museum/interior-before-precision/`. Les rendus et exports ont été revérifiés, puis le GPU explicitement libéré pour la validation navigateur du parent.

## Reproduction et validation

```sh
node scripts/blender/prepare_interior_details.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_interior_rooms.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_interior_rooms.py -- extension
node scripts/blender/validate_interior.mjs
```

`--preview-only` après le nom de salle arrête le script après le rendu physique. La première livraison a aussi exécuté `refine_interior_material_slots.py -- hall|extension`, une vérification/correction CPU du regroupement des variantes de couleur. La sérialisation correcte des couleurs est maintenant dans le builder ; ce post-traitement ne requiert aucun rebake et reste reproductible.

Les rendus physiques inspectés sont `artifacts/museum/hall-interior-pbr.png` et `extension-interior-pbr.png`. Le trou noir derrière le salon dans son rendu isolé correspond au passage interne vers le hall, conservé intentionnellement ; le vrai site y place l’autre salle. Ces previews n’incluent aucune œuvre. Les captures du vrai site et benchmarks sont pris séparément par le parent après signalement explicite du GPU libre.

`artifacts/museum/interior-export-validation.json` vient d’un vrai décodage GLTFLoader + Draco : ancres exactes, traversées libres de 60 cm aux portails, 25 rayons montants rencontrant le plafond par salle, cap terminal fermé, textures ≤2048, présence UV0/UV1, texture channel1 et métadonnées de lumière/matière. Un quadrillage de 925 rayons vérifie aussi que le mortier reste sans trou à Y=.004 dans chaque module. Les budgets annoncés ci-dessus concernent l’architecture, hors instances d’oliviers, œuvres et runtime.

SHA256 des GLB figés :

- Hall : `87e2cdbd0211d9964fb8e7ded01e0ffe2a596a7cfda45f9e31f888bfab45e540`
- Salon : `97659594c497f09bda388b390bda3625d6383ac8784c6579908229f73deb34c8`
- Cap : `e0dec87f4325b8d6a77d336fb35355a01093ace7daab43f6826005cede24b761`

## Provenance

Stone dérive du Travertine009 CC0 d’ambientCG ; wood du natural_walnut_veneer CC0 de Poly Haven. Le travertin est une texture PBR procédurale réaliste, pas un scan. Les cartes sources, licences et hashes restent dans `assets/materials/pbr/provenance.json` et `docs/PBR_MATERIALS.md`. Les tissages lin/jute sont originaux, générés périodiquement par `prepare_interior_details.mjs` (alternance dessus/dessous des fils, petite fibre, normale dérivée de la hauteur). Aucun shader ou modèle tiers n’a été exécuté pour les générer.
