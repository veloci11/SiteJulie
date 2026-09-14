# Contrats techniques — Galerie 3D

Ces contrats précisent les invariants du produit. Les exemples de noms et types sont des propositions d’architecture à adapter de manière cohérente, pas des API promises par une bibliothèque. Les chiffres sont des budgets de départ à tester.

## A. Séparation des responsabilités

`MuseumShell` contient la navigation HTML, la gestion de l’URL, l’état de chargement et le carrousel. `MuseumCanvas` est un composant client unique ; `MuseumScene` contient l’environnement, les tableaux et les ancres éditoriales. `CameraDirector` est le seul composant autorisé à piloter les mouvements programmatiques.

`ArtworkRepository` expose les données publiques normalisées, sans secrets ni champs administratifs. Les implémentations de démonstration, Vercel Blob et Supabase partagent ce contrat. Le mode démo doit être explicite et ne doit pas devenir une authentification fictive en production.

`AdminService` applique validation et autorisation à chaque mutation. `MediaService` gère chargement privé, variantes, droits de lecture et suppression différée. `PublicationService` orchestre traitement média, métadonnées, occupation d’emplacement et invalidation des données publiques.

Arborescence indicative :

```text
app/
  (public)/page.tsx
  (public)/oeuvres/page.tsx
  (public)/oeuvres/[slug]/page.tsx
  (public)/a-propos/page.tsx
  (public)/contact/page.tsx
  admin/
  api/                          # seulement les endpoints nécessaires
components/
  museum/
    MuseumShell.tsx
    MuseumCanvas.tsx
    MuseumScene.tsx
    CameraDirector.tsx
    ArtworkFrame.tsx
    ArtworkCarousel.tsx
    ArtworkDetails.tsx
    EditorialWall.tsx
    ContactWall.tsx
  admin/
lib/
  museum/                      # contrat scène, fit caméra, graphe, collisions
  data/                        # repositories et DTO publics
  media/                       # traitement et signature serveur
  auth/                        # session et autorisations
  validation/
supabase/migrations/
scripts/blender/
public/museum/                 # GLB et textures du décor, pas les originaux
references/                    # matériel de travail, pas publié automatiquement
tests/
```

Les formes exactes du routage Next.js peuvent être adaptées aux versions installées. Ne mets pas `ssr: false` dans un Server Component qui ne l’autorise pas : la frontière d’import de la scène doit être un composant client approprié.

## B. Référentiel spatial unique

Unité de scène : mètre ; convention runtime : Y vers le haut. Blender utilise un autre axe vertical par défaut ; l’export doit convertir aussi les ancres, normales et caméras, pas seulement le mesh. Le contrat d’export doit être vérifié par un test de transform.

```ts
type Vec3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];
type Destination =
  | { kind: 'home' }
  | { kind: 'room'; roomId: string }
  | { kind: 'artwork'; artworkId: string }
  | { kind: 'about' }
  | { kind: 'contact'; artworkId?: string };

type ArtworkSlot = {
  id: string;
  roomId: string;
  position: Vec3;                  // centre d’accrochage, repère local de salle
  rotation: Quaternion;
  wallNormal: Vec3;                // vers l’espace de circulation
  maxWidthM: number;
  maxHeightM: number;
  approachNodeId: string;
  retreatNodeId: string;
};

type RoomInstance = {
  id: string;
  templateId: string;
  position: Vec3;
  rotation: Quaternion;
};
```

La géométrie du décor et le manifeste doivent venir d’une source commune. Les noms des nœuds GLB ou leurs propriétés exportées peuvent porter les ancres. En cas de fichier JSON parallèle, versionne sa compatibilité avec le GLB. Vérifie au démarrage les ancres manquantes ou dupliquées ; ne rends pas une œuvre à l’origine `(0,0,0)` par défaut.

Un emplacement exprime une contrainte d’accrochage, pas un prix, une légende ou une texture. Un cadre est reconstruit selon le ratio et les dimensions d’affichage de l’œuvre. Prévois une marge par rapport aux murs, cartels, cadres voisins et ouvertures.

## C. État et trajets de caméra

États possibles : `loading`, `idle`, `traveling`, `focused`, `fallback`. Conserve aussi `requestedDestination`, `activeDestination` et un numéro monotone de transition. Ce numéro empêche une animation ou un téléchargement ancien de finaliser une destination abandonnée.

Chaque destination d’œuvre se déduit de la pose de son emplacement et de son encombrement réel. Dans une vue frontale non masquée, un calcul de départ est :

```text
hFov = 2 * atan(tan(vFov / 2) * aspect)
distance = max(
  (height / 2) / tan(vFov / 2),
  (width  / 2) / tan(hFov / 2)
) * margin
cameraPosition = worldCenter + worldNormal * distance
```

Cette formule est géométrique, pas une API. `width` et `height` incluent le cadre. Ne l’utilise pas telle quelle lorsqu’une fiche masque une partie de l’écran : calcule la zone utile, ses marges et son décentrage, ou utilise une projection décalée adaptée. Vérifie les quatre coins projetés dans le rectangle utile. `fitToBox` peut aider au cadrage ; il ne remplace ni cette vérification ni le calcul d’itinéraire.

Les positions de caméra sont dérivées, pas saisies pour chaque tableau par l’artiste. L’orientation des murs varie : le calcul doit fonctionner sur tous les côtés de la salle, et avec un groupe de salle transformé.

Itinéraire type : pose actuelle → retrait de l’œuvre actuelle → axe de circulation de la salle → ouverture éventuelle → axe de la salle cible → approche → focus. Les graphes de salles partagent des nœuds de portail. Un graphe petit et déterministe suffit ; utilise Dijkstra/A* seulement si cela simplifie le routage.

Valide le passage d’un volume de caméra, pas seulement d’un point. Vérifie les obstacles simplifiés et la marge du near plane dans les transitions. Si une courbe est utilisée, vérifie ses échantillons et les raccordements avec les obstacles. Le « collision support » éventuel d’une bibliothèque ne prouve pas qu’un trajet est sûr dans toute l’architecture.

Un seul système écrit la pose à un instant donné. CameraControls et un tween indépendant ne doivent pas se battre. Documente la reprise depuis la pose courante, l’arrêt, la durée, le réveil du rendu à la demande et la fin du déplacement. Sur un deuxième clic, annule proprement ou mémorise uniquement la dernière destination ; n’exécute pas une file de vingt anciens trajets.

Teste les transitions aller-retour entre chaque type de lieu, des murs opposés, une salle supplémentaire, et trois sélections rapides pendant le chargement d’une texture.

## D. Base de données proposée

`artworks` : UUID, slug unique, titre, description publique, technique facultative, année facultative, largeur/hauteur/profondeur en centimètres facultatives, prix en unité monétaire mineure, devise, visibilité du prix, disponibilité, publication, timestamps et révision pour détecter une édition concurrente.

Disponibilité : `available | reserved | sold`. Publication : `draft | published | archived`. Visibilité du prix : `public | on_request`. Ce sont trois axes différents. Autorise le prix nul uniquement avec « sur demande » ; refuse négatifs et devises invalides. Pour les devises prises en charge au départ, EUR/CHF/USD, les prix sont des entiers de centimes ; ne prétends pas que toutes les devises ont deux décimales.

`artwork_media` : UUID, artwork_id, rôle, variante, chemin privé, largeur/hauteur en pixels, MIME, taille, checksum, version, ordre, état de traitement. Les prix cachés et les notes privées ne doivent pas être renvoyés dans le DTO public.

`artwork_private` : informations strictement administratives séparées, dont prix interne si nécessaire et notes. Une politique RLS filtre des lignes, pas automatiquement toutes les colonnes d’une ligne publique. Utilise une projection/une vue sécurisée ou des tables séparées ; teste aussi l’accès direct à l’API de données.

`rooms` : instance, template, ordre, état d’activation. `placements` : artwork_id, room_id, slot_id, style de cadre et éventuellement taille d’exposition. Contraintes d’unicité sur l’emplacement occupé et sur l’affectation courante d’une œuvre. Toute affectation de slot doit être compatible avec le manifeste déployé.

`site_settings` : contenu public de l’artiste et des trois zones éditoriales, coordonnées publiques voulues par l’artiste, liens facultatifs, devise par défaut. Conserve les éventuels secrets d’envoi hors de cette table publique.

`admin_memberships` : UUID de compte autorisé et rôle ; pas d’auto-attribution par le client. Un journal administratif minimal peut enregistrer auteur, opération et cible sans stocker les secrets ni les messages des visiteurs.

Publication : transaction ou orchestration récupérable validant les champs, les médias prêts et l’affectation de salle. Si une salle est pleine, affiche le choix d’extension. La génération de géométrie du module existe déjà côté application ; publier une œuvre ne déclenche pas Blender.

Le DTO public est un contrat explicite et testé. Il contient uniquement les œuvres publiées, les prix publics, les médias autorisés et les champs de présentation utiles. Une vue PostgreSQL doit préserver les règles d’accès au lieu de contourner involontairement RLS.

## E. Stockage et images

Buckets privés pour sources, brouillons et variantes. L’API publique reçoit un identifiant d’œuvre, vérifie la publication, choisit des variantes autorisées et renvoie des URLs signées. Une URL déjà signée peut rester valide jusqu’à expiration après dépublication ; documente un TTL court approprié et n’affirme pas une révocation immédiate absolue. Les caches et journaux ne doivent pas conserver les tokens inutilement.

Le pipeline de téléversement crée un enregistrement en attente lié à l’administrateur et au brouillon, autorise un chemin déterminé, puis vérifie que le fichier final correspond au propriétaire, au MIME décodé, à la taille et à la limite de pixels. Les clés objet sont générées côté serveur. Interdire la signature de chemins libres et la lecture arbitraire d’URLs distantes par le processeur d’images.

Budgets initiaux suggérés : 20 Mio par source et 25 mégapixels maximum décodés, à adapter après tests sur l’hébergement. Génère des variantes de largeur maximale 320, 768, 1536 et éventuellement 2048 pixels, jamais plus grandes que la source. Préserve les sources ; ne détruis pas les métadonnées du fichier de référence original lors d’une transformation destinée au site.

Pour le runtime, les photographies sont sRGB. Les normal maps et roughness maps du décor ne le sont pas. Vérifie l’absence de double conversion ou de double tone mapping. Pour les faces peintes, privilégie un matériau dont l’éclairage ne dénature pas l’œuvre, ou un traitement calibré comparé à la fiche 2D. Les cadres et murs peuvent recevoir la lumière chaude.

Des octets compressés sur le réseau ne représentent pas directement la mémoire GPU après décodage. Estime textures + mipmaps + buffers, surveille les ressources et limite le nombre de variantes détaillées. Les URLs signées changeantes ne doivent pas multiplier les copies de texture pour un même identifiant/version/variante.

## F. Fabrication Blender et export web

Fournis un script reproductible, par exemple `scripts/blender/build_museum.py`, un fichier de configuration et les sources `.blend` effectivement créées. Vérifie la version et l’exécutable avant d’affirmer que le script fonctionne. Une commande type, à adapter au système, est :

```bash
blender --background --python scripts/blender/build_museum.py
```

Le script doit produire le hall, les alcôves, un module d’extension et les ancres spatiales. Utilise des courbes/meshes corrects pour les arches et de vrais passages ; pas de texture dessinant une porte sur un mur fermé.

Rends quelques aperçus pour composer la scène, puis exporte un GLB optimisé et inspecte-le dans le navigateur. Une belle image Cycles ne valide pas un export web. Tous les nœuds procéduraux et comportements d’éclairage Blender ne se transfèrent pas automatiquement à glTF/Three.js. Convertis les matériaux compatibles, calcule les textures nécessaires et réaffecte les données explicitement.

Pour les zones statiques, les ombres et une partie de l’éclairage peuvent être précalculées. Choisis un montage exportable : texture finale avec matériau non éclairé pour les surfaces concernées, ou lightmap/AO proprement reliée dans le runtime. Ne double pas l’éclairage en appliquant une seconde lumière complète à une texture déjà éclairée. Teste UV, normales, échelle de texture, transparence, couleurs et bords.

Les tableaux et textes éditoriaux restent hors du bake. L’éclairage précalculé ne doit pas laisser la silhouette fantôme d’une œuvre supprimée. Les cadres dynamiques utilisent seulement les ombres légères nécessaires.

Utilise au départ des géométries et matières générées. Pour des matériaux/scans externes, enregistre URL, auteur, licence et fichier utilisé dans `ASSET_LICENSES.md`. Ne télécharge pas des modèles depuis une recherche d’images sans licence vérifiée. Aucun fichier de police commercial ne doit être redistribué sans droit.

Compression de meshes et textures GPU peut être ajoutée si les codecs et décodeurs sont installés et testés. Un format compressé non décodable n’est pas une optimisation. Prévois une chaîne sans cet outil facultatif pour ne pas bloquer le prototype.

## G. HTML spatial, URL et accessibilité

Les titres courts peuvent employer du texte 3D. Les paragraphes et boutons utilisent du DOM ancré à des surfaces, avec occlusion et taille contrôlées. L’occultation visuelle seule ne suffit pas : désactive interaction et tabulation sur les contenus inactifs. Évite que les murs Contact et About lisent simultanément deux longs contenus au lecteur d’écran.

Ne piège pas le scroll global ou le clavier avec la caméra. Le formulaire/les boutons HTML prennent les événements sans déclencher aussi une rotation 3D. Prévois focus cohérent à l’arrivée, restauration à la fermeture, annonces sobres, tabulation et clavier mobile.

Le store de navigation et l’URL se mettent à jour sans boucle. En chargement direct d’une œuvre, cadre-la immédiatement une fois prête ; n’impose pas un long parcours depuis l’entrée. Préserve l’œuvre sélectionnée au changement 2D/3D et lors du partage de lien.

L’HTML public, ses métadonnées et le sitemap utilisent uniquement le repository public. Le musée est un enrichissement, jamais l’unique moyen d’accéder au texte, au prix ou au contact.

## H. Vérifications et budgets initiaux

Objectifs de conception, à réviser selon mesures : une première scène interactive dans une enveloppe réseau d’environ 8–15 Mo, jamais tous les originaux ; moins de quelques centaines de draw calls dans la vue courante ; résolution plafonnée et dégradation progressive sur téléphone. Les effets de sol et les plantes ne doivent pas consommer l’essentiel du budget. Le chargement du catalogue ne dépend pas de ces objectifs.

Matrice minimale : ordinateur 1440×900, ordinateur 1920×1080, téléphone portrait autour de 390×844 et paysage. Tester le moteur WebKit disponible et au moins un appareil réel lorsque l’accès existe. Signaler explicitement toute validation sur appareil non réalisée.

Parcours critiques :

1. Une miniature et son tableau mènent au même focus et au même prix.
2. Trois clics rapides se terminent sur la dernière destination, sans traversée ni fiche obsolète.
3. About et Contact ouvrent des fenêtres centrées lisibles ; la promenade continue derrière et après leur fermeture, conformément à la demande de remplacement des inscriptions murales.
4. Rechargement, liens profonds et retour/avance restaurent le contexte.
5. Une œuvre ajoutée dans l’administration persiste après reconnexion et apparaît publiquement uniquement après publication.
6. Une œuvre dépubliée n’apparaît plus dans les listes, métadonnées et nouvelles signatures de médias.
7. Un utilisateur anonyme et un compte non administrateur ne peuvent ni modifier les œuvres, ni lire les brouillons, notes ou originaux.
8. L’affectation d’un treizième tableau a un résultat explicite et fonctionnel.
9. « Prix sur demande », « Réservée » et « Vendue » ont le comportement prévu sans prix secret exposé.
10. Le mailto contient le bon destinataire configuré et le bon contexte sans prétendre envoyer le message.
11. La perte de contexte WebGL ou l’échec du GLB donne accès au catalogue et au contact.
12. Une série de changements d’œuvres ne multiplie pas les Canvas ni la mémoire sans borne.

Les captures de régression proviennent du site exécuté. Stabilise caméra, chargement, viewport et horloge d’animation avant une comparaison. Une capture de référence artistique guide une revue humaine de composition, pas une égalité pixel à pixel avec un moteur différent. Ne déclare pas « validé » un test seulement écrit ou jamais exécuté.

## I. Exploitation et limites de livraison

Documente l’environnement Node, le gestionnaire de paquets, les versions, le déploiement, les migrations et le renouvellement des accès. Propose un export JSON/CSV des métadonnées et une procédure de sauvegarde/restauration des fichiers.

Ne mets pas les références originales, secrets ou sessions de test dans un dépôt public. Fournis `.env.example` avec des valeurs absentes et un descriptif de chaque variable. Les configurations client et serveur sont séparées. L’URL publique et les origines autorisées viennent de la configuration, pas d’un en-tête utilisateur utilisé aveuglément.

La première livraison peut être testée avec des données démo locales ; elle ne doit pas être décrite comme une production sécurisée déjà raccordée tant que le stockage persistant privé, le compte administrateur et l’hébergement ne sont pas configurés et testés. L’absence d’email réel fourni laisse le contact désactivé avec un message explicite en démo, jamais redirigé vers une personne inventée.
