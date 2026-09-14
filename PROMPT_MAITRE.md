# Mission — Construire une galerie d’art 3D chaleureuse

## 1. Résultat à livrer

Développe le site d’une artiste peintre à partir de la référence visuelle jointe : un musée lumineux, chaleureux et élégant, avec pierre crème, arches, verrière, lumière dorée, touches de laiton, quelques bancs et de la végétation discrète. Le visiteur doit réellement se déplacer dans un espace 3D en cliquant sur des œuvres ou sur le menu. L’artiste doit pouvoir gérer ses œuvres depuis une administration simple, sans modifier du code ou manipuler des coordonnées 3D.

Il s’agit d’une application fonctionnelle, pas seulement d’une image, d’une vidéo de musée ou d’une maquette. Le décor, les tableaux et la caméra doivent exister dans une scène Three.js. La capture de référence décrit l’ambiance : elle ne constitue pas une géométrie 3D à utiliser comme décor final.

Le parcours commercial est une prise de contact par email. Affiche les prix et la disponibilité, mais ne crée ni panier, ni paiement, ni compte acheteur. Aucune IA n’est nécessaire pendant la visite : le modèle sert à développer le site et ses assets.

La livraison comprend le code, les assets générés et leurs sources reproductibles, les migrations, les tests pertinents, un guide d’installation et un guide d’administration. Un projet qui compile mais dont le musée ne ressemble pas à la direction validée n’est pas terminé.

## 2. Références et contenu réel

Consulte `references/design/musee-reference.png` et les huit fichiers de `references/artworks/`. Le manifeste `references/artworks/manifest.json` associe les fichiers aux identifiants de démonstration et indique leurs dimensions en pixels.

Utilise les images originales séparées pour les tableaux. Ne découpe pas les miniatures dans la capture du site. Ne redessine pas les œuvres avec une IA. Préserve leur composition, leur orientation et leurs proportions ; aucune déformation pour remplir un cadre.

Les noms d’artistes, titres, prix, dates, dimensions physiques, techniques et textes visibles sur la capture ont été inventés dans une exploration graphique. Ils ne sont pas des informations réelles. Ne reprends pas « Léa Martin » comme identité confirmée. Utilise des valeurs de démonstration clairement signalées, « Artiste peintre » et « Œuvre 01 » à « Œuvre 08 » tant que les informations ne sont pas fournies. Une technique picturale ne doit pas être déduite d’une photo comme un fait certain.

Le site réel ne doit contenir aucun prix, témoignage, certificat, service de livraison ou biographie inventés. Les montants de démo doivent rester dans des fixtures isolées ; en production un prix inconnu devient « Prix sur demande ». La devise est configurable dans l’administration ; utiliser EUR uniquement comme valeur initiale de démonstration, à confirmer.

## 3. Organisation du travail et skills

Examine d’abord le dépôt et les outils effectivement disponibles. Préserve les fichiers existants et respecte les consignes applicables du projet. Dans un dépôt vide, crée la structure nécessaire ; dans un dépôt existant, propose une adaptation ciblée plutôt qu’une réécriture injustifiée.

Lis ce brief lors du cadrage initial, puis seulement les sections utiles à la tâche en cours. Consulte `docs/CONTRATS_TECHNIQUES.md` pour les contrats de données, de caméra et de sécurité. Les cinq skills locaux sont des procédures propres à ce projet, pas des plugins supposés préinstallés :

- `museum-art-direction` : composition, matériaux, interfaces publiques et revue visuelle.
- `museum-webgl-navigation` : scène, placement, cadrage, itinéraires et synchronisation de navigation.
- `museum-blender-assets` : fabrication et export des assets architecturaux.
- `museum-admin-security` : administration, stockage, publication et permissions.
- `museum-qa` : vérification visuelle, fonctionnelle, accessibilité et performances.

Active seulement les skills concernés. Si la découverte automatique des skills ne fonctionne pas, ouvre explicitement leur `SKILL.md`. Les procédures n’ajoutent pas magiquement un outil absent : vérifie le navigateur, Blender, les accès réseau et les services avant de les employer.

Un plugin Supabase peut aider à travailler sur un projet de développement autorisé. Il reste facultatif : les migrations versionnées et la CLI doivent permettre de reproduire l’installation. Blender peut être piloté par son exécutable local et son API Python ; ne dépends pas d’un plugin Blender hypothétique. N’installe pas un paquet de skills tiers sans rapport avec le projet.

Crée un `PLAN.md` court avec les étapes, puis maintiens les décisions et les blocages réels. Avance sur les opérations locales réversibles et les tests de développement sans demander une confirmation pour chaque fichier. Demande l’accord pour une dépense, une publication publique, un envoi réel d’email ou une opération destructive hors environnement jetable. Une absence de secret ne doit pas empêcher de développer et de tester le reste avec des fixtures explicites.

Si des sous-agents sont disponibles, sépare éventuellement assets 3D, administration et revue de tests, après stabilisation des contrats partagés. Un responsable unique intègre le travail ; évite les modifications concurrentes du routage, des migrations et du fichier de dépendances.

## 4. Stack retenue

Utilise une stack cohérente, avec des versions stables compatibles au moment de l’installation. Vérifie les exigences de versions de React, React Three Fiber et Next.js, puis verrouille les versions dans le lockfile. Ne mélange pas des exemples d’anciennes API et des versions récentes.

Application : Next.js App Router, React et TypeScript strict. Le contenu indexable et les contrôles serveur restent dans l’application web ; la scène WebGL est chargée uniquement côté client, de façon progressive.

3D : Three.js avec `@react-three/fiber` et `@react-three/drei`. Utilise `CameraControls`/`camera-controls` avec un contrôleur de navigation unique. La cible initiale est WebGL, avec détection de compatibilité et repli ; ne rends pas WebGPU obligatoire.

Interface : HTML/CSS avec Tailwind CSS, composants accessibles pour formulaires et dialogues, et un carrousel léger, par exemple Embla. Les composants d’administration peuvent utiliser shadcn/ui sans imposer son esthétique par défaut au musée public.

État : un store léger, par exemple Zustand, pour la vue sélectionnée, le trajet, la pièce active et l’état de l’interface. Les transformations mises à jour à chaque frame ne doivent pas déclencher un rendu React global.

Données : Supabase PostgreSQL, Auth et Storage. Zod pour les entrées, un formulaire typé pour l’administration, Sharp côté serveur pour les images après téléversement direct dans un stockage privé. Les secrets restent exclusivement côté serveur.

Tests : Vitest pour les fonctions et règles métier, Playwright pour les parcours et captures de l’application réellement exécutée. Prévoir des vérifications d’accessibilité automatisées et manuelles.

Déploiement : cible initiale Next.js sur Vercel et Supabase géré, sans configuration liée en dur à ces comptes. Prévoir une exécution Node/Docker documentée si l’hébergement choisi ensuite est un VPS. Ne lance jamais Blender ou le calcul de textures à chaque visite ou dans une requête serveur de production.

N’ajoute pas GSAP pour faire doublon avec la caméra. Il peut être envisagé pour un besoin d’animation d’interface identifié, avec une responsabilité unique par propriété animée.

## 5. Musée et direction artistique

Conçois un hall principal et deux alcôves connectées pour « À propos » et « Contact ». Prévois un module de salle d’exposition réutilisable pour accueillir de futures œuvres.

Le hall doit reprendre les éléments structurants de la référence : vue légèrement en perspective, architecture verticale généreuse, colonnes et arches, verrière créant une lumière oblique, murs clairs, œuvres très colorées et cadres fins. Le sol doit réfléchir subtilement la lumière sans ressembler à un miroir mouillé. Les bancs restent hors des chemins de caméra et devant aucun tableau. Les plantes ne doivent ni traverser les murs ni cacher les œuvres.

La chaleur vient des matériaux et de la lumière, pas d’un filtre orange appliqué aux tableaux. Évite le rendu de jeu vidéo rudimentaire, les reflets métalliques excessifs, les halos, le flou permanent et l’accumulation de décor. Les peintures restent le point focal.

Sépare l’architecture statique des éléments éditoriaux. Le musée exporté ne doit pas contenir les images, prix ou biographies figés dans sa texture. Le mobilier et la structure peuvent être précalculés ; les cadres, toiles, cartels et murs éditoriaux sont générés à partir des données.

La première version technique peut employer une architecture procédurale pour tester les circulations. Pour la version visuelle aboutie, privilégie Blender pour préparer le hall, les matériaux et l’éclairage exportables, puis teste le résultat dans Three.js. Si Blender n’est pas disponible, fournis une alternative procédurale fonctionnelle, les scripts préparés et une indication honnête de ce qui a été exécuté ou non. Ne présente pas un simple prototype en cubes comme le rendu final demandé.

## 6. Parcours d’accueil et interface persistante

L’arrivée présente une composition proche de la référence, avec une courte accroche, le nom configurable de l’artiste et un bouton « Entrer dans la galerie ». Le musée occupe l’essentiel du viewport. Un menu HTML discret reste accessible en haut : Accueil, Œuvres, À propos, Contact. Un accès « Catalogue classique » reste visible.

Le carrousel inférieur montre les œuvres publiées avec image, titre, prix ou « Prix sur demande », et disponibilité. Préserve leurs formats dans les vignettes. Pas de lecture automatique : l’utilisateur choisit. Le carrousel peut être réduit pour libérer la vue.

Un clic sur une miniature et un clic sur le tableau dans la scène déclenchent exactement la même action de sélection. Le catalogue doit gérer les œuvres dans des salles différentes, sans charger toutes leurs textures haute résolution simultanément.

Pendant un déplacement, fais disparaître l’accroche qui gênerait la vue. À l’arrivée, montre une fiche lisible à côté de l’œuvre sur ordinateur ou dans un panneau inférieur adapté sur mobile. La fiche ne recouvre pas la peinture. Elle affiche titre, technique si connue, dimensions si connues, description, prix, disponibilité, et « S’informer sur cette œuvre ».

L’interface ne doit pas imposer un jeu de déplacement clavier. La visite guidée par clic est le mode principal. Une légère rotation de regard ou un zoom limité peut compléter la consultation, sans permettre de passer derrière un tableau ou de sortir du musée. Pas de roulis ni de balancement de tête.

## 7. Caméra — comportement essentiel

Implémente un `CameraDirector` central. Toute demande de navigation — menu, carrousel, tableau, précédent/suivant, retour navigateur, lien profond — passe par le même contrat.

À la sélection d’une œuvre : conserve la pose courante, vérifie la destination, charge les ressources nécessaires, choisit un itinéraire sûr, déplace réellement la caméra et oriente progressivement le regard, puis cadre le tableau de face. Le tableau ne vient pas flotter au milieu de l’écran pour imiter ce déplacement.

Utilise des points de passage dans les espaces libres et les ouvertures. Ne relie pas arbitrairement deux tableaux par une droite : cela peut traverser un mur, une colonne ou un banc. Les courbes lissées doivent aussi être vérifiées car elles peuvent dépasser des segments sûrs. Utilise un petit graphe de navigation et des volumes de collision simples ; aucun moteur physique complet n’est nécessaire pour ce parcours guidé.

Le cadrage dépend de la largeur et hauteur de l’œuvre, du champ de vision, de l’orientation du mur et de la place réellement disponible à l’écran après retrait du menu, du carrousel et de la fiche. Évite une distance identique pour tous les tableaux. Les œuvres carrées, panoramiques et verticales doivent toutes tenir entièrement dans la vue.

Vise des transitions locales agréables d’environ 1,5 à 3 secondes, à ajuster selon la distance. Pour les trajets longs, propose de raccourcir/passer la transition plutôt que de traverser le musée à une vitesse inconfortable. En mouvement réduit, propose une transition instantanée ou un fondu bref.

Gère les clics rapides. La dernière destination demandée doit gagner ; les anciennes promesses, animations et réponses de chargement ne doivent pas rouvrir une fiche dépassée. Une annulation ne doit pas faire repartir la caméra depuis une ancienne pose. Échap ferme la fiche ou quitte le focus selon un comportement documenté et testé.

## 8. À propos et Contact comme lieux du musée

Un clic sur « À propos » mène à une alcôve dédiée. Le nom, une phrase et le texte de présentation apparaissent sur un mur réel. Une photo peut être ajoutée depuis l’administration lorsqu’elle est fournie ; ne fabrique pas un portrait supposé de l’artiste.

Un clic sur « Contact » mène à un autre mur ou espace d’accueil. Le visiteur doit voir qu’il s’agit d’un lieu différent, pas uniquement d’un panneau superposé à la vue précédente. Affiche le message d’accueil, l’email et les actions de contact dans cette zone.

Utilise du texte spatial pour les titres courts. Pour les paragraphes et les interactions, privilégie de vrais éléments HTML ancrés au mur, par exemple avec `Html transform` de Drei, avec gestion de l’occlusion et de la netteté. Sur mobile, autorise une présentation HTML frontale accessible lorsque la caméra est arrivée. Ne transforme pas les longs textes en une image illisible.

Si la biographie devient longue, propose « Lire la suite » dans une interface lisible ; ne réduis pas indéfiniment la police sur le mur. Les éléments cachés derrière un mur ou inactifs ne doivent pas rester dans l’ordre de tabulation.

La demande de contact depuis une œuvre conserve le contexte : miniature, titre, identifiant et lien de l’œuvre restent associés au message lorsque la caméra rejoint le mur Contact.

## 9. Email — version initiale et extension

La version initiale doit fonctionner sans prestataire d’envoi supplémentaire : email affiché, bouton de copie et lien `mailto:` prérempli avec sujet, référence de l’œuvre et lien de sa fiche. Encode correctement les accents et caractères spéciaux. Explique que le bouton ouvre l’application de messagerie ; ne prétends jamais qu’un email a été envoyé automatiquement.

Le contact générique depuis le menu ne doit pas conserver par erreur une œuvre ancienne. Prévois un choix explicite entre demande générique et demande liée à l’œuvre sélectionnée.

Une extension facultative peut ajouter un formulaire avec envoi côté serveur via Resend ou un SMTP configuré. Elle ne doit pas bloquer la version initiale. Si elle est implémentée, utilise un destinataire fixé côté serveur, une adresse d’expédition vérifiée et l’email du visiteur en Reply-To, avec validation, limitation durable des envois, anti-spam et gestion des erreurs. Ne stocke pas inutilement des données personnelles. Sans configuration d’envoi, conserve le mode mailto au lieu de simuler un succès.

## 10. Administration utilisable par une non-technicienne

Crée `/admin` comme une interface web classique, sobre et rapide ; ne charge pas le musée 3D sur les pages administratives sauf dans une prévisualisation explicitement ouverte.

L’artiste peut se connecter, créer un brouillon, téléverser une image, renseigner ses informations, prévisualiser et publier. Elle peut aussi modifier, archiver, dépublier et marquer une œuvre réservée ou vendue. Prévois un avertissement avant suppression définitive et préfère l’archivage dans le parcours courant.

Champs : titre, identifiant/slug, description, technique, dimensions physiques, année facultative, image principale, détails facultatifs, texte alternatif, prix, devise, visibilité du prix, disponibilité, état de publication, collection, ordre d’affichage, salle/emplacement et style de cadre parmi quelques choix.

Le prix « inconnu » n’est pas zéro. Le prix masqué ne doit pas rester présent dans le JSON public ou dans le HTML. L’état « vendu » est distinct de l’état « dépublié » : une œuvre vendue peut rester visible et signalée comme telle.

L’interface montre une liste avec miniatures et filtres, un formulaire clair, un aperçu de l’œuvre et de sa fiche, ainsi que des messages de chargement, succès et erreur. Pour le placement, propose « Automatique » ou des emplacements nommés, éventuellement sur un plan simplifié. Ne demande pas à l’artiste d’entrer X, Y, Z, rotations ou positions de caméra.

Les textes de l’accueil, du mur À propos, du mur Contact, l’adresse email et l’identité de l’artiste se modifient également depuis l’administration. Une modification validée doit se propager au site sans recompilation de la scène ni reconstruction du GLB.

## 11. Ajout de tableaux et capacité des salles

Crée un registre d’emplacements stables : chaque emplacement possède un identifiant, une salle, un transform, une normale orientée vers le visiteur, une surface disponible et des points d’approche sûrs. Les affectations sont sauvegardées dans la base.

Commence par douze emplacements bien composés, dont huit occupés par les œuvres de démonstration. Les cadres s’adaptent au ratio de l’image et à l’espace prévu. Si les dimensions physiques sont connues, utilise une échelle cohérente ; sinon signale que l’échelle est illustrative. N’étire pas une toile pour la faire entrer dans un emplacement trop petit.

À la publication, l’affectation automatique cherche un emplacement compatible. Lorsque la capacité est atteinte, propose explicitement d’activer une salle supplémentaire issue du module de galerie. Cette salle doit avoir de vraies connexions et des trajets valides. Ne cache pas silencieusement la treizième œuvre et ne prétends pas prendre en charge une capacité infinie.

La réorganisation du carrousel ne déplace pas arbitrairement tous les tableaux. L’affectation aux murs et l’ordre éditorial sont deux propriétés différentes. Une suppression ne renumérote pas les identifiants existants.

## 12. Données, médias et sécurité

Sépare les données publiques, les données administratives et les médias. Utilise des migrations SQL versionnées, des schémas de validation et des types partagés, avec contrôles d’intégrité sur les prix, les slugs et l’occupation des emplacements.

Protège chaque lecture ou écriture administrative côté serveur et au niveau des politiques Supabase. Une page `/admin` cachée n’est pas un contrôle d’accès. Les rôles administrateurs ne doivent pas dépendre d’un simple indicateur localStorage, d’un email fourni par le client ou de métadonnées modifiables par l’utilisateur.

Pas d’inscription publique. Crée le premier administrateur par une procédure documentée sur le projet de développement puis de production, sans mot de passe codé en dur. Les opérations ordinaires utilisent la session authentifiée et ses permissions ; toute utilisation d’un secret privilégié est limitée à un module serveur vérifié.

Les originaux et brouillons restent dans des buckets privés. Pour les visiteurs, délivre uniquement des variantes autorisées d’œuvres publiées via des URLs signées de durée limitée, et explique la limite de révocation des URLs déjà délivrées. Ne transmets jamais les originaux administratifs par défaut. Le serveur choisit le chemin à signer depuis l’identifiant validé, pas depuis un chemin arbitraire fourni par le navigateur.

Accepte les images raster prévues, avec plafonds de taille et de pixels, validation réelle après décodage, orientation EXIF, conversion cohérente en sRGB, suppression des métadonnées inutiles et dérivés optimisés. Refuse SVG et fichiers non image. Évite de faire transiter les gros fichiers dans une fonction d’hébergement à limite de corps réduite : téléversement direct signé vers un espace privé, puis traitement côté serveur avec vérification d’appartenance.

Les mutations doivent avoir une gestion de concurrence minimale. La publication attend les variantes nécessaires ; en cas d’échec de traitement, le brouillon reste récupérable. N’efface pas une image encore utilisée. Prévois export des données et sauvegarde des médias : une sauvegarde de base seule ne représente pas tous les fichiers.

## 13. Performance, téléphone et accessibilité

Charge le contenu essentiel et le catalogue avant d’exiger le chargement complet de la 3D. Montre un indicateur honnête des ressources connues et propose immédiatement le catalogue classique. Évite un faux pourcentage allant à 100 % avant que la scène soit prête.

Adapte la qualité : résolution plafonnée, ombres limitées, matériaux simples sur mobile, détail réduit pour les plantes et salles éloignées. Privilégie la lumière précalculée pour le décor. N’applique pas une texture 4K à chaque miniature et ne charge pas tout le catalogue dans la mémoire graphique.

Les images d’une même œuvre ont plusieurs usages : miniature, texture de salle, consultation rapprochée. Charge la version détaillée au besoin sans agrandir artificiellement les sources. Mets en cache avec des identifiants stables, puis libère les ressources selon une politique qui n’efface pas une texture encore partagée.

La scène doit cesser de rendre inutilement lorsqu’elle est immobile ou que l’onglet est masqué, puis se réveiller correctement pour la caméra, les ressources et le redimensionnement. Une navigation ne recrée pas un Canvas ou un contexte WebGL.

Objectifs à mesurer, non à annoncer comme garantis : environ 60 images/s sur l’ordinateur de test et 30 sur un téléphone représentatif, avec dégradation propre. Documente appareil, navigateur, résolution et protocole. Une capture Playwright sur ordinateur ne prouve pas la performance Safari/iPhone.

Prévois le clavier, les focus visibles, des intitulés de boutons explicites, le contraste, le mode mouvement réduit, les tailles tactiles et les safe areas. Le visiteur peut utiliser une version 2D complète en cas de WebGL indisponible, de lenteur, de préférence personnelle ou de besoin d’accessibilité. Tous les prix et contacts restent accessibles sans la scène.

## 14. Routage et référencement

Garde la scène montée durant les navigations internes. Synchronise le lieu sélectionné avec l’URL, par exemple `/?vue=oeuvre&slug=...`, `/?vue=apropos` et `/?vue=contact`. Gère chargement direct, rechargement, retour et avance du navigateur.

Fournis également des routes HTML réelles : `/oeuvres`, `/oeuvres/[slug]`, `/a-propos`, `/contact`. Chaque œuvre publiée possède une fiche partageable, avec son texte, son image, son prix autorisé et ses métadonnées. Les liens de menu peuvent utiliser ces destinations comme repli, puis être interceptés pour la visite quand celle-ci est prête.

Le choix de basculer entre 3D et 2D conserve l’œuvre ou la section consultée. N’affiche pas un contenu différent aux moteurs de recherche ; utilise une même source de données. Ne publie pas de brouillon dans le sitemap, les métadonnées, les réponses d’API ou les données structurées. Aucun faux avis ni stock inventé.

## 15. Jalons et définition de fin

Jalon A : projet démarrable, choix techniques verrouillés, manifeste des œuvres, musée de circulation, trois œuvres de ratios différents, trajet fiable et menu menant aux alcôves. Vérifie l’expérience avant de développer un grand back-office.

Jalon B : rendu architectural proche de la direction choisie, version browser comparée à la référence, cadres et couleurs corrects, scènes About/Contact lisibles, carrousel et fiches finalisés.

Jalon C : base, authentification, médias privés, édition, publication et placement persistants. Vérifie l’ajout d’une nouvelle œuvre et la mise à jour d’un prix dans une session publique distincte.

Jalon D : contact mailto réel, routes 2D, accessibilité, adaptation mobile, erreurs de chargement, optimisation mesurée et sauvegarde documentée.

Jalon E : installation reproductible, déploiement de prévisualisation autorisé, matrice de tests et captures représentatives. Les services externes non configurés sont identifiés précisément ; aucun succès fictif.

Ces jalons ne sont pas des arrêts de validation systématiques. Dans le cadre d’une demande d’implémentation complète, continue les étapes locales autorisées jusqu’à la livraison testée ; fais remonter uniquement les décisions réellement bloquantes.

Le site est accepté lorsque l’on peut ajouter puis publier une œuvre, la retrouver dans le catalogue et sur un mur, cliquer pour se placer devant, lire le bon prix, rejoindre le contact avec la bonne référence, et consulter About/Contact dans leurs lieux dédiés. L’opération ne doit nécessiter aucun changement de coordonnées ou de code.

## 16. Ce que tu dois rendre

Rends un projet exécutable et organisé, le lockfile, `.env.example` sans secret, les migrations et la procédure d’amorçage administrateur. Fournis les scripts de fabrication/export des assets avec les fichiers effectivement générés, le manifeste des emplacements, les licences des assets externes et les variantes d’images.

Documente les commandes réelles de développement, tests et production, puis rédige un guide court pour l’artiste : ajouter une œuvre, changer le prix, choisir une salle, publier, marquer vendu, modifier sa biographie et son email.

Fournis un compte rendu concis avec ce qui fonctionne, ce qui a été testé et dans quel environnement, les captures du vrai navigateur, les mesures disponibles, et les actions externes encore à faire. Ne remplace pas la livraison par une longue explication théorique ou une offre de continuer.

Commence par inspecter le dépôt et la référence, établis ton plan initial puis réalise la première tranche fonctionnelle. Poursuis vers les critères de fin ci-dessus.
