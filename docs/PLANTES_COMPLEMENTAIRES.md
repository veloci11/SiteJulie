# Plantes complémentaires

Quatre plantes accompagnent les deux ficus, regroupées avec le mobilier plutôt que réparties le long des tableaux : un zamioculcas au bord extérieur du coin lecture, un petit palmier dans l’angle de l’alcôve gauche du hall, une aspidistra près de l’assise de l’alcôve gauche du salon et un second zamioculcas près de l’assise de droite. Les zamioculcas partagent leur modèle, avec une échelle et une orientation différentes.

Chaque modèle possède des feuilles courbées et asymétriques avec nervures fines, des tiges effilées, un pot en céramique mate à paroi intérieure réelle et une terre sombre en relief avec mottes et fragments. Une ombre de contact douce utilise les couleurs et alphas des sommets ; le feuillage reste opaque. Toutes les textures et géométries sont originales.

| Modèle | Hauteur, pot compris | Feuilles ou folioles | Triangles |
|---|---:|---:|---:|
| Palmier | 1,85 m | 750 | 48 855 |
| Zamioculcas | 1,12 m avant mise à l’échelle | 156 | 17 751 |
| Aspidistra | 1,30 m | 23 | 8 371 |

Le GLB partagé pèse 664 096 octets et contient cinq meshes par espèce. Les instances partagent géométrie et textures. Les positions, tailles et rayons sont centralisés dans `lib/museum/companion-plants.json`, utilisé par la scène et les obstacles de navigation. Les positions préservent le recul des vues d’œuvres en portrait ; la caméra contourne les pots.

Le contrôle de visibilité utilise les triangles réels des quatre nouvelles plantes : 14 575 rayons vers les œuvres publiées, depuis leurs cadrages dédiés et 48 étapes de chaque promenade, en ordinateur et portrait. Aucun rayon échantillonné n’est obstrué. Ce contrôle concerne les nouveaux ajouts et le catalogue courant ; il ne remplace pas les captures du navigateur. Rapport : `artifacts/plants-qa/sightlines.json`.

## Reproduction

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/blender/companion_plants.py
node scripts/blender/validate_companion_plants.mjs
node scripts/blender/sync_contemporary_manifest.mjs
MUSEUM_QA_OUTPUT=artifacts/plants-qa MUSEUM_QA_URL=http://127.0.0.1:3011 node scripts/museum-ficus-qa.mjs
npx vitest run tests/navigation.test.ts tests/render-quality.test.ts
npm run build
```

Blender 5.2.1 LTS a produit les sources, textures, manifeste et empreintes dans `assets/museum/plants/companions/`. Le validateur décode le GLB avec Draco et les textures avec Sharp : dimensions, enveloppes, normales, UV, couleurs, terre sous le rebord, feuilles opaques à deux faces et ombres seules transparentes.

Les 49 tests de navigation et de budget de rendu passent, ainsi que TypeScript et la compilation. Quatre vues Chrome réelles contrôlent les deux salles en 1440 × 900 et 390 × 844 : nouveau GLB chargé, un Canvas, pas d’erreur JavaScript ni de débordement horizontal. Captures et rapport : `artifacts/plants-qa/`. Le rendu source Blender de détail est distinct des captures du site. La taille mobile est simulée sur ordinateur. Les huit aperçus d’arrivée, avec œuvres en privé et sans œuvres dans le repli public, ont été recapturés.
