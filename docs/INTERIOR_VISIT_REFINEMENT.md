# Intérieur fermé, matières et visite automatique

Évolution locale du 12 septembre 2026 à la demande de l’utilisateur. Ce document remplace les indications de ciel ouvert et de caméra de `QUALITY_PERFORMANCE_REFINEMENT.md` ; ce dernier conserve les mesures de la livraison précédente.

## Rendu exécuté

Les deux salles ont des plafonds pleins : caissons et moulures dans la galerie, poutres de noyer dans le salon. La fermeture terminale est conservée. La scène ne charge plus de ciel, panorama ni géométrie extérieure. Le petit éclairage de réflexion CubeUV de 60 Ko reste utile aux matières intérieures.

Le travertin, le noyer, le lin et le jute utilisent des détails répétés à une échelle physique indépendante de leurs atlas d’éclairage. Les teintes, normales et rugosités sont partagées entre les salles. La lumière diffuse précalculée est appliquée une seule fois ; les matières conservent une réponse spéculaire aux normales. Les murs gardent un enduit fin et une lumière séparée, sans gros bruit d’albédo agrandi. Les détails de géométrie, UV, éclairage, ressources et licences sont dans `INTERIOR_ROOM_ASSETS.md`.

Les oliviers sont un modèle partagé : écorce PBR, branches irrégulières, feuilles courbées, nervures et revers argenté. La couronne finale contient 1 614 feuilles, 44 962 triangles et deux meshes, pour un fichier de 1 102 024 octets. Les huit exemplaires partagent géométries, matériaux et cinq textures. Le tronc et les branches sont strictement inchangés par la dernière densification du feuillage. Les sources et contrôles sont dans `assets/museum/trees/README.md`.

L’interface garde sa navigation supérieure transparente. Ses textes et ceux de l’accueil sont désormais bruns pour rester lisibles sur l’enduit clair ; retour et pause ont des fonds plus contrastés. Les peintures originales restent séparées du décor, complètes et sans recoloration.

La revue du vrai navigateur a déclenché une seconde passe sur les raccords : des faces de maçonnerie étaient à quelques microns de la garniture d’arche. Elles sont dégagées, les extrémités de plinthes espacées et les UV d’éclairage des très petites faces protégées. Les joints de mortier reprennent la lumière locale des dalles voisines, ce qui retire les traits noirs dus aux texels masqués sous le sol. La passe utilise les mêmes atlas 2048 ; aucune grande texture supplémentaire n’a été ajoutée.

## Mouvement et interaction

Le directeur de caméra reste l’unique propriétaire de la pose. Les courbes de translation évitent les obstacles et conservent position et vitesse lors d’une nouvelle sélection. L’orientation tourne progressivement pendant le trajet, y compris aux passages entre salles : limite d’environ 60°/s en navigation manuelle, environ 33°/s pendant la visite d’accueil. Le regard ne reste plus figé jusqu’à un virage tardif devant l’œuvre.

Le temps de franchissement est réparti selon l’effort de rotation et la distance de part et d’autre du seuil. La caméra peut donc tourner avant une porte proche, la traverser face au passage puis avancer, sans allonger toute la traversée pour un virage initial. Le cas accueil → œuvre 08 est verrouillé par un test de durée, d’orientation au seuil, de vitesse, de collisions et d’interruptions.

L’accueil et la vue générale de chaque salle proposent une boucle sur les quatre œuvres de cette salle. Départ après deux secondes, maintien de 3,5 secondes devant chaque peinture. L’URL ne change pas et aucune fiche ne s’ouvre automatiquement. Le bouton principal permet d’entrer sur l’œuvre actuellement présentée.

Le bouton pause, les tiroirs et un onglet masqué suspendent le temps du tour. La reprise conserve la pose ; une sélection manuelle annule le tour depuis la position courante. Si le téléphone change d’orientation pendant la pause, l’œuvre est recadrée pour le nouveau format, puis reste immobile. La préférence système de réduction des animations désactive la boucle.

L’interface et les cadres disposent de zones réservées en portrait et paysage. Les commandes principales ont au moins 44 pixels. Un doublon de règles CSS mobiles qui écrasait les dimensions de l’accueil a été retiré.

## Vérifications

Compilation de production et types réussis. Les 47 tests unitaires couvrent notamment placements, proportions, cadrages, obstacles et profils de vitesse. Les 12 parcours Playwright ont réussi : neuf parcours publics/mobile et trois nouveaux scénarios de tour réel, sans accélération artificielle des horloges. Les quatre parcours concernés par le dernier ajustement du temps de trajet ont été rejoués sur la compilation finale et ont réussi : sélections rapides, cycle complet, pause/reprise mobile et réduction des animations.

Les tests mobiles utilisent 390×844, 320×568 et 667×375. Le contrôle WebKit a réussi en 390×844 et 1440×900 : cibles de clic accessibles, changement de salle et d’œuvre, aucun débordement et aucune erreur JavaScript. Ce sont des contrôles sur Mac, pas des mesures sur téléphone physique.

`artifacts/interior-tour/report.json` et ses quatre captures contrôlent aussi le tour dans les formats 1440×900, 390×844, 320×568 et 667×375 : pose réelle du Canvas conforme au cadrage, quatre coins du cadre visibles, aucune intersection avec le bloc d’accueil, pause d’au moins 44×44 pixels et aucun débordement horizontal.

## Mesures finales

`artifacts/perf-interior/report.json` mesure les ressources définitives, dont les empreintes sont identiques avant et après le test. Chrome 152 natif, ANGLE Metal / Apple M1 Pro, macOS, viewport 1440×900, appareil DPR 2 et rendu plafonné à 1,5. Contextes neufs, cache HTTP désactivé ; les caches du processus GPU peuvent persister. Aucun rendu Blender ou autre test navigateur n’a été exécuté en parallèle.

| Mesure                                                            | Résultat du dernier passage |
| ----------------------------------------------------------------- | --------------------------: |
| Accueil prêt, premier scénario après redémarrage du serveur local |                       2,09 s |
| Œuvre 08 en lien direct, réseau local                              |                       1,37 s |
| Accueil prêt, réseau simulé 10 Mbit/s et 60 ms                        |                       7,66 s |
| Transfert du scénario accueil seul                                |                     8,24 Mio |
| Allocations de textures estimées                                  |                      257 Mio |
| Trajet accueil→08                                                 |                      7,738 s |
| Intervalle entre images pendant le trajet, percentile 95 / maximum |              18,7 ms / 22,1 ms |

Un précédent passage sur les mêmes ressources visuelles, avant le dernier ajustement du trajet et sur serveur déjà utilisé, donnait 1,39 s à l’accueil. La mesure 2,09 s est conservée ici ; ce n’est pas une garantie de chargement en 1,4 s. Le débit simulé est appliqué par Chrome, pas mesuré sur un réseau mobile réel. La mémoire est calculée d’après les dimensions des textures ; elle ne représente pas une mesure de mémoire du pilote.

`artifacts/museum/motion-report.json` vérifie séparément accueil → 01, 01 → 03 et sélections rapides 02 → 05 → 08. Médianes 16,7 ms, maxima 16,8 ms dans ces séquences. Le plus grand changement de direction entre deux captures successives vaut 1,23°, et aucun rendu supplémentaire n’est émis pendant deux secondes après l’arrivée sur une fiche. Le taux angulaire instantané présent dans le fichier est estimé par un observateur RAF distinct de l’horloge du directeur ; le contrôle des limites mathématiques est effectué par les tests unitaires.

Les captures finales sont `artifacts/museum/warm-home.png`, `warm-salon.png`, `warm-art.png`, `warm-mobile.png` et `artifacts/interior-tour/home-*.png`. Elles montrent le vrai navigateur. Les vignettes du sélecteur de salle ont été régénérées avec l’architecture finale. Le rendu demeure une scène WebGL interactive, avec éclairage architectural statique ; il n’est pas équivalent à une photographie ni validé esthétiquement par l’utilisateur.

## Reproduction

Après `npm run build` et `npm start` :

```sh
npm test
npm run test:e2e
node scripts/museum-webkit-qa.mjs
npx tsx scripts/museum-tour-visual-qa.mjs
node scripts/museum-motion-qa.mjs
PERF_OUTPUT=artifacts/perf-interior node scripts/museum-performance-qa.mjs
node scripts/warm-preview.mjs
```

Exécuter les mesures de fluidité sans rendu Blender ou autre test navigateur simultané. Le benchmark met en pause le tour par son bouton public pour comparer les trajets manuels et conserve les empreintes des ressources avant/après.
