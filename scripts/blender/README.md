# Génération du décor contemporain — point d’entrée actuel

Le site charge `hall-contemporary.glb`, `extension-terminal-contemporary.glb` pour la dernière salle, `extension-contemporary.glb` pour une salle intermédiaire éventuelle, et les deux variantes de figuier. Le cap rapporté précédent est archivé et ne doit plus être instancié. Les commandes méditerranéennes plus bas sont conservées comme historique ; elles ne représentent plus le décor actif.

Les fichiers livrés ont été produits avec **Blender 5.2.1 LTS**, Cycles Metal sur Apple M1 Pro, puis décodés et vérifiés avec Three.js. Les captures navigateur de la nouvelle finition sont réalisées séparément par la QA. Le builder contient les trois corrections finales : plafonds arrêtés à ±9 m pour supprimer la superposition au raccord, panneau du fond culminant à .72 m sous le cartel, et faces des pots/céramiques orientées vers l’extérieur. Les anciens scripts de réparation ne sont pas nécessaires pour une génération neuve.

## Entrées à conserver

Exécuter depuis la racine du dépôt, avec les dépendances du lockfile installées. Le pipeline est local ; il ne télécharge pas de ressources pendant la fabrication.

- `assets/museum/hall.blend` et `extension.blend` : sources géométriques de base conservées. Le builder contemporain en reprend le sol et les ancres, puis refabrique les sculptures, les parois, plafond et mobilier actuels.
- `assets/materials/pbr/{travertine,walnut}/` : cartes CC0 originales. Leur provenance et empreinte sont dans `assets/materials/pbr/provenance.json`.
- `scripts/blender/contemporary_contract.json` : dimensions corrigées du plafond et du panneau bas, placements des deux figuiers matures dans des compositions distinctes, ancres et proxies acceptés. Les proxies des anciens pilastres et plantes absentes ont été retirés ; les placements réels sont propres à chaque module.
- `public/museum/fig-reading.glb` et `fig-central.glb` : figuiers exacts utilisés comme occludeurs pendant le bake, puis affichés séparément par le runtime. Sources : `assets/museum/trees/{fig-reading,fig-central}/fig-source.blend`.

Si les sources de base ont été retirées, `build_museum.py` peut les refabriquer à partir de `museum_config.json`. Cette étape historique réécrit aussi les anciens exports et le manifeste ; il faut ensuite exécuter **tout** le pipeline contemporain ci-dessous. Elle n’est pas nécessaire avec les sources livrées.

## Génération complète

```sh
# Détails dérivés des sources privées, puis palette contemporaine
node scripts/blender/prepare_interior_details.mjs
node scripts/blender/prepare_contemporary_details.mjs

# Les sources du figuier peuvent aussi être régénérées sans rendu de studio
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/blender/tree_fig_variants.py -- reading
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/blender/tree_fig_variants.py -- central
node scripts/blender/validate_fig_variants.mjs

# Cycles : exécuter les salles successivement, sans benchmark GPU simultané
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_contemporary_rooms.py -- hall
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_contemporary_rooms.py -- extension
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_contemporary_rooms.py -- extension --terminal

# Synchroniser les métadonnées dérivées des vrais GLB et du contrat local
node scripts/blender/sync_contemporary_manifest.mjs

# Contrôles CPU : décodage Draco, UV, ancres, ouvertures, cartel et normales
node scripts/blender/validate_contemporary.mjs
node scripts/blender/validate_contemporary_junction.mjs
node scripts/blender/validate_contemporary_normals.mjs
node scripts/blender/validate_floor_seam.mjs
node scripts/blender/validate_shallow_walls.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/verify_walnut_preservation.py
node scripts/blender/diagnose_floor_contact.mjs
node scripts/blender/sync_contemporary_manifest.mjs --check
```

Les anciennes cloisons V5 et les deux reliefs minéral/céramique V6 sont retirés. `wallDetailsByModule` conserve uniquement les deux inserts walnut pleine hauteur, limités à 6.5 cm de saillie et vérifiables dans le GLB via `wallDetailsOnly`. Le test vérifie aussi le contact direct avec l’enduit aux deux anciennes zones de relief. Les trois bakes complets retirent leurs anciennes ombres et lumières. Ajouter `--geometry-only` pour un contrôle CPU des emprises, sans import d’arbre, rendu ni écriture de source/export.

Après validation de composition, `--skip-preview` lance les atlas sans refaire l’image générale. Les empreintes des GLB végétaux utilisés sont enregistrées dans la scène `.blend` et le rapport de bake (`treeAssetSHA256`).

Ajouter `--preview-only` après `hall` ou `extension` pour s’arrêter après le rendu source et avant les atlas/export. Cela produit un aperçu, pas un nouvel asset public. Pour un rendu de studio du figuier, ajouter `--render` après `reading` ou `central`.

Le chanfrein inférieur des murs est enterré de 50 mm et les plans de mortier sont bornés à Z ±9 m, supprimant le noir sous les murs et la superposition au seuil. `clip_mortar_boundary.py` documente la correction CPU appliquée à un export intermédiaire ; le builder actuel intègre déjà ces limites et n’en a plus besoin.

La géométrie et les corrections sont reproductibles ; les octets des textures/GLB ne sont pas un critère de comparaison d’une nouvelle passe Cycles. Le rendu, le débruitage et l’encodage peuvent varier selon les versions et le matériel. Les chiffres et hashes documentés concernent les fichiers effectivement livrés.

## Matériaux et résultats

`LIGHTMAP` transporte une irradiance blanche, sans grain ni albédo, sur UV1. `SURFACE` ajoute les détails PBR répétables sur UV0 métriques ; la période spéciale du bois de plafond est 2.2 m, contre .60 m sur les meubles. Le runtime doit conserver la reconstruction diffuse prévue et éviter un second éclairage diffus. Les œuvres restent indépendantes du décor. Chaque figuier conserve trois meshes PBR, les vertex colors et des feuilles opaques DoubleSide ; aucun ciel extérieur n’est nécessaire. Les limites de recto/verso sont détaillées dans son guide.

| Fichier | Octets | Triangles | Lots |
|---|---:|---:|---:|
| hall-contemporary.glb | 1 133 420 | 64 350 | 23 |
| extension-terminal-contemporary.glb | 1 610 728 | 89 840 | 21 |
| extension-contemporary.glb | 1 611 416 | 90 528 | 21 |
| fig-reading.glb | 764 660 | 71 924 | 3 |
| fig-central.glb | 826 352 | 79 564 | 3 |

Les cartes communes pèsent 303 552 octets. Pour les deux salles présentes, hall + terminal + cartes = **3 047 700 octets** ; avec les deux figuiers distincts = **4 638 712 octets** (4,42 Mio), hors œuvres, application, polices et probe. L’extension ouverte supplémentaire n’est chargée que si une salle intermédiaire existe. Les deux arbres totalisent 151 488 triangles / 6 lots ; les deux architectures 154 190 triangles / 44 lots. La mémoire reste distincte du transfert : trois atlas 2048² par module chargé et les détails PBR communs. Les quatre textures du figuier sont identiques dans les deux exports, mais leur partage GPU doit être explicite côté runtime ; sans cela, compter deux jeux de 8 Mio avec mipmaps. Aucun atlas de cap n’est chargé.

Sources finales : `assets/museum/contemporary-experiments/{hall,extension,extension-terminal}/`. Les fichiers `*-pbr.blend` portent les vrais matériaux/lumières ; les `*-contemporary.blend` contiennent les UV et matériaux exportables. Les EXR restent privés. Les GLB et rapports sont sous `public/museum/` ; le manifeste synchronisé conserve l’ancien descriptif sous `legacyV2`.

Guide détaillé, captures et limites : `docs/CONTEMPORARY_ROOM_ASSETS.md`. Licences : `ASSET_LICENSES.md`. Figuier : `assets/museum/trees/FIG_VARIANTS.md`. Les captures de finition du vrai navigateur sont sous `artifacts/contemporary/finishing/`.

## Audit sans rendu

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/audit_contemporary_sources.py
node scripts/blender/sync_contemporary_manifest.mjs --check
```

Cet audit exécute seulement les petits générateurs de pot/vase et inspecte les sources `.blend`, sans bake, image de rendu ni export GLB. Il ne remplace pas une nouvelle reproduction complète. Le résultat est `artifacts/museum/contemporary-reproducibility.json`.

`fix_contemporary_junction.py`, `fix_contemporary_normals.py` et `finish_contemporary_materials.py` documentent les réparations intermédiaires. Ne pas les appliquer après le builder actuel. La comparaison historique des hashes d’atlas conservés est optionnelle : `validate_contemporary_normals.mjs --check-preserved-atlases`, uniquement sur la livraison réparée associée à `furniture-preserved-atlases.json`, pas après un nouveau bake.

---

# Historique conservé — V2 méditerranéenne

# Musée méditerranéen — géométrie V2

Sources effectivement créées avec **Blender 5.2.1 LTS**, selon `docs/SCENE_V2_CONTRACT.md` et les références privées `warm-daylight.png` / `warm-evening.png`.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/build_museum.py
node scripts/blender/validate_export.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/render_preview.py
```

Le dernier script rend uniquement les sources `.blend` pour revue de composition. Il ne modifie pas les modèles ni leurs exports. Les vues Blender ne remplacent pas les captures du navigateur.

## Trois assets indépendants

- `hall.glb` : hall de **12 × 18 m**, enduit sable, voûte douce, grande verrière à trois panneaux, travertin, bancs en noyer et lin, tapis tissés, livres sans texte, bols, sculptures originales et quatre oliviers.
- `extension.glb` : salon aux mêmes coordonnées, murs terre, plafond plus bas et poutres de noyer, sol argile, éclairage indirect matérialisé par un diffuseur, ameublement cohérent et ouvertures aux deux bouts.
- `outside.glb` : terrasse minérale de 20 × 9 m, assises, pots et oliviers, parapets latéraux, marches, côtes et îlot. L'origine correspond au seuil de la **dernière porte avant**. Positionner le groupe à Z = `dernier offset de salle + 9`. La mer animée relève du runtime : début local Z = 10, niveau Y = -0,7, extension conseillée jusqu'à Z = 180.

Les sources éditables et les exports non compressés restent dans `assets/museum/`. La V1 a été conservée dans `assets/museum/v1-archive/` pour consultation ; elle n'est pas chargée dans le site.

## Référentiel et géométrie

Les coordonnées de fabrication sont en mètres, Y vertical. La conversion vers Blender est `(x,y,z) → (x,-z,y)` ; l'export glTF Y-up la renverse. Chaque salle possède douze ancres à Y = 2,65 m. L'ancre 10 du salon se trouve à l'entrée gauche pour dégager sa porte arrière. Les ancres éditoriales sont à X = ±9,8 / Y = 3,8 / Z = -6,5.

Les portes centrales ont un passage de 3,2 m, les portes latérales de 2,6 m. Les murs des deux modules possèdent chacun leur moitié de l'interface de 30 cm, afin d'éviter des surfaces de couleurs différentes exactement superposées. Les faces intérieures des moulures sont également séparées du jambage pour supprimer une bande noire constatée au rendu.

`manifest.json` utilise le schéma V2 : `roomOffsetZ: 18`, `anchors`, `boundsByModule`, `obstaclesByModule.hall/extension/outside`. Chaque meuble solide et plante reçoit un proxy. Les tapis de quelques millimètres font partie du sol praticable. Les œuvres, prix et textes éditoriaux restent absents du GLB.

## Matériaux et lumière

Les textures originales de 512 pixels sont générées par le script : enduit, travertin, rugosité minérale, noyer et fibres. L'albédo est sRGB ; normales et rugosité sont linéaires. L'occlusion ambiante statique est calculée par rayons contre la vraie géométrie et exportée dans `COLOR_0`. Aucune lumière directionnelle ni silhouette d'œuvre n'est précalculée.

Le runtime conserve les vertex colors de GLTFLoader, ajoute le ciel, le soleil et les lampes des tableaux. Le matériau `Skylight glass` ne projette pas d'ombre. Éviter une seconde AO excessive. Les objets décoratifs n'affirment aucune attribution artistique réelle.

## Compression et tests exécutés

Les GLB utilisent Draco : positions 16 bits, normales 12 bits et couleurs 8 bits. Les décodeurs locaux `/museum/draco/` sont fournis avec la licence Apache 2.0. Aucun CDN nécessaire.

`validate_export.mjs` décode réellement les géométries Draco avec le module officiel Node, puis les analyse avec Three.js. Sharp décode les textures. Sont vérifiés : ancres Y-up, sol, passages balayés par un volume de 60 cm, axe central, approches latérales et inclusion des plantes dans leurs proxies. Le rapport actualisé est `artifacts/museum/export-validation.json`.

Budgets obtenus : environ **5,83 Mo / 26 lots / 158 000 triangles** pour le hall ; **6,14 Mo / 28 lots / 174 000 triangles** pour le salon ; **4,88 Mo / 17 lots / 117 000 triangles** pour l'extérieur. Les images des œuvres, le reflet et les effets runtime s'ajoutent à ces mesures.
