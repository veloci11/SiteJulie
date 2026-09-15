# Mise en ligne — 14 septembre 2026

Reprise explicitement autorisée par Mathis. Le site est publié sur https://www.juliethiam.art ; https://juliethiam.art redirige vers cette origine. Les certificats HTTPS des deux noms sont valides. Aucune modification supplémentaire n’est nécessaire chez Infomaniak.

Projet Vercel `site-julie`, équipe `mathis-473b`, lié à `veloci11/SiteJulie`. Le MCP a renvoyé 403 et aucune équipe ; la connexion CLI a été autorisée par Mathis pour terminer effectivement la publication. Ne pas prétendre que le MCP est réparé.

## Données et accès

- Stockage Vercel Blob privé, Paris/CDG1, 26 œuvres publiées, 78 variantes vérifiées, quatre collections réparties dans deux salles. Pas de Supabase nécessaire.
- Le catalogue distant historique de huit œuvres a été sauvegardé dans `.local/pre-deploy-blob-catalog.json` avant import.
- Mode production `blob`, origine canonique HTTPS, indexation publique. Variables locales de démo supprimées du projet. Secret de session renouvelé ; identifiants conservés exclusivement côté serveur.
- Administration uniquement à `/admin`. Connexion HTTP 200 ; accès anonyme à l’API admin refusé (401), requête de mutation d’origine étrangère refusée (403).
- Sauvegarde d’une œuvre à contenu identique testée en production, HTTP 200 et révision 2 → 3 confirmée par relecture. Aucun texte, prix ni placement n’a été modifié pendant ce contrôle.
- Correction réelle du conflit Blob : le GET d’un catalogue JSON compressé expose un ETag faible ; une écriture conditionnelle exige le validateur fort de `head()`. Leur correspondance est vérifiée avant écriture, sans désactiver la protection contre les modifications simultanées.
- Les URLs privées d’images expirent ; ne pas les recopier dans une page statique.

## Rendu et arrivée

Cadres regroupés par matériau : quatre baguettes en un appel de dessin, deux filets en un autre, géométrie et matériaux conservés. Télémétrie du rendu publiée une fois par seconde au lieu de chaque frame. Caméra partagée à 2,05 m dans l’échelle virtuelle actuelle.

Quatre captures actuelles embarquées côté serveur (ordinateur/téléphone, deux salles), servies seulement lorsque l’empreinte correspond au catalogue. L’API de production a confirmé `ready: true`. Après une modification de l’accrochage, un fond ivoire remplace une capture périmée jusqu’à régénération : voir `ARRIVAL_POSTER.md`.

Les anciens bakes de travail restent dans le dépôt local mais sont exclus des envois CLI via `.vercelignore` ; les GLB actifs contiennent leurs atlas. Le paquet envoyé à Vercel passe à environ 15,4 Mo, au lieu de publier les 161 Mo du dossier public historique. Région d’exécution définie à Paris, comme le stockage, dans `vercel.json`.

## Vérifications

257 tests locaux réussis, compilation et types validés par les builds de production Vercel. Verrière contrôlée : 76 972 triangles, 29 meshes, 1 357 784 octets ; jonctions, ancres et atlas d’origine vérifiés.

Chrome réel : galerie chargée sur le domaine HTTPS, œuvres visibles, passage à la salle 2, promenade automatique, sélection et annulation avec reprise `walking`/`resume`. Capture mobile 390 × 844 enregistrée dans `artifacts/visit-finishing/production-mobile-final.png`. Sur les fenêtres de mesure observées : médiane 8,3–8,4 ms, P95 11,7–14 ms ; ce sont des observations sur ce Mac, pas une garantie de fréquence sur Safari/iPhone. Aucun appareil iPhone physique testé.

Ne pas relancer `blob:seed` après des modifications de Julie sans relire et sauvegarder le catalogue distant. Les futures captures doivent être régénérées à partir des données distantes courantes, car les révisions locales ne suivent pas les modifications de production.
