# Finitions de la visite — suivi

Publication Vercel toujours en pause. Préserver les 26 œuvres, leurs textes et leurs liens.

- [x] Refaire À propos / Contact : panneaux ivoire, œuvre illustrée sur bureau, contenu défilant et cours repliables sur téléphone.
- [x] Rendre le changement de salle explicite : « Changer de salle » et accès direct « Salle suivante ».
- [x] Séparer les collections au sein du carrousel : onglets distincts, précédent/suivant limités à la collection, catalogue filtré depuis l’onglet choisi.
- [x] Corriger la promenade : regard anticipé mais limité par la tangente, vitesse angulaire plafonnée à 7,5°/s et accélération progressive ; freiner la rotation héritée d’une animation annulée.
- [x] Faire réapparaître l’introduction après fermeture/annulation d’une œuvre, dans les deux salles.
- [x] Première salle : grande verrière voûtée continue inspirée de la photo fournie, alcôves arrondies ; seconde salle conservée. Supprimer les défauts noirs des murs et du plafond.
- [x] Contrôler compilation, parcours de caméra, accrochage et rendu Chrome bureau/mobile.

## Vérification locale du 14 septembre 2026

- `npm test` : 254 tests passent (17 fichiers), dont les boucles complètes des deux promenades et la reprise depuis les 26 œuvres en cadrage mobile.
- `npm run build` : compilation et TypeScript réussis ; serveur local optimisé relancé sur http://127.0.0.1:3000/.
- `node scripts/blender/validate_daylight_hall.mjs` : géométrie, ancres, passages et UV des murs comparés à l’ancien modèle ; plafond périphérique sans atlas instable. GLB final 1 219 516 octets, 74 404 triangles, 29 lots.
- Chrome réel via MCP : bureau 1440 × 960, portrait 390 × 844 et paysage 667 × 375. Vérifiés : fenêtres et murs visibles sans surfaces noires ; introduction sans recouvrement de la carte de prévisualisation sur mobile ; collections séparées ; annulation pendant un trajet avec retour immédiat à `walking` ; visite active dans la seconde salle et derrière les panneaux, puis après leur fermeture. Console finale sans erreur.
- Captures : `artifacts/visit-finishing/vault-desktop.png`, `vault-mobile.png`, `contact-desktop.png`, `contact-mobile.png`, `about-mobile.png`, `room-2-landscape.png`.

Les dimensions mobiles sont émulées dans Chrome, pas mesurées sur un iPhone/Safari physique. Aucun engagement de 60 fps universel ni de confort vestibulaire garanti. La verrière utilise un vitrage diffusant opaque, sans coût de transmission ou monde extérieur ; voir `DAYLIGHT_HALL.md`.

Vercel reste en pause. Aucun déploiement ni envoi de message effectué.

## Ajustements suivants — verrière, annulation, voix de Julie

- Ancien éclairage et anciennes textures du sol, murs et mobilier rétablis après rejet du recalcul ; comparaison exacte des pixels et paramètres du GLB avec la source précédente.
- Extrémités vitrées scellées et finement encadrées, panorama photographique CC0 de ciel/nuages à l’infini. Aucun panneau plein ajouté au bout de la verrière.
- Hauteur commune de regard portée à 1,82 m. Boucles de promenade calculées une seule fois par mise à jour du catalogue ; recherche de reprise élaguée sans changer le critère de choix. Une image perdue lors du retour de l’interface ne provoque plus de rattrapage brutal de la caméra.
- Texte des cours à la première personne : « J’accompagne » et « Contactez-moi », dans la source et les données locales.
- Benchmark local de construction de 78 reprises : médiane 3,56 ms, 95e percentile 6,86 ms, maximum 8,89 ms. Ces mesures CPU Node ne sont pas un relevé FPS Safari.

- Ajustements complémentaires demandés : ciel plus dégagé ; alignement exact des montants de bout avec les barres de voûte ; fond sous les joints de la première salle ; même spécification de pierre et joints dans les deux pièces.
- Vérification finale : 254 tests et typecheck réussis. Validateur Blender/GLTF : 76 972 triangles, 29 lots, 1 304 380 octets, mêmes pixels de textures existantes, fermeture et alignement vérifiés par rayons.

- Dernier choix de ciel : Kloofendal 48d Partly Cloudy, bleu de beau temps et nuages blancs plus présents. Dernier GLB : 1 357 784 octets ; géométrie inchangée depuis la correction des joints et montants. Build optimisé relancé, publication toujours en pause.
