# Finitions avant publication — 26 septembre 2026

Historique des passes locales : catalogue mobile, contact Resend, référencement, contrôles d’administration et aperçus/caméra. Les modifications préexistantes de la visite sont conservées. La publication autorisée le 26 septembre et ses contrôles publics sont documentés à la fin. Aucun email réel envoyé.

## Comportement

- Un téléphone arrive sur le catalogue classique ; les liens de visite conservent le contexte d’œuvre/contact en revenant aux pages HTML. La détection serveur couvre le téléphone en paysage et la largeur/pointeur tactile est vérifiée avant tout import du musée. Les contrôles de visite 3D sont masqués sur téléphone.
- Le catalogue HTML complet reste dans la réponse initiale de l’accueil, y compris sans JavaScript. Chaque œuvre publiée possède sa fiche, une URL canonique, un titre, une description, une image de partage et des données `VisualArtwork`. Les pages À propos/Contact ont leurs propres métadonnées. Démo et déploiements Vercel Preview restent non indexables. Le sitemap ne comprend que des pages publiques.
- Les mentions de démonstration ne s’affichent que pour les fixtures locales. Le menu 3D et le contact avaient des mentions non conditionnelles, corrigées. Aucun titre, technique, dimension ou prix réel n’est inventé ; les références numérotées importées du portfolio sont conservées.
- Le contact contient nom, email, message, contexte de l’œuvre et accès direct à la messagerie. Sans configuration valide, l’envoi est désactivé et l’accès mailto reste disponible. Aucune confirmation d’envoi n’est affichée sur erreur.
- Les salles vérifient leur version en ouvrant le sélecteur. Si les images enregistrées manquent, une capture des vrais tableaux publiés est faite dans le navigateur, une salle à la fois, puis conservée en mémoire pour cette visite. Le Canvas de visite reste monté. La capture attend le chargement des textures et l’arrivée de caméra ; une nouvelle version invalide les images précédentes. Pendant l’attente/une panne WebGL, les vignettes des œuvres remplacent le faux aperçu vide. Le visiteur n’écrit rien dans le stockage. Les images persistantes continuent à être régénérées par l’administration.
- Champ de vision de focus : 60° au lieu de 50°. Promenade : base 64°, au moins 60° sur écran large, élargissement plafonné à 78°. Le focus d’une œuvre garde le calcul de projection et les contraintes de collision.

## Resend : configuration à terminer

1. Dans Resend, vérifier un domaine d’envoi appartenant à Julie/Mathis et installer les enregistrements DNS fournis. Un sous-domaine de `juliethiam.art` peut être utilisé ; les valeurs exactes viennent du compte Resend. Ne pas modifier le service mail Proton pour recevoir les messages.
2. Ajouter **sur le serveur/hébergement**, jamais dans un champ public ou le dépôt, `RESEND_API_KEY` et `CONTACT_EMAIL_FROM` (adresse du domaine vérifié, éventuellement `Julie Thiam <adresse>`).
3. Le destinataire est l’email configuré dans `/admin` → Textes & contact : `contact@juliethiam.art`, redirigé vers la boîte privée de Julie. Le visiteur est uniquement le `Reply-To` ; il ne choisit ni destinataire ni expéditeur.
4. Après activation et accord du propriétaire, effectuer un vrai test de réception et réponse. Une acceptation API ne prouve pas la livraison dans la boîte de réception. Aucun test réel effectué ici.

Contrôles d’envoi : origine publique autorisée, JSON borné à 20 Ko, validation stricte, œuvres publiées exclusivement, piège anti-spam, limite de cinq tentatives par IP/email sur quinze minutes dans chaque instance, clé d’idempotence Resend pour les réessais, timeout et erreurs sans détails de compte. Aucun message visiteur conservé dans la base du site. Sur Vercel, les limites applicatives en mémoire ne sont pas partagées entre instances : une règle de limitation dans le pare-feu d’hébergement doit compléter ce dispositif si l’exposition/volume le justifie.

Références : [API Resend](https://resend.com/docs/api-reference/emails/send-email), [domaines vérifiés](https://resend.com/docs/dashboard/domains/introduction), [référencement JavaScript Google](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

## Administration

L’accès reste `/admin`, sans lien depuis le site public. Chaque opération privilégiée vérifie la session côté serveur. Cookies HttpOnly/SameSite, signature HMAC et expiration bornée ; mots de passe scrypt. Les signatures valides sur des expirations invalides/illimitées et les suffixes de cookie sont refusés. Les pages/API admin portent `X-Robots-Tag: noindex, nofollow, noarchive` et `private, no-store`.

Contrôle en lecture seule sur le site public : GET `/api/admin/artworks` et GET `/api/admin/room-layout?roomId=room-1` → 401 ; `/admin/arrival-capture` → redirection 307 vers la connexion. Le blocage de robots et l’absence de liens ne remplacent pas l’authentification. Le limiteur de connexion existant est par instance ; ne pas le présenter comme un pare-feu distribué. Les politiques Supabase n’ont pas été validées sur un service réel durant cette passe ; le site actuel utilise Blob.

## Vérification

- `npm test -- --maxWorkers=2` : 28 fichiers, 324 tests réussis. Une première exécution en concurrence avec le rendu logiciel a dépassé le timeout du test d’encodage média ; la suite complète est passée avec deux workers.
- `npm run typecheck` et compilation de production `npm run build` : réussis.
- Version standalone compilée, Chrome avec son backend graphique par défaut : 11 parcours réussis (1,2 minute), dont catalogue sans JavaScript, sélection/retours rapides, promenade et changement de salle, capture des deux salles, formulaire simulé, API admin anonymes et quatre formats/parcours mobiles.
- Contrôles Axe sur les contacts desktop et mobile : aucune violation WCAG A/AA détectée dans les parcours testés. Cela ne remplace pas une revue complète d’accessibilité.
- Dernière amélioration mobile : présentation de collection dépliable, première rangée de tableaux visible plus tôt, texte entier conservé. Cinq recontrôles ciblés réussis après recompilation (5,8 secondes), dont les deux portraits, le paysage et le catalogue sans JavaScript.
- Les premiers essais de mouvement sous SwiftShader ont été trop lents ; une exécution du serveur de développement avec rechargements à chaud a aussi perdu le contexte WebGL. Les parcours de navigation ont ensuite été exécutés avec succès sur la version compilée stable. Ne pas interpréter ces essais comme une mesure de GPU mobile.

Les captures sont celles du site local exécuté sur une copie jetable des 26 œuvres. Les anciennes captures peuvent contenir la mention de démo, retirée de l’interface lors de la revue suivante. Émulation de navigateur, aucun téléphone physique utilisé.

Captures inspectées : [salles actuelles](../artifacts/finishing-qa/rooms-current.png), [catalogue téléphone](../artifacts/finishing-qa/catalogue-390.png), [contact téléphone](../artifacts/finishing-qa/contact-390.png), [contact desktop](../artifacts/finishing-qa/contact-desktop.png).

## Ajustements après revue visuelle

Le bandeau reste déplié au départ, regroupé sur deux rangées avec fond de verre et indicateur de collection coulissant. La fiche automatique réserve sa place avant l’arrivée pour éviter le second recadrage. Un clic-glissé permet de tourner le regard puis de reprendre la promenade vers une circulation sûre à partir de cette orientation. Les mentions « Version de démonstration » du menu et des pieds de page ont été supprimées ; la séparation des fixtures reste interne.

Compilation, 237 tests ciblés et huit parcours Chrome réussis, puis recontrôle de deux rotations successives et sélection d’œuvre réussi. Les captures de la nouvelle barre sont dans `artifacts/experience-qa/glass-focus-1440.png` et `restored-artwork-*`.

## Correction des commandes et des barres après retour utilisateur

Le verre coulissant est déplacé sur le menu principal du haut. Le bandeau inférieur retrouve le brun des pop-ups d’information, sans flou ; il conserve ses deux rangées compactes et reste déplié au départ.

Le glissé suit une convention panorama sur les deux axes, avec une sensibilité réduite. La caméra s’arrête pendant le geste et pendant 0,85 seconde au relâchement, puis reprend progressivement dans la direction choisie. Le raccord manuel privilégie le regard plutôt que la distance jusqu’à l’ancien parcours, contrôle les obstacles et évite le départ à l’opposé lorsqu’une zone est libre devant soi. Sans raccord sûr, elle reste arrêtée avec une indication pour tourner légèrement. Pause/Reprendre permet de garder le contrôle de la marche ; la pause persiste pendant un glissé et remet la vitesse interne à zéro. Les fiches continuent à réserver leur place avant l’arrivée.

Validation locale de cette correction : TypeScript, compilation de production et 246 tests ciblés de navigation/projection/promenade réussis. Les tests comprennent le défaut de départ dans le sens opposé, les orientations successives, la projection du geste panorama, les obstacles, les portes et la remise à zéro de vitesse.

Onze parcours Chrome de la version compilée réussis (2,5 minutes) : glissé, stabilité pendant le geste/relâchement, pause volontaire, quatre changements de direction près des murs, sélection/historique, indicateur du menu, fiche sans recadrage, bandeau déplié et fiche automatique à 978/1440/1920 px, catalogue téléphone sans WebGL à 390×844. Captures finales de la barre, du glissé, du focus et de la visite à 978 px inspectées. Aucun email réel ni publication.

Revue suivante : bouton Pause/Reprendre retiré, fond du menu supérieur rendu presque opaque, À propos/Contact ouverts sans bloquer ce menu. Le bandeau inférieur est agrandi sur ordinateur (boutons, textes, miniatures), en conservant son brun et son ouverture par défaut. La courte pause du glissé et le cadrage selon la hauteur réelle du bandeau restent actifs.

Types, compilation de production, formatage et neuf parcours Chrome finaux réussis (1,9 minute), dont navigation entre rubriques depuis À propos, accès clavier, fermeture et continuité de la promenade, sélection/fiche/carrousel à 978/1440/1920 px et catalogue téléphone. Captures finales `accessible-about-*`, `glass-focus-1440.png` et `restored-artwork-978.png` inspectées. Aucun email réel ni publication.

## Publication et correction des fenêtres — 26 septembre 2026

Les fenêtres Œuvres/Salles utilisent des dialogues non modaux ; À propos/Contact conservent aussi les deux barres accessibles. Les panneaux sont bornés entre le menu supérieur et le bandeau inférieur agrandi. Le fond ferme la fenêtre au clic extérieur, Échap fonctionne et la fermeture respecte le focus de la nouvelle commande choisie. Les œuvres restent dans le bandeau durant les fenêtres éditoriales. La grille sépare prix et disponibilité.

Une nouvelle destination ou l’ouverture d’une fenêtre annule le glissé encore en cours. Son relâchement ne peut plus sélectionner le tableau derrière la souris ni rétablir une ancienne destination. Le geste annulé conserve la pose ; les continuations utilisent le trajet sûr depuis cette pose. La fiche automatique réserve une largeur constante avant d’apparaître, via les mêmes variables CSS que son rendu ; sa présence/absence ne modifie plus le décentrage. Le passage du bureau au téléphone conserve l’œuvre ou le contact courant. Le nom de l’artiste n’est plus répété dans le titre de l’accueil.

Validation locale finale : 29 fichiers/364 tests unitaires réussis ; compilation avec vérification TypeScript réussie. Douze parcours Chrome sur le dernier build réussis : glissé annulé avec relâchement retardé, direction et obstacles, clic sur tableau, sélection/historique, stabilité de la fiche automatique, continuité éditoriale, bandeau/fiches à 978/1440/1920 px et accès aux deux barres dans chaque fenêtre. Six parcours téléphone et trois parcours contact/référencement/aperçus ont aussi passé pendant cette passe. Un test d’aperçus dépendait d’un cache local absent : il simule désormais explicitement une version sans aperçus, sans supprimer les données.

Publication confirmée sur **https://www.juliethiam.art** : `dpl_47SorbYNQYXJLiZiToQXSrX1fmz1`, statut Vercel `READY`. La première compilation hébergée avait réutilisé des styles globaux périmés malgré un fichier source envoyé correct. Une nouvelle compilation avec `vercel deploy --force` a rétabli les règles ; elles ont été vérifiées dans le CSS réellement servi et dans Chrome. L’URL temporaire exigeait la connexion Vercel : les contrôles du site hébergé ont été effectués sur le domaine public après promotion.

Contrôles publics dans Chrome : 26 œuvres Blob, navigation haute/basse dans les quatre fenêtres, fiche devant le tableau, images effectivement décodées, catalogue à 390 px sans WebGL ni débordement, descriptions repliées et accès 3D masqué, contact contextuel avec champs sur une colonne, titre/canoniques/données structurées corrects, robots/sitemap indexables sans administration. Les deux API admin anonymes renvoient 401/no-store et la connexion porte noindex. Aucune erreur JavaScript dans les parcours. Aucun contenu de fixture envoyé au stockage de production.

Les deux aperçus de salles chargent les tableaux réels en production et restent prêts après fermeture/réouverture ; le navigateur ne conserve aucun iframe de capture une fois la préparation achevée.

Captures publiques : [À propos](../artifacts/live-qa/public-domain-final/about.png), [Œuvres](../artifacts/live-qa/public-domain-final/artworks.png), [salles](../artifacts/live-qa/public-domain-final/rooms.png), [catalogue téléphone](../artifacts/live-qa/public-domain-final/phone-catalogue.png). Résultats : `artifacts/live-qa/public-domain-final/results.json`.

Le serveur local a été arrêté après les contrôles publics ; aucun processus n’écoute sur le port 3000. Resend reste non configuré (`contactEnabled: false`) ; l’accès à la messagerie reste disponible et aucun envoi réel n’a été essayé. L’activation attend le compte et le domaine d’envoi vérifié.

## Collections, regard maintenu et reprise rapide — publication suivante

« Toutes les œuvres » dans la visite 3D regroupe maintenant les cartes par collection, dans le même ordre que le catalogue, avec titre et nombre d’œuvres. Les filtres et les cartes sont conservés. La vitesse maximale passe de 0,28 à 0,34 m/s, soit environ 21 % de plus ; les ralentissements dans les virages et les contrôles d’obstacles restent actifs.

Pendant un glissé maintenu, la fiche affiche le tableau visible dans la zone libre de l’écran. Le calcul utilisait encore l’ancienne réserve à gauche et pouvait choisir un tableau périphérique : il partage maintenant les marges réelles du cadrage automatique. La fiche suit le regard même si elle était précédemment survolée et n’influence pas la pose de la caméra. La pause au relâchement passe de 0,85 à 0,25 seconde. La première translation supérieure à 4 mm a été mesurée à 450 ms, localement puis sur le domaine public dans Chrome, sans saut de pose ni collision dans le parcours testé.

Compilation et types réussis, 237 tests ciblés dans quatre fichiers réussis. Dix parcours Chrome distincts exécutés localement, avec recontrôles après correction du calcul de fiche : clic/glissé, direction, obstacles, sélection/historique, annulation par une fenêtre ou une nouvelle sélection, stabilité du cadrage, accès aux deux barres à 978/1440 px, clics rapides et fiche suivant deux tableaux pendant un seul maintien. Les titres, l’ordre, les 26 cartes et les filtres des quatre collections ont été comparés au catalogue à 978 et 1440 px, localement puis en production. Captures inspectées après décodage des images.

Publication actuelle sur **https://www.juliethiam.art** : `dpl_5hBkGKabzbyK8Mz6Du2DCv42Kwgb`, statut `READY`, compilation hébergée sans réutilisation du cache puis promotion réussie. Le test de regard maintenu/reprise passe sur le domaine public. Les contrôles publics de navigation, catalogue téléphone, contact contextuel, métadonnées, robots/sitemap et refus des API admin anonymes passent également, sans erreur JavaScript. Aucun email réel envoyé ni donnée de production modifiée.

## 29 septembre — contact et référencement public

Le pied du catalogue et des pages publiques relie Accueil, Œuvres, À propos et Contact. Le sitemap public contient 30 URL sans `/admin` ; `robots.txt` autorise les pages publiques et exclut l'administration. Resend a vérifié le domaine et les enregistrements DKIM/MX/SPF. Le déploiement `dpl_FEeSv2Dxsqu3q3PW9RTVqWX5ovE4` a activé le formulaire ; l'unique essai réel autorisé a été accepté par l'API Resend puis marqué `bounced` (email `01a0ee36-8955-7783-bd92-b56d51cf0ae3`). Resend a ajouté `contact@juliethiam.art` à sa liste de suppression. La raison SMTP précise reste à lire dans le détail du bounce Resend. Aucune réception dans la boîte destinataire n'est confirmée.

Par précaution, `CONTACT_FORM_ENABLED=0` en Production désactive l'envoi et laisse le lien direct `mailto:` disponible. Le déploiement `dpl_7ibyV5Yg7nTeAFFF6rDLehMP6vM9` est `READY` sur le domaine public ; l'API expose `contactEnabled: false` et l'adresse publique `contact@juliethiam.art`. La page masque les champs tant que le formulaire est coupé pour ne pas faire saisir un message qui ne pourrait pas partir. Ne pas envoyer un autre test réel sans autorisation renouvelée.

À la demande du propriétaire, le destinataire du formulaire reste `contact@juliethiam.art`, dont la redirection Infomaniak doit remettre les messages à la boîte Proton. L'option temporaire d'envoi direct à Proton a été retirée et le déploiement `dpl_HBctMEL32hWz6rvX3CGzdLK7hLJG` est `READY`. Le formulaire reste désactivé : Resend a mis l'alias en suppression après le premier bounce. Le détail Resend indique `smtp; 550 5.1.1 <contact@juliethiam.art>: Recipient address rejected: User unknown in virtual mailbox table`. La capture Infomaniak fournie plus tôt montre une icône grise à côté de la destination Proton ; la documentation Infomaniak indique que la redirection ne fonctionne pas tant qu'au moins un destinataire n'a pas confirmé son ajout par email. Faire vérifier ce statut dans Infomaniak et accepter l'invitation dans Proton, ou renvoyer l'invitation depuis le menu de la redirection. Ensuite seulement, lever la suppression Resend et confirmer la livraison d'un nouvel essai autorisé avant de réactiver le formulaire.

Captures publiques : [collections à 1440 px](../artifacts/collection-finish/live/collections-1440.png), [séparation à 978 px](../artifacts/collection-finish/live/next-collection-978.png), [fiche pendant le regard maintenu](../artifacts/experience-qa/held-gaze-information.png). Résultats : `artifacts/collection-finish/live/results.json` et `artifacts/live-qa/collection-and-gaze/results.json`.

Le serveur local a été arrêté après les contrôles publics. Aucun processus n’écoute sur le port 3000. Ces mesures sont celles de Chrome sur le Mac, sans test sur téléphone physique.

## 29 septembre — confirmation du formulaire et nouvel essai réel

Le formulaire envoie désormais deux emails transactionnels avec des clés d’idempotence distinctes : la demande à l’adresse publique de contact, puis un accusé de réception au visiteur. L’accusé reprend la direction graphique de la notification, avec l’objet et le titre « Message bien envoyé ». Il ne recopie pas le message du visiteur. Si l’envoi de l’accusé échoue après l’acceptation de la demande, le site signale ce seul échec sans inviter à renvoyer la demande et risquer un doublon.

Les 368 tests unitaires passent, ainsi que la compilation locale et celle de Vercel. Aperçus ordinateur et mobile : `artifacts/contact-preview/confirmation.png` et `artifacts/contact-preview/confirmation-mobile.png`. Déploiement `dpl_5CLET3NkJmMKvYshXEGphf865XEf` : `READY` sur `https://www.juliethiam.art`. L’API publique expose `contact@juliethiam.art`, le formulaire actif et 26 œuvres ; `/contact`, `/robots.txt` et `/sitemap.xml` répondent 200, l’API admin anonyme 401.

Une seule soumission réelle a été faite depuis le formulaire public avec l’adresse de test fournie par le propriétaire. Le site a affiché le succès et l’accusé accepté. Resend indique `delivered` pour la demande à `contact@juliethiam.art` (`01a0ef4f-6c43-73b4-ba23-041c8139f421`) et pour l’accusé au visiteur (`01a0ef4f-6d36-76eb-bedc-3e5b6de9561a`). Ces statuts prouvent la remise SMTP rapportée par Resend ; la présence effective dans les boîtes Proton et Free doit être confirmée par leurs utilisateurs. La suppression Resend de l’alias avait été retirée avant ce test avec autorisation du propriétaire.
