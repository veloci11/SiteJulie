# Expérience de visite — 21 septembre 2026

## Navigation et présentation

- Ancienne carte « Au fil de la visite » remplacée par une fiche détaillée et cliquable, liée à l’œuvre réellement dans le champ de la caméra. Les miniatures restent un choix manuel.
- Menu ivoire compact et flottant (58 px sur ordinateur, 52 px sur téléphone), état actif discret, libellé Menu sur téléphone et titre « Julie Thiam — Artiste peintre ». Aucun changement de domaine. Aucun lien vers l’administration dans le site public : accès par URL uniquement.
- Miniatures visibles sur téléphone, flèches de défilement, retour au début lors du changement de collection et possibilité de réduire le bandeau. Le bandeau se réduit pendant le focus pour libérer la peinture ; « Les œuvres » ouvre alors le sélecteur.
- Précédent/suivant partent de la dernière destination demandée, même après plusieurs activations dans une seule frame. Un clic sur un tableau pendant un trajet peut sélectionner ce tableau ; le clic dans le vide conserve la sortie du focus.
- Pop-up « Vers… / Arriver directement » retirée à la demande de l’utilisateur. Bouton pause/lecture retiré du bandeau à la demande de l’utilisateur ; mouvement réduit respecté.
- Cadrage adapté au bandeau compact et au bouton de retour. Les très faibles vitesses de rotation restent conservées à l’interruption au lieu d’être annulées par un seuil trop élevé.
- L’accroche d’accueil ne revient plus à chaque sortie d’une œuvre. Les fenêtres À propos/Contact conservent leur parcours existant.

## Image d’arrivée actualisée

La capture publique est toujours liée à l’empreinte de l’accrochage courant. Les modifications ne permettent jamais de relire une ancienne révision via une URL conservée.

En serveur local, les sauvegardes d’œuvres, collections, salles, paramètres et médias déclenchent désormais la génération après la réponse HTTP. En hébergement Blob, l’atelier connecté capture les vues de chaque salle, ordinateur et portrait, depuis la vraie scène Three.js dans un cadre interne authentifié. Il faut garder l’atelier ouvert pendant la capture ; si l’onglet est fermé, la prochaine ouverture reprend la génération. Un statut indique la progression et propose Réessayer en cas d’échec. Une révision remplacée pendant la capture provoque une nouvelle tentative.

Les images sont décodées et réencodées côté serveur, limitées en poids/résolution, stockées en privé et publiées en un lot complet. Le marqueur de disponibilité n’est écrit qu’après toutes les vues. Une sauvegarde en cours n’est pas bloquée par le rendu. Le navigateur public vérifie aussi la version de l’aperçu pendant son chargement initial.

L’exception d’intégration dans une frame est limitée à `/admin/arrival-capture`, authentifiée, avec `SAMEORIGIN` et `frame-ancestors 'self'`. L’API d’écriture exige une session administrateur, une origine correcte et l’empreinte courante ; aucun token Blob n’est envoyé au client. La lecture suit le SDK installé, [documentation officielle Vercel Blob](https://vercel.com/docs/vercel-blob/using-blob-sdk).

Le stockage Blob est vérifié avec un adaptateur simulé dans les tests ; aucune écriture Blob de production ni publication n’a été effectuée. Le parcours complet rendu/écriture/relecture a été exécuté sur stockage local jetable.

## Vérifications et preuves

- TypeScript et compilation Next.js réussis. Suite complète : 270 tests réussis avec `npx vitest run --maxWorkers=2`.
- Cinq parcours Playwright Chrome réussis : 1440×900, 390×844, 320×568, 667×375 ; défilement réel, collections, clics rapides, retour/rechargement, contact, fermeture/focus, absence de débordement et maintien d’un Canvas pendant la navigation. Promenade réelle, interruptions et changement de salle également vérifiés.
- WebKit 390×844 : sélection, œuvre suivante, Contact, Échap, sans erreur JavaScript.
- `scripts/arrival-browser-qa.mjs` : deux lots réels de quatre captures, dont un déclenché par l’enregistrement du titre dans l’administration ; ancienne URL relue avec les nouvelles données ; affichage avant JavaScript ; requête anonyme refusée et données principales inchangées. Rapport `artifacts/experience-qa/arrival/report.json`, `passed: true`.
- Captures du site dans `artifacts/experience-qa/`, avant/après ordinateur et téléphone, tableau horizontal, déplacement, WebKit ; captures d’arrivée et administration dans le sous-dossier `arrival/`. Les captures finales ont été inspectées.
- Les formats mobiles sont émulés sur ce Mac, pas testés sur un téléphone physique. Le test de qualité média dépasse parfois son délai de 5 secondes lors d’une forte concurrence CPU ; il réussit isolément. La suite est contrôlée avec un nombre de workers limité.

Modifications locales : publication et changement éventuel d’adresse non effectués.

## Optimisation du chargement

La suite du travail sépare le chargement de chaque salle, donne la priorité à l’entrée demandée et réutilise les images dans le catalogue. Les captures d’arrivée attendent toujours le musée complet. Voir `CHARGEMENT_PROGRESSIF.md` pour le comportement, le TTL des images privées et les mesures réseau.

### Harmonisation des commandes

Palette ivoire/vert sombre partagée avec le catalogue (`--paper`, `--ink`), fond de barre opaque et bord plus lisible, dimensions conservées. Bouton plein écran et son gestionnaire retirés. Le changement de vue devient « Catalogue » avec une icône de livre ; le retour « Visite 3D » utilise le même bouton contrasté. « Collections : » précède les noms propres à la salle, dans le bandeau de sélection et l’accroche de la salle. Le libellé reste hors du `tablist`, afin de préserver la navigation clavier entre les collections.

TypeScript, compilation et cinq parcours Chrome réussis après ces changements. Contrôle comparatif des deux vues à 1440 et 390 px : couleurs calculées identiques, barre 58/52 px, aucun plein écran ni lien admin, sélection des collections au clavier fonctionnelle. Captures inspectées dans `artifacts/navigation-style/`.


### Fiche automatique et bandeau simplifié

Le bouton pause/lecture et son état dédié ont été retirés. La fiche automatique utilise `onTourArtwork` du contrôleur existant ; elle ne choisit plus une œuvre de remplacement dans la collection affichée. Elle apparaît uniquement dans la vue générale automatique, hors déplacement, menu ou mouvement réduit. Un clic utilise la même navigation que les tableaux et le carrousel. Le survol ou le focus stabilise le contenu pour ne pas remplacer la cible pendant l’interaction.

La fiche se place au-dessus du bandeau, dont la hauteur est observée, et ne recouvre pas ses commandes. Vérifications : cinq parcours Chrome réussis, correspondance avec l’identifiant détecté par la caméra, clic vers la bonne œuvre, maintien du Canvas, absence de pause/lecture ; contrôles spécifiques à 390, 320 et 667 px, sans débordement ni cible masquée. Captures `artifacts/experience-qa/automatic-*`. TypeScript et compilation réussis.

La rotation libre au clic-glissé a été proposée comme interaction ; elle n’a pas été ajoutée dans cette modification.


### Derniers ajustements demandés

Fiche automatique revenue à une présentation proche de l’ancienne : panneau sombre de 280 px, image de 144 px de haut, collection, titre, prix et extrait de description. Sur téléphone, carte plus large avec image de 90 px et action visible. La hauteur disponible au-dessus du bandeau limite le panneau pour conserver les commandes accessibles.

Indicateur discret « Chargement de la visite… » sur le poster initial, retiré quand la première salle est prête. Animation désactivée si le visiteur préfère le mouvement réduit. Suppression complète de la pop-up de trajet et du bouton « Arriver directement » ; les déplacements continuent naturellement. Vérifications après modification : parcours automatique complet avec clics rapides et changement de salle, chargement 3D volontairement bloqué puis libéré à 1440/390/667 px, apparition/disparition de l’indicateur, fiche non masquée et clic vers la bonne œuvre. TypeScript et compilation réussis ; captures `loading-hint-*` et `restored-preview-*` dans `artifacts/experience-qa/`.

Positionnement précédent : indicateur de chargement centré dans l’image (texte 13 px, anneau 17 px) ; panneau automatique au bord droit à 24 px et centré verticalement sur ordinateur, hauteur bornée pour laisser le bandeau accessible. Sur téléphone, il conserve sa position au-dessus des commandes. La description provient exclusivement de la collection, sans remplacement par celle d’une œuvre. Vérification navigateur des positions, de la disparition du chargement et du texte exact du catalogue ; captures `loading-centered-*` et `preview-right-collection.png`. TypeScript réussi.


### Bandeau conservé et cadrage responsive

L’indicateur de chargement est désormais centré à 78 % de la hauteur de l’écran. La sélection d’une œuvre conserve les miniatures et les onglets de collection ; le bouton de réduction reste utilisable. Sur téléphone, les miniatures privilégient l’image et le titre, avec une fiche placée au-dessus de la hauteur réellement mesurée du bandeau. Le paysage conserve également les miniatures.

Sous les noms des collections, « Voir les autres collections » rejoint la salle suivante par la navigation existante. Aller-retour vérifié en navigateur à 1440, 390 et 320 px.

Le contrôleur de caméra observe le bandeau et la fiche pour calculer le rectangle libre et réajuster la distance et le décentrage. Le focus continue d’utiliser les dimensions du tableau, le cadre, le cartel et les limites de la salle. Une modification du bandeau ou de la taille de fenêtre déclenche le recadrage sans remplacer le Canvas.

Vérifications locales : TypeScript, 47 tests de navigation/projection et cinq parcours Chrome réussis. Projection des quatre coins des 26 œuvres vérifiée dans le vrai navigateur à 978×878, 1440×900, 390×844, 320×568, 667×375 et 700×600. Captures `framed-*`, `retained-strip-*`, `other-collections-*` et `loading-78-*` dans `artifacts/experience-qa/`. Tests mobiles effectués avec des tailles de fenêtre Chrome, pas sur un GPU de téléphone physique. Aucune publication.

### Taille des œuvres pendant la promenade

La promenade adapte progressivement son champ de vision au cadre de l’œuvre la plus proche du centre du regard. Le calcul réutilise `artworkSize` (ratio de l’image et `displayScale` de l’admin) et les coins du cadre, avec la place occupée par le bandeau et la fiche automatique. Il est recalculé avec les données publiques courantes ; aucun réglage de taille n’est figé dans le parcours. La marche conserve son trajet validé. La reprise après un focus revient à un champ au moins aussi large que la vue générale, sans conserver indéfiniment le zoom précédent.

« Reprendre la visite » reste propre à une œuvre sélectionnée et n’apparaît plus pendant le changement de salle depuis « Voir les autres collections ». Passage réel entre salles vérifié à 1440 et 390 px, sans erreur JavaScript. Tests de projection sur plusieurs murs, ratios et échelles d’affichage réussis, ainsi que les 47 tests de navigation existants. Captures de la promenade : `automatic-adaptive-*`.
