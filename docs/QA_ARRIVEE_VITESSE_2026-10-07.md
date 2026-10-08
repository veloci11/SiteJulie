# Arrivée et vitesse — correction du 7 octobre 2026

Les deux aperçus horizontaux avec œuvres avaient conservé une projection proche de 60°, alors que la caméra réelle démarre à 64° au format 1600 × 1000. Le manifeste indiquait la nouvelle lentille, mais les pixels des fichiers ne la reproduisaient pas. Cela donnait l’impression de reculer à la disparition de l’image de chargement.

## Correction

- Huit captures du renderer réel ont été refaites dans le navigateur Codex privé : deux salles, horizontal/vertical, avec et sans œuvres. Conservation des pixels à 1600 × 1000 et 430 × 932, sans transformation géométrique avant conversion WebP. Les captures déjà correctes peuvent rester identiques.
- Les coins de cadres horizontaux sont comparés à la projection attendue : Variations 01 autour de (208,257), Métamorphoses 01 autour de (692,433) au format de référence. Les portraits sont conservés depuis les captures natives complètes ; une capture CDP recadrée a été écartée.
- Nouvelle empreinte d’aperçus : `28494190b75ee196873905b4f94a8c85b18d9af699296e39e957181435f84069`. Elle évite de réutiliser les images précédentes en cache. Le contrôle de l’accrochage public reste appliqué.
- Le fondu du poster attend désormais que la pose de la caméra ait effectivement été peinte par le renderer. Il n’expose plus la caméra de configuration pendant le montage du contrôleur.
- Le cadrage automatique démarre depuis la lentille du poster et rejoint progressivement les réservations de la promenade. Son horloge avance avec les mêmes pas d’affichage plafonnés que la caméra ; une interruption du rendu ne provoque pas de rattrapage brutal. Cette introduction concerne seulement l’ouverture initiale.
- L’allure des sélections d’œuvre et des changements de salle passe de ×1,25 à ×1,4375, soit 15 % supplémentaires. Vitesse d’arrivée dans la promenade, inertie, chemins et recadrages au redimensionnement restent conservés.

## Vérifications locales exécutées

- **218 tests réussis dans 11 fichiers** : vitesse, obstacles, annulations, passage entre salles, promenade, cadrage automatique et publication/cache/téléversement des aperçus. Compilation de production et TypeScript réussis. `git diff --check` réussi.
- Test du départ de lentille : même projection au passage du poster, déplacement d’un repère inférieur à un pixel pendant la première seconde, puis convergence au cadrage de promenade.
- Comparaison des pixels des images réellement servies par l’API avec un premier Canvas stationnaire indépendant, à deux ratios différents des captures de référence :

| Salle | Vue testée | Différence moyenne par canal / 255 | Pixels avec différence > 25 |
| --- | --- | ---: | ---: |
| 1 | 1280 × 720 | 2,56 | 0,29 % |
| 2 | 1280 × 720 | 1,79 | 0,21 % |
| 1 | 390 × 844 | 2,70 | 1,21 % |
| 2 | 390 × 844 | 2,07 | 0,86 % |

Les différences résiduelles de détail, d’anticrénelage et de compression n’introduisent pas de changement de cadrage. Les quatre réponses sont HTTP 200 et leurs octets correspondent aux fichiers inclus dans le déploiement. L’API de disponibilité annonce `ready: true` pour la nouvelle empreinte.

Parcours normal, sans réduction du mouvement : chargement avec le nouveau poster, sélection de Variations 01, trajet terminé en 2,729 s depuis la promenade en cours, tableau centré et fiche sur sa droite. Changement de salle terminé en 4,444 s depuis ce focus, puis reprise de marche en salle 2. La fenêtre Contact garde les barres accessibles et la promenade active. Ces durées décrivent les trajets observés ; le rapport exact d’accélération est contrôlé par les tests depuis les mêmes poses de départ.

Captures et mesures : `artifacts/opening-2026-10-07/`, exclues du dépôt. Essais sur une copie locale jetable des 26 œuvres publiques, sans envoi d’email ni modification du catalogue de production. Le viewport téléphone ne remplace pas un essai sur appareil physique. Aucun gain de FPS ou de temps réseau n’est revendiqué.
