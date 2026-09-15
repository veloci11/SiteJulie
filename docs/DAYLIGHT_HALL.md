# Première salle : verrière voûtée et alcôves

Le dérivé `public/museum/hall-daylight.glb` remplace uniquement la première salle. Il suit la référence de verrière de musée fournie par l’utilisateur : une grande toiture cintrée continue et un quadrillage métallique fin. La seconde salle conserve son plafond et son identité. Les anciens GLB et sources Blender sont préservés.

## Géométrie et rendu

Une ouverture de **5,20 × 14,40 m** traverse réellement le plafond. La verrière forme une voûte en berceau surbaissée : naissance à 6,25 m, sommet à **7,35 m**, treize arceaux transversaux et neuf montants longitudinaux. Les nervures intermédiaires font 30 mm de largeur. Les joues, appuis, joints, deux pignons vitrés et surface courbe sont des géométries réelles. Les panneaux de bois latéraux restent en dehors de l’ouverture, sans chevauchement.

Un panorama photographique CC0 de ciel et de nuages (Poly Haven, Kloofendal 48d Partly Cloudy Pure Sky, Greg Zaal / Jarod Guest), réduit à 2048 × 1024, remplace le ciel procédural uniforme. Le shader échantillonne le panorama selon la direction du regard : le ciel reste distant pendant la marche. Le quadrillage est une vraie géométrie. Les deux bouts du berceau sont fermés par des panneaux vitrés de 24 mm et sept montants verticaux fins par extrémité, avec traverse basse ; leurs normales et intersections sont vérifiées. Aucun tympan plein en plâtre. Le matériau simule la vue du ciel sans transmission, monde extérieur ni passe supplémentaire. Il ne prétend pas calculer une illumination solaire dynamique.

Les deux alcôves latérales ont désormais un intrados semi-circulaire. Leurs volumes supplémentaires commencent à 3,50 m, au-dessus des passages et en dehors des tableaux. Les teintes d’enduit sont échantillonnées dans l’irradiance existante, puis correctement converties de sRGB vers linéaire. Le grain métrique du runtime est conservé.

## Préservation des murs et correction d’export

Le premier candidat utilisait un booléen sur l’architecture assemblée. La vérification Chrome a montré des murs noirs : ce booléen avait supprimé des faces éloignées sur le mesh non manifold et introduit une couche UV parasite. **Le script final n’applique aucun booléen aux murs.** Il remplace uniquement les faces du plafond principal par quatre panneaux pleins autour de l’ouverture. Le plafond reconstruit utilise un enduit uniforme tiède avec le grain métrique du runtime, sans atlas : la tentative de transfert UV entre îlots de l’ancien plafond produisait des triangles noirs et a été supprimée après contrôle Chrome. Les joues ont exactement la même teinte. Les murs originaux conservent leurs deux UV. L’ordre est vérifié : `MetricUV`, puis `LightUV`, et l’irradiance doit utiliser `texCoord 1`.

Le test charge aussi l’ancien GLB et compare les impacts de rayons et coordonnées UV d’irradiance sur le mur du fond, les murs latéraux et l’intérieur des alcôves. Les éléments bois, le sol, les œuvres, les ancres et leurs UV restent séparés et préservés.

## Reproduction et vérification

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/blender/build_daylight_hall.py
node scripts/blender/validate_daylight_hall.mjs
```

Source réellement produite avec Blender 5.2.1 LTS : `assets/museum/daylight/hall-daylight.blend`. Rapport : `assets/museum/daylight/report.json`. Résultat CPU : `artifacts/daylight/export-validation.json`. Le manifeste candidat séparé est `public/museum/daylight-manifest.json` ; les statistiques et ancres de l’ancien manifeste ne sont pas remplacées.

L’intégration charge ce fichier pour `HALL` uniquement. Après une nouvelle génération, recharger vraiment le navigateur pour vider le cache `useGLTF` et invalider la première image d’arrivée. Le contrôle final doit montrer la voûte en vue générale, ses nervures et son cintre, les murs du fond normalement éclairés, les deux alcôves et la seconde salle inchangée. Les vérifications CPU ne remplacent pas cette capture du vrai navigateur.

## Budget et provenance

Le GLB final pèse **1 357 784 octets**, contient **76 972 triangles** et **29 lots** : +224 364 octets, +12 622 triangles et +6 lots par rapport au hall précédent. La nouvelle image de ciel est partagée entre tous les vitrages (2048 × 1024, environ 10,7 Mio GPU avec mipmaps RGBA). Toutes les géométries ajoutées sont statiques ; aucune nouvelle source lumineuse ni passe de post-traitement.

La géométrie est procédurale. La photographie de ciel téléchargée via l’API officielle Poly Haven est sous CC0 ; voir `ASSET_LICENSES.md`. La photo fournie par l’utilisateur sert de référence de composition et n’est pas intégrée au GLB. Les textures héritées conservent leurs licences dans `ASSET_LICENSES.md` et `assets/materials/pbr/provenance.json`.

## Correction après retour utilisateur

Le recalcul général de lumière essayé le 14 septembre a été retiré : il changeait trop le sol et les murs. Le GLB livré conserve exactement les pixels des anciennes cartes d’irradiance ainsi que les teintes et facteurs des murs, sol et mobilier (comparaison des SHA-256 des pixels décodés dans le validateur). Aucun changement de porte, de sol ou d’accrochage. L’essai de recalcul reste privé et ne fait pas partie du pipeline livré.

## Dernières finitions acceptées

Ciel plus dégagé demandé : panorama Kloofendal 48d Partly Cloudy, sans changer la lumière de la salle. Les sept montants de chaque extrémité reprennent exactement les abscisses circulaires des barres de toiture ; tests de rayons aux mêmes coordonnées. Un fond de joint abaissé de 1,5 mm ferme les microfentes du sol sans changer les dalles ni les textures. Le runtime harmonise uniquement la teinte de pierre/joint de la deuxième salle avec la première ; les éclairages des pièces restent distincts.
