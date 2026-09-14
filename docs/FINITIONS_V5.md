# Collections, enregistrement et transitions entre salles

Cette passe suit le retour utilisateur : le passage entre deux salles était trop long, la promenade devait redémarrer dans la salle visitée, l’espace restait trop vide et l’atelier ne rendait pas clairement le résultat de l’enregistrement ni l’organisation par collection.

## Navigation

Le bouton de changement de salle utilise un fondu couleur pierre d’environ 1,4 s. La caméra reste fixe pendant la fermeture du voile ; elle change de position uniquement après une image entièrement opaque, puis la nouvelle salle est révélée. Cela évite d’accélérer un demi-tour et une traversée de plusieurs mètres. La promenade démarre directement sur sa boucle, à vitesse nulle puis progressivement à 0,35 m/s, sans second trajet d’approche. Il s’agit d’une transition masquée entre pièces, pas d’une marche accélérée à travers la porte.

Une sélection explicite de tableau arrête l’automatisme. Un clic à côté garde le tableau sélectionné. Les popups éditoriaux conservent la promenade derrière eux et leur fermeture fige la vue. La préférence de mouvement réduit reste respectée. Les flèches et le balayage passent aux œuvres de la collection courante, avec un compteur 1 à N ; le changement de collection passe par les salles ou le menu des œuvres.

## Atelier

Le cas d’échec reproduit provenait du champ de collection libre : une différence de nom était considérée comme une nouvelle collection incompatible avec la salle occupée. L’API renvoyait 409, mais le message était très loin au-dessus du bouton Enregistrer, hors du viewport. Les enregistrements ordinaires des huit œuvres existantes répondaient correctement.

Les collections sont maintenant des groupes explicites, liés à leurs salles existantes. Le sélecteur déplace l’œuvre dans la salle de la collection choisie et propose un emplacement compatible ; le choix manuel du mur et les ajustements restent disponibles. L’ordre est présenté à partir de 1 dans chaque collection et l’insertion renumérote les voisins dans une même écriture. Les révisions protègent toujours des éditions concurrentes. Les erreurs et le succès sont affichés dans la zone d’enregistrement. L’ajout de salles est retiré du parcours courant, conformément à la demande de le traiter plus tard.

La lecture des anciens classements globaux conserve leur ordre relatif tout en présentant des numéros locaux. Elle n’écrit pas dans les données principales. Le catalogue HTML regroupe aussi les œuvres par collection. L’empreinte des images d’arrivée utilise le même ordre normalisé que le catalogue public.

## Architecture

Quatre retours muraux structurent les deux salles existantes. Les niches creusées, les tablettes, les livres et les céramiques appartiennent au décor ; les œuvres et les emplacements administrables restent indépendants. Les cloisons conservent l’allée de circulation et sont incluses dans le contrat de collision. La silhouette et l’éclairage ont été inspectés dans le navigateur après les exports. Le décor actif complet pèse 4 390 812 octets (4,19 Mio), avec 306 338 triangles et 48 lots, hors œuvres et application. Les quatre cloisons ajoutent environ 201 Ko ; la résolution des atlas reste inchangée. Les sources, UV et preuves de raccord sont documentées dans `CONTEMPORARY_ROOM_ASSETS.md`.

## Vérifications

- Build final `npm run build` réussi avec TypeScript, nouveaux modèles/manifeste et correction du titre mobile administratif. `npm test` : 83/83 tests réussis avec le manifeste final, dont les parcours/collisions et les contraintes d’accrochage.
- Interface publique/mobile et promenade : 9 scénarios publics et mobiles, puis 7 scénarios de promenade réussis sur le code final avant l’installation des nouveaux modèles. Un ancien test supposait toutes les œuvres disponibles alors que l’utilisateur en avait réservé une ; il compare désormais la scène au catalogue public et passe, sans modifier les données.
- Les scénarios de promenade contrôlent le fondu court dans les deux sens, le saut de pose uniquement sous un voile opaque, l’absence de second trajet, la reprise de la boucle, les menus, le mouvement réduit et la fermeture des popups. Le test du cycle complet vérifie aussi une marche continue sans arrêt.
- `MUSEUM_VIEWS_OUTPUT=artifacts/finishing-v5/views node scripts/museum-finishing-v4-qa.mjs` : 20 vues du build et des modèles finaux, sur 1440×900, 701×600, 390×844, 320×568 et 667×375. Aucun débordement des commandes ni erreur JavaScript. Les captures du hall, du salon et du téléphone ont été inspectées : niches et retours visibles, mobilier et œuvres préservés.
- `node scripts/museum-webkit-qa.mjs` : formats 390×844 et 1440×900 réussis, tableau entier, compteur/cycle dans sa collection et historique avec Canvas conservé. Résultats dans `artifacts/finishing-v5/webkit/`.
- `npx tsx scripts/capture-arrival.ts` : six images du vrai musée actualisées. `node scripts/museum-arrival-alignment-qa.mjs` : raccord vérifié sur quatre formats, écart moyen de 1,17 à 2,49 sur 255. `tests/e2e/arrival.spec.ts` : 2/2 réussis, notamment image visible sans JavaScript et ressources 3D volontairement retardées.
- `node scripts/admin-save-collections-qa.mjs` : parcours final réussi, enregistrement et erreur explicite, champs requis, collection/salle, insertion 1..N, révisions, persistance disque et reconnexion. Le titre long mobile reste dans sa carte et les messages sont près du bouton. `node scripts/admin-sold-webgl-qa.mjs` : œuvre déplacée, réduite et vendue correctement visible avec les nouvelles cloisons, cartel entier ; comparaison avec l’état disponible, médias inchangés. Deux fixtures supprimées et processus fermés. Captures et détails dans [le guide de placement](ADMIN_PLACEMENT.md).

`node scripts/museum-room-transfer-qa.mjs` a réussi sur Chrome natif / ANGLE Metal Apple M1 Pro, 1440×900 et densité2, après fermeture des autres tests et arrêt de Blender. Le voile visible mesure 1,33 s et 1,40 s dans les deux sens ; médiane et 95e percentile des intervalles de présentation à16,7 ms. Chaque repositionnement s’effectue avec l’image précédente et l’image courante entièrement couvertes (opacité1). Aucune phase « joining » ensuite : la marche parcourt 25 à27 cm pendant le contrôle du démarrage doux. La sélection d’une œuvre stoppe la promenade, un clic vide conserve sa pose, et le même Canvas est préservé. Aucun échec ni erreur JavaScript. Mesures et captures : `artifacts/finishing-v5/transfers/report.json`. Ce relevé concerne ces transitions sur le Mac, pas un benchmark de téléphone.

Le serveur local final est actif sur `http://127.0.0.1:3000` depuis la sortie standalone vérifiée. Aucune nouvelle salle n’a été activée.

Les sources d’œuvres et les données principales sont préservées : empreinte de `data.json` avant/après `39df2761918a320e8ff57e3447e0be118fb6728ee15f2c3d1ad65ceb517e1473`, seed `0789570affe01afa627a4b32c688c68cd1e65313f5e294bdc8f0b49c647cd18d`. La migration Supabase d’ordre par collection est fournie pour une installation ultérieure ; aucun service distant n’est modifié. Les essais sur formats mobiles ne remplacent pas une validation sur téléphone physique.
