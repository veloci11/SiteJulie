# Provenance des ressources

## Ciel photographique de la verrière

[Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), Greg Zaal (photographie), Jarod Guest (version ciel seul), Poly Haven, CC0. Source JPG tonemappée obtenue via l’API officielle, conservée dans `assets/museum/daylight/sky/`. Dérivé 2048 × 1024 intégré au GLB, servi localement et partagé par les vitrages. Le ciel suit la direction du regard ; il n’est pas utilisé pour modifier l’éclairage ou les couleurs des œuvres.

## Architecture et mobilier

- Fichiers : `public/museum/hall.glb`, `public/museum/extension.glb`, `public/museum/outside.glb`, `public/museum/manifest.json`.
- Sources éditables : `assets/museum/hall.blend`, `assets/museum/extension.blend`, `assets/museum/outside.blend`.
- Fabrication : `scripts/blender/build_museum.py`, paramétrée par `scripts/blender/museum_config.json`.
- Auteur : création procédurale originale pour ce projet par Codex, à la demande de l'utilisateur.
- Première fabrication : géométries et textures procédurales originales, avec cartes de 512 pixels conservées dans `public/museum/textures/`. Des sources PBR CC0 ont ensuite été ajoutées pour améliorer les matériaux ; elles sont identifiées dans la section ci-dessous. Leurs fichiers source seuls ne prouvent pas leur intégration dans les exports GLB.
- Réutilisation : livrables créés pour l'utilisateur ; aucune licence tierce supplémentaire attachée à ces ressources générées.

## Référence de direction artistique

`references/design/musee-reference.png` : référence fournie par l'utilisateur, consultée pour la composition uniquement. Le fichier original reste hors de `public/`, n'est pas embarqué dans les GLB et n'est pas redistribué. Les noms, prix et textes présents dans cette maquette ne constituent pas les informations réelles de l'artiste.

## Œuvres

Les images originales proviennent du dossier `ImageOeuvre/` fourni par l'utilisateur. Elles restent indépendantes de l'architecture et leur identité visuelle doit être conservée. Aucun droit de reproduction commercial ou de redistribution à des tiers n'est présumé au-delà de la réalisation demandée.

## Typographie et icônes

- Cormorant Garamond et DM Sans : paquets `@fontsource/cormorant-garamond` et `@fontsource/dm-sans` 5.3.0, SIL Open Font License 1.1 (licences présentes dans leurs paquets). Fichiers servis localement, aucune requête Google Fonts à la visite.
- Icônes Lucide : paquet `lucide-react`, licence ISC. L’icône en arche du site est un SVG original.

## Décodeur Draco

Les trois fichiers `public/museum/draco/draco_decoder.js`, `draco_decoder.wasm` et `draco_wasm_wrapper.js` sont copiés depuis `node_modules/three/examples/jsm/libs/draco/gltf/`. Draco est un projet de Google distribué sous Apache License 2.0 ; le README du paquet indique cette licence. Le texte officiel a été conservé dans `public/museum/draco/LICENSE`, depuis https://raw.githubusercontent.com/google/draco/master/LICENSE. Source : https://github.com/google/draco. Ce sont des décodeurs logiciels ; la provenance des ressources artistiques externes est documentée séparément ci-dessous.

## Références de la V2

`references/design/warm-daylight.png` et `warm-evening.png` sont les deux maquettes fournies par l’utilisateur et consultées pour la direction méditerranéenne. Elles restent privées, hors du site public. Aucune identité, citation, technique ou prix visible dans ces images n’est repris comme une donnée réelle. Les sculptures décoratives, livres sans texte, mobilier, tapis, pots, côtes et îlot de la V2 sont des géométries originales générées par le script.

## Sources PBR CC0 pour le décor

Neuf cartes 2K téléchargées depuis les API officielles, conservées dans `assets/materials/pbr/` :

- `plaster/` : [White Plaster 02](https://polyhaven.com/a/white_plaster_02), Rob Tuytel, Poly Haven.
- `walnut/` : [Natural Walnut Veneer](https://polyhaven.com/a/natural_walnut_veneer), Jenelle van Heerden, Poly Haven.
- `travertine/` : [Travertine 009](https://ambientcg.com/a/Travertine009), ambientCG / Lennart Demes. Création procédurale déclarée par la source.

Cartes retenues : albédo, normale OpenGL et rugosité, toutes en 2048 × 2048 pixels. Licence **CC0 1.0**, vérifiée sur les pages [Poly Haven](https://polyhaven.com/license) et [ambientCG](https://docs.ambientcg.com/license/). Les cartes sources ne sont pas retouchées. SHA-256, liens directs, auteurs et détails des fichiers : `assets/materials/pbr/provenance.json`. Guide d'utilisation et échelle : `docs/PBR_MATERIALS.md`. Aucune image d'œuvre n'a été utilisée dans ces matériaux.

## Oliviers autonomes

`public/museum/olive-detailed.glb` : géométrie originale créée dans `scripts/blender/tree_olive.py`, source éditable et provenance complète dans `assets/museum/trees/README.md`. Tronc, ramifications, feuilles courbées, atlas de nervures et revers argenté : fabrication originale pour le projet. Aucun modèle tiers ni image de tableau employé.

Écorce : [Bark Brown 01](https://polyhaven.com/a/bark_brown_01), **Rob Tuytel**, Poly Haven, [CC0](https://polyhaven.com/license). Trois cartes JPG 1K (albédo, normale OpenGL, rugosité) issues de l’API officielle, téléchargées en HTTPS avec validation TLS et MD5 vérifiés, préservées dans `assets/museum/trees/source/`. URLs et empreintes SHA-256 dans `source/provenance.json`. Écorce générique adaptée par teinte et échelle UV à un olivier procédural ; il ne s’agit pas d’une photographie identifiée comme une espèce d’olivier. Le GLB embarque des dérivés WebP. Aucun secret, source de tableau ou référence de maquette n’y est inclus.

## Détails des matières intérieures

Cartes locales dans `public/museum/interior/details/`, générées par `scripts/blender/prepare_interior_details.mjs` :

- `linen-base.webp`, `linen-normal.webp`, `jute-base.webp`, `jute-normal.webp` : textures périodiques originales, tissage et relief générés par calcul pour le projet, 512². Aucune photographie ou texture extérieure utilisée pour ces quatre cartes.
- `stone-base.webp`, `stone-normal.webp`, `stone-roughness.webp` : dérivés réduits du **Travertine009**, ambientCG/Lennart Demes, CC0, dont la source figure dans la section PBR ci-dessus.
- `wood-base.webp`, `wood-normal.webp`, `wood-roughness.webp` : dérivés réduits du **Natural Walnut Veneer**, Poly Haven/Jenelle van Heerden, CC0, dont la source figure dans la section PBR ci-dessus.

Les albédo pierre/bois sont réduits à 1024² ; les normales/rugosités à 512². Réencodage WebP avec perte, sources CC0 2K préservées dans `assets/materials/pbr/`. Les fichiers publics sont des dérivés de production explicitement préparés, pas la publication du dossier de références. Échelles physiques et paramètres : `public/museum/interior/details/manifest.json` ; intégration architecture : `docs/INTERIOR_ROOM_ASSETS.md`.

## Dérivés de la galerie contemporaine

`public/museum/contemporary/details/`, généré par `scripts/blender/prepare_contemporary_details.mjs` : le dérivé de pierre reprend le Travertine009 CC0 déjà identifié ci-dessus, neutralise sa luminance et limite sa variation à 14 %, avec une carte de rugosité uniforme satinée. Cartes bois/lin/jute et normale de pierre copiées depuis les dérivés intérieurs précédents. Aucune nouvelle source externe ; origines CC0 et créations textiles originales inchangées. Paramètres exacts : `public/museum/contemporary/details/manifest.json`. Intégration : `docs/CONTEMPORARY_ROOM_ASSETS.md`.


## Architecture contemporaine et figuiers actuels

Les fichiers actifs `hall-contemporary.glb` et `extension-terminal-contemporary.glb`, ainsi que le module réutilisable `extension-contemporary.glb` sont des créations procédurales originales du projet. Sources privées : `assets/museum/contemporary-experiments/`. Génération : `scripts/blender/build_contemporary_rooms.py` ; configuration spatiale actuelle : `scripts/blender/contemporary_contract.json`. Les panneaux, assises, pots, céramiques et livres sans texte sont des géométries originales ; seuls les dérivés de matériaux CC0 identifiés ci-dessus sont empruntés. Le README Blender conserve les commandes des versions historiques en les distinguant du pipeline actif.

`public/museum/fig-reading.glb` et `fig-central.glb` contiennent désormais deux ficus à petites feuilles originaux, générés par `scripts/blender/tree_ficus.py`. Les noms de fichiers historiques conservent le contrat de placement. Leurs graines, troncs et ramifications diffèrent réellement. Géométrie, textures d’écorce et de feuilles sont originales ; aucune photographie ou géométrie tierce n’y est intégrée. Sources Blender, manifestes et empreintes : `assets/museum/trees/ficus-reading/` et `ficus-central/`. Les versions précédentes du figuier à feuilles lobées (`tree_fig_variants.py`, dossiers `fig-reading/` et `fig-central/`) et de l’olivier sont conservées comme historique. Le coin lecture, tapis à ourlet, fauteuil, table et accessoires sont également des géométries originales. La nouvelle finition sombre des pots réutilise les détails de pierre CC0 existants. La terre, ses cartes de couleur/normales, ses mottes et fragments organiques sont générés de façon originale par `tree_ficus.py`.

La carte `contemporary/details/wood-base.webp` reste un dérivé du noyer CC0 cité plus haut : cette passe réduit à32% sa variation linéaire autour de la moyenne, sans nouvelle source externe. Le tissage jute est original procédural ; son échelle de5mm par maille et son ourlet géométrique sont documentés dans le guide des assets.

Les quatre retours muraux contemporains, niches, étagères intégrées et petites céramiques de la version V5 désormais archivée sont également des géométries originales du builder contemporain. Aucun nouvel asset externe ni image d’œuvre n’est ajouté.

Les deux inserts de bois pleine hauteur conservés sont des géométries originales du builder contemporain, sans nouvelle ressource externe. Les deux reliefs minéral/céramique V6 ont été retirés des exports actifs à la demande de l’utilisateur ; leurs sources restent dans la sauvegarde `assets/museum/contemporary-before-relief-removal/`. Les figuiers de cette passe utilisent trois morphologies de limbes originales, un maillage Delaunay contraint et des cartes d’écorce/nervures originales ; aucune photographie botanique n’est embarquée. Les détails, limites de shading et empreintes finales sont consignés dans `assets/museum/trees/FIG_VARIANTS.md`.

`public/museum/companion-plants.glb` contient un palmier, un zamioculcas et une aspidistra originaux, générés par `scripts/blender/companion_plants.py`. Feuilles, tiges, pots creux, terre et toutes leurs textures sont créés par le script, sans ressource tierce. Sources et provenance : `assets/museum/plants/companions/`. Placements et rayons de collision : `lib/museum/companion-plants.json`.
