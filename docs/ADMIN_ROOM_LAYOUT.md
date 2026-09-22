# Réorganiser une salle

Le mode est accessible dans **Les œuvres → Réorganiser la salle 1/2…**. Il concerne les œuvres déjà publiées de la salle choisie. Pour ajouter une nouvelle œuvre ou changer une collection, utiliser les fiches de l’atelier.

## Utilisation

1. Repérer les murs A/B/C/D sur le plan vu du dessus. Les lettres restent fixes ; les boutons au-dessus du mur permettent de changer de vue sans revenir au plan. Le plan reste toujours déplié, sur ordinateur comme sur téléphone.
2. Sélectionner un tableau, puis **Mettre en réserve**, ou le glisser dans la barre du bas à la souris. **Tout mettre en réserve** prépare une réorganisation complète. Rien ne disparaît de la galerie pendant les essais.
3. Choisir une miniature dans la réserve, puis une zone en pointillés ou **Ajouter ici**. Une zone accueille plusieurs tableaux : A2 contient aussi l’ancien tableau « A2 bas ». Seul le nouvel arrivant est ajusté à l’espace restant, sans déplacer ni redimensionner les œuvres présentes. Si le petit côté devrait passer sous 25 cm, l’ajout est refusé et le tableau reste en réserve. Les pointillés de toutes les zones restent visibles.
4. Sélectionner un tableau et tirer la poignée ↘ pour le redimensionner, ou ouvrir **Ajuster la taille et la position** pour saisir sa largeur/hauteur dans le showroom. Ces tailles sont indépendantes des dimensions réelles de la description et conservent le ratio de l’image. Le redimensionnement s’arrête avant les bords et les cadres voisins. Les autres débordements et chevauchements sont signalés. **Annuler le geste**, **Rétablir** et **Remettre comme dans la galerie** permettent de revenir en arrière.
5. **Enregistrer le brouillon** garde une disposition privée, même avec des tableaux en réserve ou des ajustements géométriques à terminer. **Reprendre le brouillon** la retrouve après fermeture ou reconnexion. Il existe un brouillon par salle, remplacé à chaque nouvel enregistrement explicite ; il ne s’agit pas d’une sauvegarde automatique.
6. **Appliquer à la galerie** devient disponible lorsque tous les tableaux sont placés sans erreur. La disposition entière est validée et enregistrée en une opération, ce qui permet les échanges dans une salle pleine. Le brouillon de cette salle est alors retiré.

Le retour aux œuvres propose d’enregistrer le brouillon, de continuer ou de quitter sans garder les derniers changements. Quitter sans garder ne supprime pas un brouillon déjà enregistré. Fermer/recharger l’onglet avec des essais en attente déclenche l’avertissement natif du navigateur lorsqu’il le prend en charge. Sur les appareils susceptibles de suspendre brutalement un onglet, enregistrer explicitement le brouillon avant de quitter.

La salle reste verrouillée pendant l’édition : aucun transfert entre salles, ni changement de collection, d’ordre, de publication, de prix ou d’image. Le bouton de retour permet d’en choisir une autre depuis la liste. Une erreur de réseau ou de session conserve les essais en mémoire ; réessayer après rétablissement de la connexion. En cas de modification concurrente, la sauvegarde est refusée et le rechargement de la version enregistrée demande confirmation.

## Stockage et validation

L’API privée `GET/POST /api/admin/room-layout` exige la session administrateur ; les mutations vérifient aussi l’origine. Le schéma strict accepte uniquement les identifiants/révisions des œuvres et leurs emplacements, décalages et tailles d’accrochage. Le serveur impose l’ensemble exact des œuvres publiées de la salle, leurs révisions, l’appartenance des emplacements et l’unicité des œuvres, leurs limites et l’absence de chevauchement. Plusieurs œuvres peuvent partager le même identifiant de zone.

Le stockage JSON local et Vercel Blob ajoutent le champ facultatif `roomLayoutDrafts`, indexé par salle, avec `version` UUID, `savedAt` et `plan`. Cette extension accepte les catalogues existants sans migration de données. Le parseur Blob conserve et valide les brouillons lors des autres écritures du catalogue. La projection publique ne les expose jamais.

L’application construit la disposition finale, la valide avant toute écriture, puis modifie uniquement les placements concernés et leurs révisions. La transaction locale utilise la file d’écriture et le remplacement atomique du fichier ; Blob utilise également son contrôle ETag. Le jeton du brouillon empêche un onglet ancien d’écraser une sauvegarde plus récente. Les autres salles et leurs brouillons restent intacts. Une ancienne sauvegarde devenue incompatible avec les œuvres actuelles est signalée à l’ouverture ; elle n’est remplacée qu’au prochain enregistrement explicite.

Le mode est disponible pour les adapters local et Blob. Il n’est pas activé dans l’interface Supabase et l’API refuse cette configuration : aucune migration Supabase de disposition collective n’a été ajoutée ni exécutée. Aucun service distant n’a été modifié ou testé pendant cette intervention.

## Historique des vérifications avant les zones partagées

La campagne actuelle est décrite dans [ADMIN_ZONES.md](ADMIN_ZONES.md). Les résultats ci-dessous concernent le modèle précédent.

Commande reproductible sur une copie temporaire des 26 œuvres locales :

```sh
npm run typecheck
npm run build
npx vitest run tests/room-layout.test.ts tests/blob-data.test.ts tests/blob-admin.test.ts tests/admin.test.ts tests/placement.test.ts tests/placement-guide.test.ts tests/public.test.ts
node scripts/admin-room-layout-qa.mjs
```

Les 59 tests des sept suites passent : sessions, confidentialité, reprise, échanges atomiques, absence de modification partielle, isolation des salles, révisions concurrentes, schémas invalides, conservation Blob simulée et régressions des placements/fiches existants.

La campagne navigateur utilise Chrome 1440 × 1050 et 390 × 844, un panneau étroit de 300 × 750, le format paysage 844 × 390, ainsi que WebKit 390 × 844. Elle couvre réserve individuelle et collective, annuler/rétablir, échange dans une salle complète, brouillon/reprise, avertissement de sortie, abandon sans altération du brouillon enregistré, refus d’application incomplète, refus d’une salle étrangère, origine étrangère, vrai glisser-déposer à la souris, erreur serveur simulée avec nouvelle tentative, deux onglets concurrents, clic tactile simulé, clavier et saisie numérique incomplète.

Dernière campagne réussie le 22 septembre 2026 à 02:05:05 UTC, après ajout du redimensionnement et du plan toujours ouvert : `artifacts/admin-room-layout/report.json`. Les captures réelles se trouvent dans le même dossier : `room-editor-desktop.png`, `room-editor-mobile-viewport.png`, `room-plan-mobile.png`, `room-editor-landscape.png`, `unsaved-exit-mobile.png`, `room-editor-webkit.png`. Aucun débordement horizontal ni erreur JavaScript dans les écrans instrumentés ; zéro violation axe sur la fenêtre de sortie Chrome et l’éditeur WebKit. Ce contrôle ne constitue pas une certification d’accessibilité, une mesure de fluidité GPU ou un test sur téléphone physique.

La vérification complémentaire des tailles indépendantes, de la poignée et du rendu WebGL est décrite dans [ADMIN_SHOWROOM_SIZE.md](ADMIN_SHOWROOM_SIZE.md).

Les données publiques ont été comparées avant/après les essais et après application ; les métadonnées et la seconde salle restent identiques. L’empreinte du catalogue principal reste inchangée et le serveur/la copie d’acceptation sont supprimés. La prévisualisation de développement sur le port 3011 reste disponible séparément. Aucun déploiement.
