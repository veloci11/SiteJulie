# Dimensions, cadrage et mur D de la salle 2

## Référence de taille

Saisir ou modifier les dimensions réelles en **centimètres** définit le nouveau **100 %** et remet le tableau à cette taille, dans la place libre. Le pourcentage peut ensuite dépasser 100 %, jusqu’à la limite des bords et des voisins. Réouvrir, sauvegarder ou modifier un autre champ conserve ce réglage manuel. « Revenir à 100 % » reprend explicitement les dimensions.

Les proportions de l’image sont préservées : lorsque le ratio saisi ne correspond pas à celui de la photo, celle-ci est ajustée dans le rectangle déclaré, sans étirement. La référence indique les dimensions saisies ; les champs showroom montrent les dimensions effectivement rendues. Sans dimensions réelles, le pourcentage conserve sa référence de zone antérieure.

`displayScale` conserve sa représentation géométrique existante. `showroomReference` traduit cette valeur en pourcentage de la référence réelle ; aucune migration des tailles enregistrées n’est nécessaire. La conversion vers la taille réelle intervient à la saisie, et après le premier traitement d’image lorsqu’elle n’était pas encore connue. Modifier une métadonnée directement hors de l’atelier ne redimensionne donc pas spontanément la galerie. Le placement automatique cherche d’abord une zone compatible qui conserve la taille demandée ; si toutes imposent une réduction, il retient la plus grande taille lisible disponible. Les autres tableaux gardent leurs dimensions et leur position.

## Caméra et promenade

La sélection reste fondée sur l’identifiant unique de chaque œuvre. Le focus utilise sa position effective, ses décalages et sa taille enregistrée, avec la place occupée par les contrôles HTML. Les tests projettent les coins des cadres et vérifient qu’ils restent dans la partie visible, y compris pour les petits formats et les œuvres superposées.

La promenade considère le rectangle englobant des œuvres d’une même zone. Elle dirige ainsi son regard et adapte son champ de vision à l’ensemble de l’accrochage : un tableau inférieur n’est plus ignoré lorsque sa position horizontale coïncide avec celle du tableau supérieur. Les pieds continuent le parcours existant, sans nouvelle trajectoire traversant le décor. Un clic cadre toujours une seule œuvre.

## D centre

La salle 2 possède une zone supplémentaire au centre du mur D, entre D1 et D2. Elle dérive de l’ancre GLB 12 avec un décalage de −3,5 m en X ; elle correspond au vrai mur terminal fermé. Les identifiants des anciennes zones restent inchangés.

La zone est retirée des choix lorsque la salle 3 existe. L’ajout de cette salle est refusé tant qu’une œuvre publiée occupe D centre, car un passage remplacerait son support. Il faut d’abord déplacer les œuvres concernées. La migration SQL `202609220002_terminal_hanging_zone.sql` prépare le même contrat pour Supabase ; elle n’a pas été appliquée à un service distant. Le site utilise Blob.

## Vérifications

```sh
npm test
npm run build
node --import tsx scripts/admin-dimensions-camera-qa.mjs
node --import tsx scripts/admin-initial-size-qa.mjs
```

Le scénario navigateur utilise une copie jetable du catalogue et des médias. Il vérifie : 100 % en cm, agrandissement et persistance, nouveau 100 % après changement de dimensions, conservation des autres œuvres, D centre et sa sauvegarde, refus d’ouvrir un passage sous le tableau, Chrome/WebKit, interface mobile et projection des coins dans le vrai WebGL pour quatre œuvres sur ordinateur et téléphone simulé. Il termine par une reprise de promenade depuis D centre. Les posters d’arrivée sont isolés de ce scénario ; le statut est simulé comme prêt pour éviter des rendus concurrents.

Rapport et captures : `artifacts/admin-dimensions-camera/`. Campagne réussie sur la copie de livraison le 22 septembre 2026 à 06:04 UTC, sans erreur JavaScript ni violation axe sur l’écran WebKit instrumenté. Les données principales sont restées inchangées et les serveurs de test ont été arrêtés. Le contrôle ne constitue pas une mesure sur téléphone physique ni une garantie générale d’absence de bugs.

Les 312 tests unitaires et de contrat passent (26 fichiers). Un test de régression vérifie qu’une zone offrant une place à 100 % est préférée à une zone occupée qui imposerait une réduction. Le scénario `admin-initial-size-qa.mjs` couvre aussi un nouvel import avec les dimensions saisies avant l’image : 50 × 90 cm, publication, réouverture et géométrie publique. Ce scénario a réussi à 06:13 UTC, sans erreur JavaScript et sans modification du catalogue principal ; rapport et capture dans `artifacts/admin-initial-size/`. La compilation de la copie de livraison a également réussi.
