# Vérification initiale — 12 septembre 2026

> Historique de la première livraison. La refonte visuelle et les nouvelles mesures sont décrites dans [REFINEMENT.md](REFINEMENT.md). Les chiffres ci-dessous concernent la version initiale.

## Résultat

Le site fonctionne avec les huit œuvres sources dans un vrai musée Three.js, dont la géométrie a été fabriquée et exportée avec Blender. Le catalogue HTML et l’administration sont opérationnels. La prévisualisation finale utilise la **build de production standalone**, sur localhost, avec données locales de démonstration persistantes.

## Tests exécutés

| Contrôle | Résultat observé |
| --- | --- |
| `npm run build` | Réussite : compilation, TypeScript, routes et sortie standalone ; dernier build sans avertissement de traçage |
| `npm test` | 20 tests réussis, 3 fichiers (navigation, validation/admin/médias, URLs/contact) |
| `npm run test:e2e` | 4 parcours réussis en 46,9 s sur la production locale |
| Clique sur le tableau / carrousel | Même fiche et déplacement réel ; clic sur mesh testé en navigateur |
| Trois clics rapides | Dernière sélection conservée, aucune fiche obsolète, un seul Canvas |
| Historique et liens directs | Œuvre, À propos, Contact, retour navigateur et transfert vers la même fiche classique |
| Formats | Projection des quatre coins testée pour plusieurs murs et formats ; captures réelle horizontale et verticale |
| Mobile | 390 × 844, Canvas mesuré 390 × 341 lors de la fiche ; toile entière et contact visibles, pas de débordement horizontal |
| Accessibilité | Analyse axe WCAG A/AA de la page Contact classique réussie après correction des contrastes ; navigation sémantique, focus visibles, raccourcis et mouvement réduit |
| Repli WebGL | Indisponibilité simulée : accès au catalogue de la même œuvre, contact conservé |
| Administration | Vrai Chrome, build production et stockage jetables : connexion, brouillon, PNG téléversé et décodé, publication automatique, prix visible dans autre session, prix masqué sans fuite HTML/JSON, persistance après reconnexion, archivage puis fiche 404 et média refusé |
| Images | 20 Mio / 25 mégapixels, raster décodé, SVG refusé, EXIF et sRGB, variantes sans agrandissement, originaux séparés |
| Emplacements | Occupation unique, capacité explicitement limitée, sélection compatible avec dimensions physiques ; tests géométriques comprennent une extension connectée |
| Exports Blender | Passages vérifiés par Three.js Raycaster avec volume caméra, ancres Y-up, décodage des 14 textures ; hall et extension validés |
| WebKit 26.6 | Catalogue/contact/musée à 390 × 844 et 844 × 390 : HTTP 200, zéro erreur JavaScript, zéro débordement horizontal, 8 images décodées, WebGL 2 actif et Canvas unique |
| Dépendances | `npm audit` : aucune vulnérabilité signalée au dernier contrôle |
| Données privées dans standalone | Recherche effectuée : ni ImageOeuvre, ni references, ni .local, ni .env embarqués |

Les échecs intermédiaires ont été corrigés : faux repli provoqué par un effet React dans le contenu fallback du Canvas, largeur intrinsèque du carrousel sur mobile, texte spatial initial mal placé, doublon de lampes, contrastes secondaires. Les tests de développement ont aussi exposé des feuilles CSS périmées après builds concurrents et une attente trop précoce du titre de page ; la validation finale est faite sur la sortie de production avec attente de ses métadonnées.

## Environnement et mesures

Mac Apple M1 Pro, arm64, 16 Go, Node 24.13.0. Chrome 152.0.7977.83 en automatisation avec SwiftShader ; WebKit 26.6 installé depuis Playwright. Viewports Chrome 1440 × 900 et 390 × 844 ; captures admin 1440 × 1000 et mobile. Blender 5.2.1 LTS.

Mesures du navigateur dans `artifacts/museum/scene-browser-qa.json` : accueil 156 draw calls / environ 85 420 triangles ; focus mobile 91 draw calls / environ 84 760 triangles. Le compteur de rendu reste à 366 pendant deux secondes d’immobilité. Les finitions finales sur lampes et cartels peuvent faire légèrement varier les chiffres. Chaque GLB pèse environ 4,1 Mo sur disque ; un chargement mesuré du hall est de 1,57 Mo compressé et les huit textures de salle totalisent environ 1,45 Mo. Ces chiffres ne couvrent pas les scripts et polices.

Les ombres et la lumière sont calculées au runtime ; aucun bake n’est revendiqué. Les œuvres utilisent un matériau sans modification par la lumière chaude. Les textures de salle et de détail sont séparées, et le rendu fonctionne à la demande.

## Captures réellement produites

- `docs/captures/home-desktop.png` : accueil final de la production locale.
- `docs/captures/artwork-horizontal.png` : focus horizontal.
- `docs/captures/artwork-mobile.png` : focus vertical mobile final.
- `docs/captures/about-3d.png`, `contact-3d.png` : deux lieux éditoriaux.
- `docs/captures/artwork-classic-mobile.png`, `contact-classic.png` : version HTML.
- `artifacts/admin/` : atelier et compte rendu du scénario sur fixture jetable.
- `artifacts/museum/webkit-*.png` et `webkit-report.json` : deuxième moteur.

Les fichiers de référence ne sont jamais utilisés comme captures de l’application. La direction reprend pierre crème, arches, verrière, laiton et ombres obliques. Le résultat est un musée temps réel stylisé ; il ne reproduit pas le photoréalisme de l’image de référence, notamment la végétation et les rebonds lumineux.

## Limites explicites

- Supabase, Auth distant, RLS exécutées contre l’API REST réelle et Storage distant : **préparés, non connectés/non testés** faute de projet et d’accès. Les résultats locaux ne prouvent pas leur bon fonctionnement à distance.
- Aucun hébergement, domaine, déploiement public ou envoi réel d’email effectué. Aucun email fictif configuré ; le bouton de messagerie est désactivé jusqu’à renseignement de l’adresse.
- Identité, biographie, titres, techniques, dimensions, disponibilités et prix réels à compléter. « Œuvre 01…08 » sont des titres provisoires ; « Prix sur demande » évite tout prix inventé.
- Aucune mesure de 60 FPS GPU ou 30 FPS téléphone réel. SwiftShader et l’émulation ne valident pas ces objectifs. Safari.app et iPhone/Android physiques non testés.
- Extension vérifiée en géométrie/navigation et allocation ; pas de parcours navigateur d’une collection complète de 48 œuvres.
- Analyse axe ciblée, pas un audit exhaustif de conformité. Les images de détail supplémentaires et portrait facultatif ne sont pas proposés dans l’éditeur initial. L’archivage est réversible ; pas de suppression définitive exposée.
- Dockerfile fourni mais Docker non construit/testé. Sauvegarde documentée, restauration Supabase non exécutée.
