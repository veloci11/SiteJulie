# La galerie — musée d’artiste en 3D

Application Next.js/React/Three.js, avec huit œuvres fournies, deux salles contemporaines, une promenade continue et un atelier d’administration. **La version livrée est une démonstration locale persistante.** Les raccordements Supabase et hébergement sont préparés mais ne sont pas configurés.

## Ouvrir le projet

Node 24 est utilisé (Next exige au minimum 20.9). Dans ce dossier :

```sh
npm ci
cp .env.example .env.local
npm run media:prepare
npm run dev
```

Ouvrir http://127.0.0.1:3000 ; l’atelier est à http://127.0.0.1:3000/admin. Pour les fichiers déjà présents sur cet ordinateur, le serveur et les variantes ont été préparés. `media:prepare` reconstitue les variantes et le seed depuis `ImageOeuvre/`, sans toucher aux originaux ni à un `data.json` existant.

Les sources privées `ImageOeuvre/` et `references/` ne sont pas versionnées/publiées. Une nouvelle copie sans ces dossiers ne possède pas le jeu d’essai : fournir ses propres œuvres via l’atelier ou remettre les sources privées pour exécuter le script. Les neuf JPG comprennent huit tableaux et un doublon SHA-256 exact. Aucune œuvre n’est redessinée, recadrée ou étirée.

## Visiter et gérer

- L’accueil propose une vue d’ensemble puis parcourt lentement la salle en boucle, sans arrêt devant les peintures, balancement, roulis ni zoom. Aucun contrôle play/pause ne couvre la scène. Changer de salle fait avancer la caméra à travers le portail et rejoint la promenade dans la nouvelle pièce. Sélectionner une œuvre l’arrête ; revenir à la salle relance la promenade. La préférence système de mouvement réduit arrête la promenade ; un menu de sélection ouvert ou un onglet masqué la suspend également.
- Menu, tableaux et miniatures passent par la même navigation. Le dernier clic l’emporte. Échap, la croix et un clic dans le vide ferment la fiche et reprennent automatiquement la promenade depuis la caméra actuelle. Pendant le déplacement vers une œuvre, un clic dans la scène annule ce déplacement, même si un tableau glisse sous le pointeur. Le raccord part de la position et de la vitesse rendues ; une courte décélération évite les virages trop serrés. Il suit le sens de circulation, sans retour à l’accueil ni recadrage de l’image. Au seuil d’une porte, il continue vers la salle dans laquelle on entre. Les fenêtres À propos et Contact laissent continuer la visite. Un sélecteur affiche seulement le nom de la collection. Les commandes « Précédente » / « Suivante » et les flèches gauche/droite changent d’œuvre dans la collection courante et un bouton permet de passer le déplacement. Les miniatures affichent le prix public et la disponibilité ; le bandeau reste déployé sur ordinateur.
- « Visages » et « Récits & paysages » sont les regroupements de travail des huit tableaux : une collection par salle, des décors et compositions différents, des plafonds fermés, des panneaux de noyer intégrés aux murs et deux figuiers matures. Celui du salon constitue un point central décalé ; les sculptures et les assises varient. Les photographies des œuvres restent indépendantes du décor.
- « À propos » et « Contact » sont des fenêtres centrées : la promenade continue dans la salle courante derrière et à la fermeture, sans changement de position ni redémarrage de la boucle. Aucune inscription éditoriale n’est plaquée au mur.
- Une œuvre vendue reste exposée avec un rendu atténué et un cartel « VENDUE ». Ses miniatures sont désaturées ; les images sources restent intactes.
- Les URL `/?vue=oeuvre&slug=…`, `/?vue=apropos`, `/?vue=contact&oeuvre=…` sont partageables et prennent en charge retour/avance. Le catalogue `/oeuvres` et ses fiches restent utilisables sans WebGL.
- `/admin` permet d’ajouter une image, éditer les textes/prix/disponibilités, choisir visuellement une salle, un mur et une zone, glisser le tableau ou régler sa position en centimètres et sa taille de présentation, publier/archiver, changer de collection et choisir la position 1 à N dans cette collection. La création de collection permet d’activer explicitement une salle supplémentaire, dans la limite de quatre salles. L’image peut être choisie avant le titre, avec aperçu local ; l’enregistrement reste explicite et les saisies en attente sont protégées. Les données locales persistent dans `.local/` et ne sont jamais envoyées à un service tiers.
- Aucun vrai nom, prix, email, biographie, technique ou dimension n’a été inventé. Les titres sont provisoires ; l’échelle dans le musée est illustrative. La disponibilité initiale est à confirmer. Le contact reste désactivé jusqu’à renseignement de l’email et ouvre ensuite l’application de messagerie : aucun envoi serveur.

Les aperçus des salles se régénèrent automatiquement après modification de l’accrochage dans l’atelier local. La galerie déjà ouverte récupère les changements au retour dans l’onglet ; le menu recharge les nouvelles captures dès qu’elles sont prêtes. Les captures périmées ne sont plus servies. Le générateur local nécessite Chrome installé ; il ne constitue pas un service de rendu Supabase déployé.

Voir [le guide de placement et disponibilité](docs/ADMIN_PLACEMENT.md) et [le guide d’administration et Supabase](docs/ADMINISTRATION.md).

## Contrôles et assets reproductibles

```sh
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

Les tests navigateur utilisent le Chrome installé et SwiftShader pour WebGL dans l’environnement automatisé. Ce mode teste le rendu réel de Three.js, mais ses performances ne représentent pas celles d’un GPU physique. Les tests d’administration emploient des fixtures temporaires ; voir `scripts/admin-browser-qa.mjs` et le compte rendu QA.

Blender 5.2.1 LTS a effectivement produit les fichiers `.blend` et `.glb`. La géométrie, les UV et les atlas de lumière se régénèrent avec les commandes du [guide Blender](scripts/blender/README.md). Les tableaux et les textes restent dynamiques, hors du décor. Les modèles architecturaux et figuiers sont originaux ; les textures externes de matériaux utilisées et leurs licences CC0 sont documentées dans [Licences et provenance](ASSET_LICENSES.md).

L’image visible avant la 3D est une capture du vrai musée. Après un changement d’architecture ou d’accrochage, construire/redémarrer puis lancer `npx tsx scripts/capture-arrival.ts`. Les captures comportant des œuvres restent privées ; une capture périmée est remplacée par un repli architectural sans tableaux.

## Mise en ligne ultérieure

Guide pas à pas pour **GitHub → Vercel → juliethiam.art chez Infomaniak** :
[Mise en ligne et configuration](docs/MISE_EN_LIGNE.md).

Aucun déploiement n’a été effectué. Configurer un Supabase de développement, exécuter la migration, créer l’administrateur et vérifier ses politiques avec les étapes du guide. Renseigner les données réelles de l’artiste et confirmer l’autorisation de diffusion des variantes web avant publication. Le mode local est une prévisualisation et ne doit pas être exposé publiquement.

Next.js peut être déployé sur un hébergement Node ou Vercel avec les variables d’environnement. Le Dockerfile est fourni comme option Node autonome (construction Docker non testée). Il exclut données privées et références. `npm start` reste lié à localhost ; le conteneur utilise son interface réseau interne habituelle. Aucun traitement Blender n’est lancé au runtime.

Les sources de versions vérifiées sont [Next.js](https://nextjs.org/docs/app/getting-started/installation) et [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction), avec les peerDependencies publiées sur npm le jour de l’installation. React 19.2.4 reste compatible avec Fiber 9.7.0, qui exclut React 19.3. Le lockfile fixe toutes les dépendances.

[Finitions actuelles, confort de caméra, captures et mesures](docs/FINITIONS_V7.md) · [Audit de livraison locale](docs/DELIVERY_AUDIT.md). L’[itération contemporaine précédente](docs/CONTEMPORARY_EXHIBITION.md) et le [premier compte rendu](docs/VERIFICATION.md) conservent les résultats historiques.

La prévisualisation standalone est préparée par `scripts/start-local.mjs` : copie des assets de build, lecture de `.env.local`, écoute limitée à `127.0.0.1`. Arrêter ce serveur avant de relancer `npm run dev` sur le même port. Éviter un build simultané avec des captures du serveur dev ; utiliser la sortie de production pour les contrôles finaux.
