# Navigation et commandes — V8

Cette passe corrige les annulations qui repartaient vers un point du circuit, les regards indépendants de la marche, et les sélections d’œuvres dans une autre pièce. Elle remplace le raccord d’annulation décrit dans V7.

## Comportement

- La fermeture d’une œuvre (croix, Échap ou clic extérieur, y compris pendant le trajet) abandonne sa destination. La promenade reprend depuis la pose effectivement rendue et son mouvement courant.
- Un préfixe courbe, contrôlé contre les volumes de collision, rejoint une allée dans le sens de circulation le plus naturel depuis la pose courante, dans l’un ou l’autre sens du circuit. Le sens reste ensuite stable pendant la boucle. Quand un raccord immédiat serait trop serré, une courte décélération conserve l’élan avant une reprise tournée vers l’allée. Il n’y a aucun retour à une ancienne phase ou à une pose d’accueil.
- Au voisinage de la porte, le choix de la salle suit l’intersection du mouvement avec l’ouverture réelle. Le visiteur qui entre dans la pièce suivante n’est pas renvoyé vers celle qu’il quitte.
- Le regard de la promenade suit le déplacement avec vitesse et accélération limitées. La marche ralentit dans les virages ; elle ne s’arrête pas devant chaque œuvre. La caméra ne recadre ni ne zoome automatiquement à la fermeture d’une fiche. Une vitesse de recadrage déjà engagée s’amortit dans son sens, sans retour opposé.
- Une sélection d’œuvre hors salle oriente d’abord le visiteur vers son chemin, franchit la porte en regardant devant, puis cadre l’œuvre. Si l’œuvre exige de regarder derrière le sens d’approche, le dernier changement de direction se fait au point d’observation, sans translation à reculons.
- Le système conserve un seul Canvas, une seule caméra et CameraControls comme propriétaire de sa pose. Les menus suspendent la promenade ; les fenêtres À propos/Contact la laissent continuer. Une interruption n’utilise plus le trajet ordinaire vers une salle.

## Interface

Un seul sélecteur donne le nom de la collection, sans pagination 1/2–2/2. « Précédente » et « Suivante » sont regroupées dans le bandeau avec les miniatures. Les doublons de changement de salle et de pagination de fiche ont été retirés. Le grand titre et le bouton de découverte restent sur l’accueil ; à l’intérieur d’une collection, seul son nom accompagne la vue dégagée. Le catalogue, le contact et l’administration sont préservés.

## Vérification

Les preuves de cette passe sont dans `artifacts/finishing-v8/`. La compilation production et TypeScript passent. La matrice CPU emploie les placements et formats réels : 16 reprises immobiles, 96 interruptions, 24 annulations aux seuils de porte, huit sélections successives et quatre boucles initiales de deux tours, ainsi qu’un contrôle d’absence de recadrage. Les tests vérifient collision, continuité, reprise, regard vers l’avant et absence de second franchissement du portail après annulation. Les tests du planificateur, du cadrage et du budget de rendu restent inclus.

Les longues distances restent des déplacements physiques : une traversée de 20–24 mètres avec rotation préalable peut durer 18–21 secondes. Aucun fondu ou téléportation ne cache ce trajet. Le bouton d’arrivée directe reste disponible.

Les relevés navigateur définitifs et captures sont consignés après exécution ; les tests CPU ne prouvent pas à eux seuls le confort visuel ou les performances d’un téléphone physique. Les réglages système et les données administratives principales restent inchangés.

### Contrôles de la version finale

- `build-final.log` et `typecheck-final.log` : compilation et types réussis.
- `promenade-final.log` : 149 tests du nouveau moteur passent. `all-cancels.json` étend le contrôle à 336 annulations couvrant toutes les paires d’œuvres dans deux formats ; aucune erreur de raccord, collision ou marche arrière observée.
- Contrôle du vrai Chrome via MCP : sélection d’une œuvre de l’autre salle, reprise par le bouton puis ouverture/fermeture d’À propos. La même navigation reste active derrière le dialogue (id 2, temps de promenade de 17,306 à 31,731 secondes). La vue continue sans fiche résiduelle. Le bandeau montre les noms « Visages » / « Récits & paysages », sans pagination de salle.
- Les captures `portal-cancel-390.png` et `portal-cancel-1440.png` montrent la promenade après annulation au seuil. Le raccord final peut choisir l’autre sens de visite pour rester dans l’allée située devant le visiteur ; il n’impose plus un détour transversal vers le côté opposé du circuit.

Le premier essai de boucle en SwiftShader logiciel n’a parcouru que 40,6 % du circuit en 130 secondes (450 images). Le moteur plafonne volontairement le temps simulé par image à 100 ms pour éviter une grande secousse après un gel. Ce résultat ne mesure donc pas la cadence d’un Chrome utilisant normalement le GPU. Le mode de test `MUSEUM_QA_NATIVE_GPU=1` conserve le rendu normal de Chrome pour les contrôles temporels ; SwiftShader reste disponible pour les vérifications fonctionnelles sans GPU.

- `browser-final.log` : dix parcours passent avec le rendu normal de Chrome, dont une boucle complète, les deux sens de passage, fermeture/annulation aux formats 1440×900 et 390×844, annulation d’un changement de collection déjà entré dans la salle cible, maintien du budget Retina et continuité d’À propos/Contact. L’essai précédent en rendu logiciel est conservé pour distinguer son échec temporel du résultat final.
- `webkit/report.json` : fermeture et reprise réussies en WebKit macOS sur les deux formats Retina, sans erreur JavaScript. Budgets réels conservés : 1697×1060 sur ordinateur et 487×1055 sur mobile. Les sept secondes relevées incluent une attente initiale de présentation d’environ une seconde ; elles ne constituent pas un benchmark comparatif de fluidité. Aucun iPhone physique ni Safari natif n’a été testé pendant cette passe.
- L’aperçu intégré a été rechargé sur la version finale : noms de collection seuls, nouvelles commandes présentes et promenade active. Le serveur production local est laissé sur `http://127.0.0.1:3000/`.
- Les empreintes de `.local/data.json` et `.local/seed.json` sont identiques à celles relevées avant la passe. Aucun enregistrement administrateur, changement d’œuvre ou de média original n’a eu lieu.
