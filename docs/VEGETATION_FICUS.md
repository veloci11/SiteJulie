# Ficus à petites feuilles et pots sombres

Les deux arbres sont des modèles originaux à feuilles elliptiques pointues, légèrement courbées. Les rameaux se divisent et retombent ; tailles, orientation, courbure et couleur des feuilles varient. Les petites feuilles vert sombre remplacent les grandes feuilles lobées. Les troncs sont plus fins et brun grisé, sans les bandes horizontales de l’ancienne écorce. Les pots restent taupe/brun sombre mat. La terre possède un léger relief, des mottes irrégulières et quelques fragments organiques ; un ombrage de contact discret accompagne les racines affleurantes. Le coin lecture reçoit un arbre plus bas, incliné et étalé ; le salon un arbre plus haut, droit, à couronne resserrée et plus dense.

| Variante | Feuilles | Triangles | GLB |
|---|---:|---:|---:|
| Coin lecture | 2 085 | 66 146 | 766 560 octets |
| Centre du salon | 2 377 | 74 333 | 832 640 octets |

Les deux fichiers totalisent 1 599 200 octets. Quatre lots de rendu par arbre, terre comprise ; feuilles opaques à deux faces, sans transparence ni passe de transmission. Les bouts de pétioles invisibles ne sont plus maillés : les arbres avec terre utilisent moins de triangles que les modèles précédents. Avant les transforms existants, le coin lecture mesure 3,95 m de haut pour 1,10 m de rayon maximal ; le salon 4,35 m pour 0,99 m. Le niveau racine reste 0,70 m. Les placements, proxies, œuvres, caméra et matériaux hors végétation/pots restent inchangés par cette passe.

## Reproduction

Depuis la racine du dépôt, Blender 5.2.1 LTS :

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/blender/tree_ficus.py -- reading --render
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/blender/tree_ficus.py -- central --render
node scripts/blender/validate_fig_variants.mjs
node scripts/blender/sync_contemporary_manifest.mjs
MUSEUM_QA_URL=http://127.0.0.1:3011 node scripts/museum-ficus-qa.mjs
```

Sources `.blend`, textures, manifestes et empreintes : `assets/museum/trees/ficus-reading/` et `ficus-central/`. Le nom historique des exports `fig-*.glb` reste compatible avec la chaîne de fabrication du décor. Les nouveaux matériaux de pots sont dans `bakedMaterials.ts` et le recto/verso discret des feuilles dans `MuseumScene.tsx`. Le générateur précédent reste disponible pour les archives.

## Contrôles réalisés

- Décodage Draco et textures via Three.js/Sharp : normales finies et unitaires, enveloppes, quatre lots, matériaux opaques, variantes géométriques distinctes et textures identiques. Chaque arbre reste sous 80 000 triangles et 1 Mo. La terre est vérifiée au-dessus de l’ancien disque, à l’intérieur de la paroi et sous le rebord du pot ; son relief est réel et supérieur à 8 mm.
- Chrome réel : deux salles en 1440 × 900 et 390 × 844, captures avec interface et scène seule. Tous les arbres chargés, une seule caméra/Canvas, aucune erreur JavaScript ni débordement horizontal détecté. Rapport : `artifacts/ficus-qa/browser-report.json`.
- `npm run typecheck`, `npm run build` et les cinq tests ciblés des aperçus d’arrivée et du budget de rendu passent.
- Les huit vues d’arrivée (avec œuvres en stockage privé, sans œuvres dans le repli public) ont été recapturées ; le nouveau fingerprint invalide les anciennes vues.
- Les images de studio servent au contrôle de géométrie ; elles ne remplacent pas les captures réelles du site.

L’éclairage précalculé de l’architecture reste conservé : cette passe ne recalcule pas de nouvelles ombres de feuillage dans les atlas. Le feuillage utilise l’éclairage PBR existant. La vérification mobile est une simulation Chrome sur ordinateur, pas une mesure sur téléphone physique.

Une promenade Chrome de 16 secondes a également conservé le Canvas et l’état `walking`, sans erreur console ou page ni repli. Le navigateur intégré a rencontré un repli 2D lors des essais ; la vérification du rendu ci-dessus concerne Chrome. Le contrôle rapproché de la terre utilise aussi le rendu source Blender ; il ne constitue pas une capture rapprochée de l’application.
