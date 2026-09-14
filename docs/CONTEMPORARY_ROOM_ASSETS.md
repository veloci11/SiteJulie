# Architecture contemporaine — compositions distinctes

La passe du 13 septembre conserve les deux ambiances chaudes acceptées et répond aux nouvelles finitions : pots plus compacts, arbres matures détaillés, figuier central dans une seule pièce, mobilier moins symétrique, sculptures différentes et dernière paroi entièrement pleine.

## Fichiers livrés et budget mesuré

| Fichier | Octets | Triangles | Lots |
|---|---:|---:|---:|
| hall-contemporary.glb | 1 133 420 | 64 350 | 23 |
| extension-terminal-contemporary.glb | 1 610 728 | 89 840 | 21 |
| extension-contemporary.glb | 1 611 416 | 90 528 | 21 |
| fig-reading.glb | 764 660 | 71 924 | 3 |
| fig-central.glb | 826 352 | 79 564 | 3 |

Les cartes communes pèsent 303 552 octets. Pour les deux salles présentes, hall + terminal + cartes = **3 047 700 octets** ; avec les deux figuiers distincts = **4 638 712 octets** (4,42 Mio), hors œuvres, application, polices et probe. L’extension ouverte supplémentaire n’est chargée que si une salle intermédiaire existe. Les deux arbres totalisent 151 488 triangles / 6 lots ; les deux architectures 154 190 triangles / 44 lots. La mémoire reste distincte du transfert : trois atlas 2048² par module chargé et les détails PBR communs. Les quatre textures du figuier sont identiques dans les deux exports, mais leur partage GPU doit être explicite côté runtime ; sans cela, compter deux jeux de 8 Mio avec mipmaps. Aucun atlas de cap n’est chargé.

## Dernières finitions : coin lecture et contacts propres

Le hall reçoit, en plus de la banquette, un fauteuil bas, une table avec livres et petite céramique, et un tapis tissé à ourlet géométrique. Le salon conserve son arbre central et son assise décalée. Les deux nouveaux arbres sont distincts en ramification, silhouette et nombre de feuilles, avec attaches sur la ligne réelle du tronc, lobes plus larges et nervures. Voir `assets/museum/trees/FIG_VARIANTS.md`.

Le noyer conserve sa source CC0 mais sa variation d’albédo linéaire tombe à 32 % autour de la moyenne, période mobilier .60 m et normale .055 ; plafond 2.2 m et normale .04. Les stries ne dominent plus les assises. Le tapis possède une maille de 5 mm, une texture répétée à .12 m et un ourlet arrondi de 4 mm de relief. Les URLs des détails restent stables.

Deux causes géométriques de joints ont été mesurées : au pied des murs, une face chanfreinée vers le bas lisait le texel [0,0,0] à Y .0065 ; elle est désormais enterrée de 50 mm, remplacée visuellement par une face verticale éclairée. Au seuil intermodule, deux faces de mortier occupaient exactement Y .003996 dans une bande de 25 cm ; chaque plan est désormais borné à Z ±9 m. La lumière, les ombres et le motif de pierre n’ont pas été éclaircis globalement pour masquer ces problèmes. Rapports : `hall-floor-contact-before-reading.json`, `hall-floor-contact-diagnosis.json`, `floor-seam-validation.json` et `floor-contact-comparison.json` (8 anciens échantillons noirs visibles corrigés ; les 4 points sous Y .0065 sont sous le sol).

## Composition et circulation

### Retrait des reliefs : deux inserts de bois conservés

Les quatre grands retours V5 avaient été supprimés parce qu'ils masquaient les tableaux depuis la promenade. L'audit mesurait 6 682 occultations sur 55 808 rayons dans le champ visible. Les deux reliefs minéral et céramique ajoutés ensuite sont également retirés à la demande de l'utilisateur, avec leurs supports et éclairages rasants. Le mur d'enduit nu retrouve sa surface d'origine ; aucun décor de remplacement n'est ajouté.

Seuls les deux inserts walnut pleine hauteur restent : hall à `[-5.8175,2.975,.25]`, dimensions `[.065,5.95,.70]` ; salon à `[-5.8175,2.85,4]`, dimensions `[.065,5.70,1.10]`. Chaque insert conserve exactement trois larges lames et deux joints de 2 mm. Leur géométrie et leur teinte acceptées restent inchangées. Les toiles sont devant, à |X|5.693 m (ancre 5.86 moins dégagement .035 et imageDepth .132).

`partitionsByModule` est vide ; `wallDetailsByModule` contient un seul insert par module. Les deux proxies des reliefs retirés disparaissent aussi. Le builder refuse désormais tout autre style dans cette catégorie. Trois nouveaux bakes complets recalculent les rebonds sans les objets retirés : aucune lumière ou ombre de support n'est reprise d'un ancien atlas.

`validate_shallow_walls.mjs` vérifie les sommets Draco marqués `wallDetailsOnly`, les hauteurs des inserts, leur recul derrière les toiles et les anciens volumes perpendiculaires. Il ajoute neuf rayons sur chaque ancienne zone de relief : le premier contact doit être l'enduit original à X5.85 m. Le mode `--geometry-only` contrôle d'abord les emprises sans bake ni export.

La V6 avant ce retrait est conservée dans `assets/museum/contemporary-before-relief-removal/` (script, contrat, manifeste, GLB, sources PBR et baked). La V5 reste sous `contemporary-before-shallow-walls/`. Les arbres, les œuvres, le mobilier, les portes et les matériaux fins restent inchangés. Les résolutions restent à trois atlas 2048² par module et aux cartes communes existantes.

| Élément | Visages / hall | Récits & paysages / salon |
|---|---|---|
| Figuier | latéral, position `[-4.7,.035,4.35]`, scale `.95`, rotationY `.4` | central décentré, position `[.55,.02,-1.35]`, scale `1`, rotationY `2.8` |
| Sommet | 4.1675 m | 4.37 m |
| Pot | hauteur .74 m, rayon .46 m | hauteur .76 m, rayon .48 m |
| Assise | une banquette 2 × .88 m, centre `[-2.9,0,4.25]` | une assise 1.70 × .72 m, centre `[-1.15,0,-1.35]`, tournée de 90° |
| Coin lecture | fauteuil à `[-4.30,0,6.40]`, table à `[-2.75,0,6.05]`, tapis 3.30 × 3 m | côtés dégagés, zone centrale conservée |
| Sculpture gauche | grand geste minéral évidé | forme pleine ascendante et courbe |
| Sculpture droite | deux galets équilibrés | petit anneau terre cuite |

L’arbre et l’assise basse du salon composent une zone de contemplation centrale. Leurs proxies sont explicites ; les trajets les contournent et ne traversent pas le mobilier. Les anciens proxies de pilastres/plantes/vases absents ont été retirés. Les sièges et étagères des alcôves restent en place. Les petits livres et céramiques sont originaux, sans identité ni texte inventé.

Empreinte de salle 12 × 18 m, offset 18 m, douze ancres et positions d’œuvres conservés. Le plafond fermé reste à Y5.95 dans le hall et Y5.70 dans le salon. Les portes internes ont 3.2 m de largeur et 5.4 m de hauteur ; les ouvertures latérales 2.6 × 4.8 m. Les positions finales/proxies sont dans `scripts/blender/contemporary_contract.json`, synchronisé vers le manifeste après export.

## Vraie fermeture terminale

`extension-terminal-contemporary.glb` remplace le module salon pour la dernière pièce. Sa paroi avant est un seul volume plein de 12 m de large, face intérieure Z8.85, sans ouverture, contour de porte, remplissage rapporté ou plans superposés. Le passage arrière vers la pièce précédente demeure ouvert. Les ancres sont conservées même si le portail avant n’est pas praticable dans cette variante terminale.

`extension-contemporary.glb` conserve deux passages pour une éventuelle salle intermédiaire. Le runtime ne charge ni n’ajoute l’ancien `end-cap-contemporary.glb` à la variante terminale. Ce fichier antérieur reste disponible uniquement comme historique. Le terminal possède ses propres trois atlas : leur lumière inclut réellement la réflexion de sa paroi pleine. Cela évite une lumière empruntée à une ouverture absente ; seule la variante utilisée est chargée pour la dernière pièce.

## Qualité de matière et lumière

Les palettes acceptées restent inchangées : enduit crème/noyer clair dans Visages, terre rosée et menuiseries dans le salon ; pierre et tissus mats, sans miroir runtime. Les matériaux fins répétés sont séparés de la lumière, donc une proximité caméra ne révèle pas un grain grossier enfoui dans l’atlas.

- `LIGHTMAP ...` : radiance diffuse blanche dans `baseColorTexture`, texCoord1 ; extras `plasterColorLinear` et `lightmapRadianceScale`.
- `SURFACE ...` : même radiance UV1, albédo/normal/rugosité communs sur UV0 métriques. Extras `surfaceKind`, `surfaceColorLinear`, `surfacePeriodMeters`, `surfaceRoughness`, `surfaceNormalStrength`.
- Bois de plafond : période 2.2 m, normale .04 ; mobilier bois : période .60 m, normale .055. Teintes linéaires et échelles exactes restent dans les rapports exportés.
- La diffuse précalculée est exclusive : éviter un second éclairage diffus runtime. Le PBR conserve les reflets séparés. Les œuvres restent hors décor/bake, y compris leurs contours, cadres et cartels.

Cycles 5.2.1, Metal M1 Pro, 128 échantillons, huit rebonds diffus, DIFFUSE direct+indirect sans albédo ni normales fines. Débruitage Open Image Denoise CPU ; léger filtre sur la lumière des murs. Trois atlas 2048² par module, marges 32 px. Aucun atlas architectural agrandi, ciel ou nouvelle dépendance ajouté dans cette passe ; les arbres sont validés et documentés séparément.

## Jonctions et corrections conservées

- Plafonds arrêtés exactement à Z±9, afin de ne pas superposer leur chant à la face visible du mur voisin Z8.85.
- Soubassement du fond du hall limité à Y.72, sous le cartel de l’œuvre centrale (bas .805 ; marge .085 m).
- Faces extérieures des pots et petites céramiques générées avec le bon winding ; validation radiale des normales.
- Protection des petites faces de murs par UV locaux voisins, pour éviter les lignes noires sous le texel.
- Les biseaux des dalles prélèvent la lumière de leur propre face supérieure, inset .035 m. Le mortier reste à Y.004 et prélève la lumière locale adjacente : les ombres de mobilier/arbre sont conservées sans pointillés noirs sur les joints.

Les previews physiques de cette passe montrent un raccord sol/mur fin, sans bande sombre épaisse. Les tests GLB vérifient aussi la continuité du mortier et l’absence de faces du plafond sur la jonction critique. La validation finale d’antialiasing et de composition appartient aux captures du vrai navigateur ; les rendus Cycles ne les remplacent pas.

## Sources et reproduction

Point d’entrée : `scripts/blender/README.md`. Builder : `scripts/blender/build_contemporary_rooms.py`. Exécuter `hall`, `extension`, puis `extension --terminal`, successivement sans QA GPU simultanée. Les dossiers privés `assets/museum/contemporary-experiments/{hall,extension,extension-terminal}/` contiennent les sources PBR, sources finales UV/baked et EXR. Les fichiers publics et rapports sont sous `public/museum/`.

Les deux figuiers ont respectivement 223 et 249 feuilles, chacun en trois meshes. Les grosses branches et leur tronc possèdent maintenant une jonction fusionnée à normales continues ; les feuilles et les emprises restent inchangées. Les SHA256 finaux des deux GLB sont enregistrés dans chaque source de salle et chaque rapport de bake, puis comparés aux fichiers publics par l’audit de reproductibilité. Leurs textures originales sont identiques pour permettre leur partage côté runtime ; les géométries diffèrent réellement. Voir `assets/museum/trees/FIG_VARIANTS.md`.

La composition précédant le coin lecture est préservée sous `assets/museum/contemporary-before-reading/`. Les sources, scripts et GLB de la composition antérieure sont préservés sous `assets/museum/contemporary-before-composition/`. Le guide précédent y est également conservé. Les réparations historiques `fix_contemporary_*` ne doivent pas être appliquées après le builder actuel, qui intègre déjà leurs corrections.

## Contrôle source oblique sans bake des œuvres

`npx --no-install tsx scripts/blender/export_source_artwork_layout.mjs` lit les œuvres locales publiées et calcule leurs vrais slots/dimensions via la configuration du site. `render_shallow_oblique.py -- hall --removed-relief` et `-- extension-terminal --removed-relief` les ajoutent uniquement à une image de contrôle depuis une caméra oblique. Ces scripts ne sauvegardent ni source, ni GLB, ni atlas ; les peintures restent complètement hors du décor précalculé.

## Preuves et limites

- Décodage réel Three GLTFLoader + Draco + WebP, UV0/UV1, normales, ancres, ouvertures, fermeture terminale plane, budget et géométrie du figuier.
- Validation CPU de toutes les routes et proxies par l’agent navigation ; capture et performance navigateur par l’agent principal.
- Rapports : `artifacts/museum/contemporary-export-validation.json`, `junction-after.json`, `outward-normals-validation.json`, `contemporary-reproducibility.json`, `walnut-preservation.json`, `shallow-walls-glb-validation.json` et `artifacts/fig-qa/variants-validation.json`.
- Vues source finales après retrait : `artifacts/museum/hall-bare-wall.png` et `extension-terminal-bare-wall.png`. Les anciennes zones de relief sont nues, sans ombre fantôme. Les vues `*-shallow-oblique.png` restent des preuves historiques de la V6 avant suppression. Sur cet angle particulier du salon, le figuier central conservé masque partiellement une œuvre : la garantie de visibilité porte sur les nouveaux reliefs muraux, pas sur chaque objet depuis chaque point de la salle. L’ouverture arrière du salon isolé est le vrai passage interne, occupé par la pièce précédente dans le site.

Les cartes CC0 dérivées et la géométrie originale conservent les mêmes licences : voir `ASSET_LICENSES.md`. Les références East Building et Perrotin du guide historique ont orienté la sobriété architecturale, aucun de leurs médias n’est embarqué.
