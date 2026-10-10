# Vérification de livraison — 10 octobre 2026

## Résultat et périmètre

Les parcours vérifiés ne présentent pas de blocage local. Le code compile et les 428 tests passent. Le site de production est signalé indisponible par son propriétaire après épuisement du quota Vercel ; aucun appel au live, changement d’offre ou envoi d’email réel n’a été effectué pendant cet audit. La validation du fonctionnement réel sur Vercel reste donc à refaire après rétablissement du quota.

Essais sur la version compilée, Node 24, navigateur Codex/Chromium privé, réseau localhost, aux formats 1280 × 720 et 390 × 844. Le format téléphone est une émulation de viewport, pas un test sur téléphone physique. Les données et images de travail ont été copiées dans `.local/qa-delivery-2026-10-10` ; le catalogue original est inchangé, vérification SHA-256 comprise.

## Corrections

- L’image d’attente 3D garde une URL stable puis est démontée après son fondu. Le changement de salle ne télécharge plus une image d’attente invisible. La vérification des aperçus est déclenchée à l’ouverture du menu des salles.
- Les événements rapprochés de focus, de visibilité et de modification entre onglets sont regroupés pendant 100 ms. Une édition survenant pendant une lecture reste prise en compte. Le cache serveur et la durée maximale de révocation des médias ne sont pas allongés.
- L’aperçu d’édition utilise la variante de salle au lieu du détail HD sans perte. Pour le tableau de test, cela représente 382 332 octets au lieu de 1 377 924 octets. Les originaux et la fiche publique détaillée sont conservés.
- Les prochains imports bornent les deux dimensions des variantes après orientation EXIF, sans recadrage ni agrandissement. Une image de 400 × 12 000 produisait auparavant une texture de salle de 400 × 12 000. Elle produit maintenant 51 × 1 536 ; la miniature fait 11 × 320 et le détail 85 × 2 560. Les anciens médias stockés ne sont pas régénérés par cette modification.
- Sharp passe de 0.35.4 à 0.35.5 et la dépendance transitive source-map-js de 1.2.1 à 1.2.2. Versions verrouillées dans le lockfile. Références des correctifs : [Sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) et [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Tests exécutés

- Avant modifications : 423 tests, 45 fichiers, réussis.
- Après corrections : 428 tests, 46 fichiers. Après la mise à jour des dépendances, une exécution parallèle a dépassé la limite de 5 secondes du test d’encodage lossless ; la suite entière réussit avec `npm test -- --maxWorkers=2` en 16,45 s. Aucun délai de test augmenté et aucune assertion retirée.
- `npm run build` après la mise à jour des dépendances : compilation, TypeScript et génération réussis.
- `npm run typecheck` et `git diff --check` : réussis.
- `npm audit --omit=dev` après mises à jour : aucune vulnérabilité signalée. Ce résultat concerne les avis connus, pas une garantie d’absence de faille.
- Tests automatisés notamment sur publication, chevauchements, concurrence, remplacement d’image, séparation des prix privés, authentification, accès aux médias, règles SEO, contact simulé et cache Blob simulé.

## Parcours réellement exécutés dans le navigateur

- Connexion locale, import d’une image, brouillon, publication et placement automatique, persistance après redémarrage/reconnexion.
- Prix interne 125,50 CHF masqué dans l’API publique ; passage au prix public et au statut vendu, visibles sur la fiche publique.
- Archivage : retrait de la liste publique, fiche publique 404 et média refusé à un visiteur anonyme (401), conservation dans l’admin.
- Création d’une collection dans la salle 2 depuis le format téléphone.
- Deux onglets sur Textes & contact : le premier enregistrement persiste, le second reçoit le conflit et conserve sa saisie.
- Accrochage : mise en réserve, annulation/rétablissement, application bloquée avec une œuvre non placée, sauvegarde du brouillon, fermeture et reprise, restauration du plan et application. Les positions et dimensions visibles des 26 œuvres initiales restent identiques. Deux anciennes ancres sont normalisées vers les zones actuelles sans mouvement visuel.
- Panneau Stockage accessible ; en mode local il indique correctement que la mesure Vercel est indisponible. La vraie consommation et les sauvegardes distantes ne sont pas consultées.
- Import supplémentaire d’une image 400 × 12 000 depuis l’interface sur le build final avec Sharp 0.35.5 : brouillon enregistré, variantes bornées vérifiées sur disque, exclusion publique confirmée.
- Déconnexion et retour à l’écran de connexion.

## Chargement et protections observés

- Une seule requête d’image d’attente à l’ouverture 3D, aucune requête de statut avant ouverture de Salles, aucun détail HD demandé au démarrage observé.
- Après rendu : un Canvas, plus de poster masqué. Changement vers la salle 2 terminé sans requête de poster supplémentaire ; aperçus avec œuvres visibles dans le menu.
- La salle cible reste prioritaire, la suivante est préparée après disponibilité et les détails HD sont réservés à la sélection. Le catalogue conserve trois images immédiates puis le chargement différé des suivantes (23 sur les 26 œuvres de la fixture).
- À 390 × 844 : catalogue classique sans Canvas ; admin et catalogue sans débordement horizontal de la page.
- API admin œuvres/stockage/accrochage : 401 sans session. Mutation sans origine : 403. `/admin` porte `noindex, nofollow, noarchive` et les réponses admin sont privées sans cache.
- Pages catalogue, à propos, contact, légales, confidentialité, robots et sitemap répondent localement. L’indexation réelle Google et les paramètres de production ne sont pas revalidés par cet essai local.
- Aucune erreur JavaScript relevée dans les trois onglets de test. Avertissement connu de Three.js sur `Clock` émis par le renderer ; ce n’est pas une erreur de rendu.

Captures et mesures locales : `artifacts/delivery-2026-10-10/` (hors Git et déploiement), dont `admin-published.png`, `admin-mobile.png`, `catalogue-mobile.png`, `rooms.png`, `verification.json`, `final-import.json`, les relevés réseau et `npm-audit.json`.

## Limites de la livraison

Pas de mesure du gain de facturation Vercel : les réductions prouvées portent sur les requêtes du navigateur et la taille des fichiers demandés. Les règles de permission et de cache des contenus retirés sont conservées. La limitation des échecs de connexion admin reste propre à chaque instance ; elle ne constitue pas une protection distribuée contre un attaquant insistant. Aucun test sur WebKit ou matériel mobile physique lors de ce passage. Les tests de services externes sont simulés ; le quota et le formulaire réel doivent être recontrôlés après remise en service.
