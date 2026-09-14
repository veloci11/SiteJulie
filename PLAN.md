# Galerie — plan de réalisation

## Dernière passe : vues dégagées et marche entre pièces

La passe [Finitions V7](docs/FINITIONS_V7.md) simplifie le passage du portail, conserve la promenade à la fermeture des fenêtres et retire les reliefs décoratifs en préservant les inserts de noyer. Les contrôles de cette passe sont détaillés dans son rapport. L’administration et l’ordre indépendant par collection restent conservés. Aucune nouvelle salle n’est activée.

## Historique : finitions et circulation V3

1. Conserver les salles appréciées, réduire les pots et détailler deux grands figuiers dont un central dans la seconde salle ; mobilier et sculptures asymétriques et variés.
2. Remplacer le portail terminal fermé par un véritable mur plein, vérifier les jonctions mur/sol et les volumes de circulation.
3. Calculer des trajets directs à hauteur humaine, sans pivots imposés ni longues phases sur un rail, avec contrôle des collisions et de la rotation.
4. Aligner exactement aperçu d’arrivée et première pose, révéler la scène immobile avant la promenade ; retirer play/pause et légende du hero, clarifier les boutons du dock et reprendre les inscriptions murales.
5. Vérifier les exports dans le vrai navigateur, les transitions, le raccord de l’image, les formats mobiles et la charge GPU ; régénérer les images privées d’arrivée et compiler la livraison locale.

Ces cinq étapes sont réalisées et vérifiées dans [Finitions V3](docs/FINITIONS_V3.md) : 61 tests unitaires, compilation, 15 tests navigateur puis six recontrôles ciblés après correction de l’horloge de caméra, captures natives et WebKit, raccord d’arrivée et mesures de performance.

1. Lire le brief, préserver les sources, verrouiller les contrats et les dépendances.
2. Fabriquer une architecture Blender exportable et une scène Three.js navigable.
3. Intégrer l'interface, le catalogue HTML et le contact contextualisé.
4. Administration persistante locale de démonstration et adapter Supabase sécurisé, migrations et médias privés.
5. Vérifier types, compilation, parcours réels et captures ordinateur/mobile. Documenter les accès externes manquants.

## Décisions

- Projet dans /Users/mathis/SiteJulie ; originaux ImageOeuvre préservés.
- React 19.2 avec Fiber 9 (Fiber exclut actuellement React 19.3), Next 16, Node 24.
- Aucun prix, identité, biographie ou email inventé. Les œuvres portent des titres provisoires.
- Le mode local est explicitement une démonstration, désactivé en production. Supabase nécessite les accès du propriétaire.
- Aucun déploiement ni envoi d'email autorisé dans cette intervention.

## État livré

- Deux salles contemporaines à plafonds fermés, décor crème/bois/lin puis terre rosée/céramiques, grands figuiers et éclairage calculé dans Blender. Les sources et la chaîne d’export sont documentées.
- Huit œuvres intégrées, les quatre portraits dans la première salle et les quatre autres peintures dans la seconde. Les dimensions physiques restent à fournir ; le rapport des images est préservé.
- Promenade d’accueil continue, lente et sans balancement ; la sélection d’une œuvre interrompt l’automatisme, tandis que le changement de salle démarre la promenade dans la nouvelle pièce. Les popups éditoriaux font marcher la caméra dans la salle courante et leur fermeture conserve la promenade au même point de la boucle. Les mouvements réduits du système restent respectés. Une image du musée apparaît avant la 3D avec le même cadrage.
- Visite, cadrage complet des œuvres et cartels, menus, miniatures, retour navigateur et catalogue HTML fonctionnels sur formats ordinateur et téléphone. Le bandeau ne se réduit plus sur ordinateur.
- Administration locale persistante, placement visuel sur les murs, présentation vendue et traitement média testés en session publique distincte. Intégration Supabase et migrations préparées, service externe non configuré/non validé.
- Compilation production et tests métier exécutés ; captures Chrome et WebKit réelles. Voir docs/FINITIONS_V7.md et docs/DELIVERY_AUDIT.md pour les résultats actuels et limites. Les essais de formats mobiles ne constituent pas une mesure sur téléphone physique.
- Site servi en prévisualisation locale avec `npm start` depuis la véritable sortie standalone ; pas de publication sur Internet.

## À faire avec les informations et accès du propriétaire

Nom/biographie/email/titres/techniques/dimensions/prix et disponibilités confirmés ; projet Supabase + administrateur, tests des politiques réelles, hébergement et accord de publication. Les photos supplémentaires de détail et portrait facultatif ne sont pas encore dans l’éditeur.
