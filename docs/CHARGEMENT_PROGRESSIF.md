# Chargement progressif et réutilisation des images — 21 septembre 2026

## Comportement

La salle d’arrivée charge ses tableaux, sa géométrie et son mobilier en priorité. Son affichage et ses commandes deviennent disponibles dès que ces ressources sont prêtes. Après un délai de 650 ms laissant apparaître la visite, les autres salles se préparent successivement en arrière-plan. Un lien direct vers la salle 2 donne la priorité à cette salle.

Chaque salle possède sa propre frontière Suspense et son traitement d’erreur. Un échec dans une salle préchargée ne retire pas la salle déjà visitable. Une demande de déplacement donne immédiatement la priorité à la destination et aux éventuelles salles intermédiaires. La caméra conserve la dernière destination prête tant que ce trajet ne peut pas être rendu ; la dernière sélection demandée l’emporte. Un libellé « Préparation de la salle… » explique cette attente. Le Canvas et le contrôleur de caméra restent uniques.

Les images du catalogue classique et des murs utilisent la même URL de variante, avec le même mode CORS. Les réponses publiées ont un cache navigateur privé de 60 secondes, puis une revalidation ETag. Les médias Blob sont transmis directement par l’API à URL stable, sans nouvelle redirection signée à chaque affichage. Le SDK reçoit l’ETag pour éviter de retransférer un objet inchangé côté serveur également. L’adaptateur Supabase transmet la réponse de son URL approuvée côté serveur ; le navigateur ne reçoit pas cette signature. Le stockage local calcule l’ETag depuis les octets du fichier.

Les images administratives non publiées restent `no-store`. Toute requête effectivement reçue par le serveur revérifie la publication ou la session avant une réponse 200/304. Une image déjà autorisée peut rester dans le cache navigateur jusqu’à 60 secondes après dépublication, comme la fenêtre des anciennes signatures. Les nouveaux médias ont une nouvelle URL de version ; les brouillons et les originaux ne sont pas rendus publics par ce cache.

Le catalogue ne donne la priorité qu’aux trois premières cartes effectivement affichées ; les suivantes utilisent le chargement natif différé. L’image de la fenêtre éditoriale n’est demandée qu’à son ouverture. Le fondu d’arrivée passe de 1,2 seconde à 0,4 seconde, et l’attente de mise en route de la promenade est alignée (aucun délai avec mouvement réduit).

Les captures automatiques d’arrivée constituent un cas distinct : elles attendent toutes les salles, y compris celles visibles au travers des portes. Cela concerne le cadre de capture authentifié et les scripts serveur/local.

## Mesures et vérifications

Mesure dans Chrome 153 sur Mac arm64, macOS 26.5.2, GPU natif, fenêtre 1440 × 900, mouvement réduit, serveur de développement local, réseau non bridé et contexte navigateur neuf. Les captures mobiles sont une émulation de dimensions, pas une mesure sur GPU de téléphone.

- Avant : 10 925 830 octets d’images retransférés lors de l’ouverture du catalogue.
- Après : 0 octet supplémentaire pour les tableaux déjà chargés, y compris après défilement et décodage de toutes les cartes. Le test ne détourne pas les requêtes, car cette interception désactiverait le cache navigateur.
- Avant : toute la collection attendue ; après : 14 images de salle sur 26 avant la première scène prête, avec seulement les modèles propres à la salle d’arrivée et les ressources partagées.
- Mesures ponctuelles de première scène prête : 2 503 ms avant, 1 968 ms après. Ce sont deux observations locales, pas une garantie de gain sur chaque appareil ou connexion. L’indépendance vis-à-vis de l’autre salle est vérifiée séparément en bloquant son réseau.

Preuves : `artifacts/loading-qa/before.json`, `after.json` et captures dans le même dossier. `scripts/loading-qa.mjs` reproduit la mesure du cache et vérifie le décodage de chaque image. `tests/e2e/loading.spec.ts` bloque l’autre salle pour les deux entrées, sélectionne une œuvre locale, demande successivement deux œuvres distantes, libère les images et vérifie la dernière sélection ainsi que la conservation du Canvas. Il vérifie aussi qu’une erreur de préchargement n’enlève pas la salle déjà ouverte.

Les tests de cache utilisent un stockage Blob simulé et vérifient cache publié, ETag/304, nouvelle version, refus anonyme après dépublication, absence de cache administrateur et variantes autorisées. Aucun accès en écriture aux stockages de production. Les modifications ne sont pas déployées.

Validation exécutée : compilation Next.js et TypeScript réussis ; suite de 276 tests unitaires réussie, puis les 9 tests du cache média réussis après ajout des 3 cas Supabase. Les 8 parcours Chrome (expérience + chargement) ont réussi sur serveur compilé. Après réduction de la barre et suppression de tous les accès publics à l’administration, les 5 parcours d’expérience ont été rejoués avec succès sur le nouveau build, ainsi qu’un contrôle WebKit 26.6 à 390 × 844. La barre mesurée fait 58 px sur ordinateur et 52 px sur téléphone ; aucune erreur JavaScript dans le contrôle WebKit. Le script de capture automatique a produit deux lots complets avant/après une sauvegarde administrative, avec contrôle du refus anonyme et conservation des données de travail.

Pendant les vérifications, un changement de placement de plantes en cours dans le dépôt a temporairement bloqué la promenade ; les parcours ci-dessus ont été rejoués après sa correction. Les scripts temporaires de mesure sous `artifacts/` sont exclus du contrôle TypeScript de l’application ; ils ne font pas partie du produit compilé.
