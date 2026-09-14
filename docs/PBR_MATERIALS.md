# Matières PBR sélectionnées

Trois matières, neuf cartes source, téléchargées depuis les liens des API officielles Poly Haven et ambientCG. Elles sont conservées dans `assets/materials/pbr/` pour la préparation des matériaux et des bakes Cycles. Le téléchargement seul ne modifie ni le décor GLB, ni les composants, ni les tableaux.

| Usage | Ressource et auteur | Cartes locales | Échelle initiale |
|---|---|---|---|
| Enduit fin, teinte sable à régler dans Blender | [White Plaster 02](https://polyhaven.com/a/white_plaster_02), Rob Tuytel / Poly Haven | `plaster/base_color.png`, `plaster/normal_gl.png`, `plaster/roughness.png` | environ 1 m par répétition |
| Travertin beige clair aux veines peu contrastées | [Travertine 009](https://ambientcg.com/a/Travertine009), ambientCG / Lennart Demes | `travertine/base_color.png`, `travertine/normal_gl.png`, `travertine/roughness.png` | 1,2 m × 1,2 m |
| Noyer naturel à grain fin pour le mobilier | [Natural Walnut Veneer](https://polyhaven.com/a/natural_walnut_veneer), Jenelle van Heerden / Poly Haven | `walnut/base_color.png`, `walnut/normal_gl.png`, `walnut/roughness.png` | environ 1 m par répétition |

Tous les fichiers font **2048 × 2048 pixels**. Les cartes Poly Haven et la normale du travertin sont en PNG 16 bits ; les deux autres cartes du travertin sont en PNG 8 bits. Les fichiers téléchargés restent inchangés. Les neuf sources représentent environ 121 Mio : ce sont des sources de travail pour le bake, pas le budget réseau souhaité du musée. Produire ensuite les textures finales adaptées au navigateur ; éviter d’embarquer ces sources intégralement dans chaque GLB.

L’image `assets/materials/pbr/material-selection.png` assemble des réductions des trois albédo, dans l’ordre enduit, noyer, travertin. Elle sert uniquement à la comparaison des couleurs et du grain, pas à remplacer une validation de leur rendu en scène.

## Branchement et choix de rendu

- Base Color : lecture **sRGB**. Normal GL et Roughness : **Non-Color**. Les normales sont en convention **OpenGL +Y**, déjà disponible dans les sources ; aucune inversion du canal vert n’a été appliquée.
- Le plâtre est volontairement neutre, avec de vraies variations de matière. Pour le sable, partir d’une correction légère du matériau plutôt que d’ajouter le brun très saturé de l’ancien décor ou un filtre global. Les œuvres ne doivent pas être concernées par cette correction.
- Conserver un microrelief discret : la rugosité à l’échelle des murs ne doit pas devenir un crépi grossier. Contrôler la taille physique des pores et du veinage dans une vue proche puis depuis l’entrée.
- Le travertin possède un veinage directionnel. Varier sobrement les décalages UV entre les dalles pour éviter un motif répété exactement sur chaque dalle. Une pierre adoucie doit garder des reflets diffus, sans effet miroir mouillé.
- Orienter le grain du noyer dans le sens réel des pièces de mobilier. Ne pas compenser des UV incorrects avec un contraste excessif.
- Le travertin est déclaré **PBRProcedural** dans l’API ambientCG ; il n’est pas présenté ici comme un scan photographique. L’apparence de pierre est réaliste, mais sa technique de création est procédurale.
- Pour le plâtre, l’API conserve un ancien champ texte `scale: 1.5M x 1.5M`, tandis que la page actuelle indique 1 m et `dimensions` vaut `[1000,1000]`. La valeur d’un mètre est un point de départ à vérifier visuellement, pas une mesure architecturale certifiée.

## Licence et provenance

Les trois ressources sont sous **CC0 1.0**. Les pages officielles autorisent l’usage commercial, la modification et la redistribution des fichiers d’assets : [licence Poly Haven](https://polyhaven.com/license) et [licence ambientCG](https://docs.ambientcg.com/license/). Les auteurs restent crédités ici, même lorsque l’attribution n’est pas obligatoire.

Les liens de téléchargement, URLs après redirection, tailles, identifiants source, noms de membres ZIP, MD5 fournis par Poly Haven et SHA-256 calculés localement figurent dans `assets/materials/pbr/provenance.json`. L’archive ambientCG officielle a été validée en taille puis seuls Color, NormalGL et Roughness ont été extraits ; aucun fichier `.blend`, shader, script ou modèle provenant de l’archive n’a été exécuté.

Les téléchargements ont utilisé `curl` avec validation des certificats système, HTTPS obligatoire et redirections exclusivement HTTPS. Aucun mode TLS non vérifié n’a été employé. Le magasin de certificats du vieux Python local ayant échoué, le téléchargement a été effectué avec le curl système qui a validé les connexions.

## Vérification locale

`node assets/materials/pbr/verify.mjs` compare les SHA-256, décode chaque carte et vérifie la limite 2K. Neuf cartes contrôlées avec succès lors de la préparation. Aucun code de scène ni export GLB n’a été modifié par cette opération.
