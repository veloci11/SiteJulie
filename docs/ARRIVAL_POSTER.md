# Image d’arrivée

Les quatre images de `content/arrival` sont des captures du vrai musée actuel : deux salles, formats horizontal et portrait, caméra à 2,05 m, verrière et ciel actuels. Elles sont servies par l’API, jamais comme fichiers publics directs. Le manifeste lie les captures à toute la disposition publique, y compris les œuvres visibles dans la salle voisine.

Le mode Blob peut utiliser ces captures embarquées dans le déploiement. Auparavant, seuls les caches locaux du mode démo étaient accessibles, et Vercel retombait sur les anciennes images d’une salle vide.

Après suppression, déplacement, changement d’image, dimensions, cadre ou disponibilité dans l’administration, l’empreinte change et l’ancienne capture n’est plus servie. Les anciens fonds d’architecture ont été retirés : en attendant un nouveau lot, un fond ivoire neutre accompagne le chargement, sans montrer une œuvre retirée ni une autre version du décor. Aucun cache navigateur/CDN ne peut prolonger la publication de l’ancienne image.

La génération automatique des captures fonctionne uniquement sur l’aperçu local équipé de Chrome. Vercel n’exécute pas Chrome : après des modifications administrateur en production, il faut produire/revoir un nouveau lot et le déployer pour retrouver une image illustrée avant le chargement. Le musée 3D et les miniatures des œuvres utilisent toujours les données courantes.

Pour embarquer un lot local déjà généré et vérifié : `npx tsx scripts/package-arrival.ts`. Le script refuse une empreinte périmée et vérifie les quatre fichiers avant copie. Il ne lance pas de navigateur.
