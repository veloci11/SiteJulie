# Chargement, vitesse et administration — 7 octobre 2026

## Changements

- Les sélections d’œuvre et les changements de salle utilisent une allure ×1,25. La promenade, sa vitesse d’arrivée, les trajets sûrs et l’inertie lors d’un nouveau clic restent conservés. Un recadrage dû au redimensionnement ne reçoit pas cette accélération.
- Huit vues réelles ont été recapturées dans le navigateur Codex : deux salles, horizontale/verticale, avec et sans œuvres. Les vues de référence utilisent 64° à 1600 × 1000 et 68° à 430 × 932. La projection d’ouverture suit exactement le recadrage CSS `cover`, y compris sur écran large.
- L’empreinte des aperçus inclut désormais les paramètres de la caméra d’ouverture. Un changement de lentille ou d’accrochage invalide les images antérieures.
- Un aperçu livré dans le build et correspondant à l’empreinte publique est lu directement depuis le déploiement, sans consultation Blob. Le contrôle de publication et le repli sans œuvres restent actifs après une modification du catalogue.
- L’admin vérifie l’espace réel entre les cadres avant de déclarer un manque de place. Une zone déjà occupée peut accepter une autre œuvre ; la surface restante affichée en m² ne prédit pas le nombre de tableaux supplémentaires.
- Le panneau stockage réutilise son inventaire Blob pour trouver la dernière sauvegarde, supprimant une seconde liste des mêmes objets.
- Textes & contact transmet les réglages de départ : le serveur refuse une édition concurrente (409) sans écraser les données. Comparaison atomique locale/Blob, et mise à jour conditionnelle JSONB pour Supabase. Les anciens onglets doivent être rechargés après déploiement.

## Vérifications exécutées

- Suite finale : **422 tests réussis, 45 fichiers**. `npm run build` : compilation et TypeScript réussis. `git diff --check` : réussi.
- Une première exécution de la suite en parallèle du build a dépassé les 5 secondes du test de traitement d’image. La suite entière relancée seule réussit sans changement ni augmentation du délai.
- Tests des trajets : durée ×0,8 depuis l’arrêt, chemin inchangé et hors obstacles, inertie conservée lors d’un nouveau clic, arrivée à la vitesse habituelle de la promenade.
- Tests de projection : deux salles à 1440 × 900, 1728 × 1084, 1920 × 1080, 2560 × 1080, 390 × 844 et 667 × 375.
- Tests Blob simulés : zéro lecture Blob pour les aperçus du build correspondant au catalogue ; ancienne empreinte refusée après retrait d’une œuvre ; une seule liste pour stockage et sauvegarde.
- La version compilée sert les quatre vues avec œuvres, HTTP 200 `image/webp`, identiques aux fichiers inclus dans le build. Empreinte : `7b6c94fc9e129aae86c853856a1071a381120e1d9e113d1fbc3af281e04cc6af`.
- Avant livraison, le catalogue public contenu dans la réponse HTML réellement chargée sur le domaine live a été comparé : ses 26 œuvres et leur accrochage donnent exactement la même empreinte que les nouvelles captures.

## Parcours du vrai navigateur

Essais dans le navigateur Codex privé sur une copie jetable du catalogue et des images, sans envoi d’email ni mutation de production. Les fichiers sources et les 26 œuvres publiques originales restent inchangés.

- Ouverture et déconnexion de l’atelier local ; accès anonyme aux API admin refusé (401) et mutations sans origine refusées (403).
- Import JPEG, texte alternatif, enregistrement en brouillon et exclusion du catalogue public.
- Publication avec placement automatique validé ; prix interne masqué (`priceMinor: null`), puis prix public exact 125,50 CHF et statut vendu.
- Archivage : retrait public, conservation de la fiche dans l’admin ; recherche de la fiche archivée.
- Création d’une collection ; réorganisation de salle, mise en réserve, brouillon enregistré, restauration ; accrochage public original inchangé.
- Sauvegarde de Textes & contact ; deux vrais onglets ouverts sur le même état : premier enregistré, second refusé avec saisie conservée, valeur du premier confirmée dans l’API publique.
- Nouveau compteur de capacité visible : 29,5 m² en salle 1 et 41,8 m² en salle 2 pour cette fixture. Écran d’admin à 390 × 844 sans débordement horizontal.
- Focus centré d’une œuvre, fiche hors du cadre ; trajet vers la salle 2 terminé, promenade reprise à 0,34 m/s.

Captures locales : `artifacts/speed-2026-10-07/`, exclues de la publication. Les captures horizontales sont contrôlées à 1600 × 1000 avant conversion WebP ; les verticales à 430 × 932. Elles proviennent du renderer réel, sans modification de scène ou de pose par injection JavaScript.

## Limites

Mac local, navigateur Codex utilisant Chromium, réseau localhost. Le viewport téléphone ne remplace pas un appareil mobile physique. Le panneau stockage local affiche son indisponibilité hors production ; sa consommation Blob est vérifiée par tests simulés, pas par mutation du stockage réel. Le CAS Supabase utilise le SDK installé avec transport HTTP simulé. Aucun gain de temps de chargement réseau ni de FPS comparatif n’est revendiqué. La dernière commande de facturation Vercel n’expose pas la consommation Hobby actuelle ; elle ne prouve pas une consommation nulle.
