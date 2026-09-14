# Finitions V7 — circulation simple et décor plus sobre

La demande remplace deux choix de V6 : l’arrêt de la promenade à la fermeture d’une fenêtre éditoriale et les reliefs ajoutés à la place des cloisons. Les panneaux de noyer pleine hauteur sont conservés.

## Décor

Les bandes minérales du hall et la boucle en céramique du salon, leurs supports et leurs petites sources lumineuses sont retirés. Le mur d’enduit continu reste apparent à ces endroits. Les inserts de noyer, les figuiers, les assises et les sculptures existants restent identiques. Les salles sont recalculées à partir des sources, sans conserver les ombres des éléments supprimés.

Le halo circulaire derrière le titre d’accueil est remplacé par un dégradé progressif depuis le bord de l’écran, adapté au format portrait. Le texte garde son contraste sans donner l’impression d’un projecteur blanc au milieu du décor.

L’enduit reçoit un grain minéral fin, des irrégularités douces à quelques centimètres et une variation de teinte discrète. Ces trois échelles partagent une texture procédurale 512², répétable, filtrée par mipmaps et anisotropie. La moyenne neutre préserve la teinte et l’éclairage précalculé ; trois lectures de texture par fragment, sans téléchargement supplémentaire. Le bois et les tableaux restent indépendants.

## Fenêtres éditoriales

« À propos » et « Contact » partagent la promenade de la pièce courante. Fermer par la croix, Échap, un clic extérieur ou le retour navigateur conserve son horloge et sa progression. La fermeture pendant le départ depuis un tableau ne doit pas annuler la promenade à venir. Les menus de sélection et les préférences de mouvement réduit conservent leurs règles.

Pour une fiche d’œuvre, la croix, Échap et un clic à côté du tableau ferment la fiche et reprennent automatiquement la promenade depuis la pose rendue. Pendant un trajet vers une œuvre, un clic dans la scène l’annule même si une œuvre en mouvement se trouve sous le pointeur. Le point de raccord est proche et choisi dans le sens de la boucle ; le regard suit la circulation locale. Aucun retour à la position d’accueil. Le comportement initial de V7 qui figeait la caméra à la fermeture est remplacé.

## Passage entre pièces

Le raccord à la boucle se fait à l’intérieur de la pièce, au lieu d’ajouter un coude latéral au niveau de la porte. Le regard n’effectue plus de contre-rotation pendant le passage ; il accompagne ensuite progressivement la promenade. L’ancien second trajet de raccord et sa logique de redimensionnement sont supprimés de CameraDirector. La caméra ne revient pas à l’image d’accueil et aucun fondu ne cache un changement de position.

Le raccord de vitesse se trouve à 4,28 m dans le salon et à 5,10 m dans le hall : ces derniers mètres sont parcourus dans le prolongement de la porte, sans nouvel arrêt. Selon le point de départ, la traversée complète prend 4,96 à 12,18 s ; médiane 9,04 s sur les 30 cas CPU. Depuis l’accueil : 7,07 s, dont la porte atteinte après 4,67 s, contre 8,32 s et 5,11 s en V6. Les 30 mêmes départs sont plus rapides, même si certaines distances augmentent légèrement pour rejoindre une portion de boucle mieux alignée. Le changement n’est pas instantané ; un demi-tour depuis un tableau opposé reste plus long.

## Aperçus synchronisés avec l’administration

Les captures ne nécessitent plus une commande manuelle après chaque modification locale. Une modification des œuvres publiées invalide leur lot d’aperçus ; le serveur répond immédiatement avec une vue vide de la bonne salle, puis fabrique les nouvelles vues en arrière-plan. Le lot est privé, associé à l’empreinte du catalogue et publié atomiquement après un second contrôle des données. Une œuvre déplacée, remplacée, vendue ou retirée invalide l’ancien aperçu, même si son ancienne URL est demandée.

Les onglets de galerie rechargent la projection publique après un enregistrement dans l’atelier ou au retour dans l’onglet. Le menu des salles attend le nouveau lot puis recharge ses images automatiquement. Le Canvas reste monté. Les brouillons, prix non publics et informations administratives ne sont jamais ajoutés au signal entre onglets ni au nouvel endpoint public.

Ce générateur est destiné à l’installation locale de démonstration : Chrome installé et `playwright-core` sont utilisés par une seule tâche à la fois, sans cookies administrateur ni accès réseau hors du serveur local. `MUSEUM_ARRIVAL_GENERATION=0` désactive la génération. Supabase distant conserve un repli sans œuvres ; aucun service de rendu distant n’est déployé ici.

## Vérifications

- Compilation production et contrôle TypeScript réussis après les derniers changements ; 51 tests de navigation, empreinte d’arrivée et génération automatique passent. Le paquet Playwright complet est présent dans le build standalone.
- Comparaison CPU : 30 départs identiques V6/V7, zéro collision ; rotation maximale 39,92°/s, accélération angulaire 59,40°/s², écart de vitesse au raccord 0,00059 m/s. Rapports `artifacts/finishing-v7/physical-room-audit.json` et `physical-room-comparison-v6-v7.json`.
- Trois GLB refabriqués et contrôlés : 27 rayons aux anciens emplacements des reliefs touchent directement le mur d’enduit. Les géométries et transforms des 12 objets constituant les inserts en noyer sont identiques à V6. Budget actif : 4 638 712 octets (4,42 Mio), 305 678 triangles, 50 lots, hors tableaux et application.
- Huit captures live de traversée, quatre étapes dans chaque sens, sans modifier la caméra ou son horloge : `artifacts/finishing-v7/transfer-views-1440/`. Les captures du seuil, de l’intérieur et du raccord sont inspectées. Elles valident la composition, pas la cadence de présentation, car capturer une image peut ralentir le navigateur.
- Vingt vues navigateur : hall, salon, À propos et Contact en 1440×900, 701×600, 390×844, 320×568 et 667×375. Dialogues centrés, boutons accessibles, pas de débordement ni d’erreur JavaScript. `artifacts/finishing-v7/views/`.

- Quatre tests navigateur de continuité des fenêtres éditoriales réussis, dont ordinateur, format mobile et fermeture pendant le départ depuis une œuvre. `artifacts/finishing-v7/modal-final.log`.
- Le premier contrôle de fermeture immobile est archivé dans `artifacts/finishing-v7/dismiss-final.log`. Il concernait le comportement depuis remplacé par la reprise automatique. La croix mobile conserve sa cible de 44×44 px.
- Huit images d’arrivée régénérées après la texture finale : les deux salles en horizontal et portrait, avec et sans œuvres. Le statut local confirme le lot courant prêt. `artifacts/finishing-v7/arrival-texture.log`.
- Sauvegarde admin réelle sur fixture jetable : changement de collection et statut Vendue, puis aperçus actualisés (3/5 œuvres) sans recréer le Canvas. Deux lots complets générés en 56,6 et 58,3 s ; enregistrement UI en 1,44 s. Après archivage, l’ancienne URL sert immédiatement le repli. Données principales inchangées. `artifacts/arrival-generation/report.json`.

Les captures et les tests de mouvement ne constituent pas une mesure de fluidité sur téléphone physique. Aucun nouveau benchmark GPU natif n’est revendiqué pour V7.

## Reprise après annulation et résolution réelle

Le clic dans la scène interrompt également un trajet vers une œuvre. Il passe avant le raycast : une œuvre qui glisse sous le pointeur ne peut plus empêcher l’annulation. La reprise utilise la pose rendue, puis rejoint un point proche de la boucle dans le sens de circulation. La direction locale suit le trajet réel, sans guide de porte fictif ; la longueur d’approche diminue lorsque la boucle est proche, évitant un détour en U.

Le contrôle dans le vrai Chrome via MCP a révélé que la prop DPR du Canvas écrasait le réglage impératif du budget lors des rendus React. Le Canvas possède maintenant ce réglage seul. Au viewport 1728×1028, le buffer réellement lu passe de 2592×1542 à 2319×1379, en accord avec le budget de 3,2 Mpx et malgré les changements d’interface. Les textures sources restent inchangées.

Deux fenêtres de mesure Chrome ont donné 116,9 puis 101,1 images rendues/s. Les phases de visite et la charge CPU diffèrent : ce n’est pas un benchmark A/B démontrant un gain de FPS. Cela confirme en revanche l’absence de plafond applicatif à 30/60 FPS dans ces mesures. Preuve : `artifacts/finishing-v7/chrome-mcp-performance.json`.

WebKit dispose d’un plafond de DPR 1,25 et 1,8 Mpx sur grand écran ou 1 Mpx compact ; les flous de fond de l’interface y sont supprimés. Les profils restent fixes pendant les trajets. Les tests CPU de budget et de navigation passent (49 tests), incluant 24 départs dont 16 pendant un trajet, absence de collision ou marche arrière et 8 annulations près de la boucle.

Les trois tests navigateur finaux passent : reprise depuis une œuvre et interruption pendant le trajet en 1440×900 et 390×844, continuité de position échantillonnée, Canvas conservé et aucune erreur JavaScript. Le troisième test utilise un DPR de 2 et vérifie le buffer réel après changements d’œuvre et redimensionnement mobile. `artifacts/finishing-v7/resume-browser-final.log`. Compilation production et contrôle TypeScript réussis : `resume-build.log` et `resume-typecheck.log`.

WebKit Playwright sur macOS : les deux vues Retina passent, sans erreur JavaScript et avec le buffer attendu (1697×1060 en 1440×900, 487×1055 en 390×844). Cadence observée environ 30 FPS, p95 de 35 ms. Le témoin HTML sans Canvas ni code de galerie tourne également à exactement 30 FPS. Ce plafond de l’environnement WebKit testé ne peut donc pas être attribué au coût 3D du musée. La machine est alors sur batterie avec `lowpowermode=1`, lu sans modifier les réglages ; le mode économie d’énergie est une piste à vérifier dans Safari natif. Ce test ne prouve pas les performances de l’application Safari ou d’un iPhone physique. Rapports : `artifacts/finishing-v7/webkit-resume/report.json` et `blank-control.json`.
