# Administration — ergonomie et fiabilité

Intervention locale du 21 septembre 2026, avec clarification du plan et du choix des salles. Rapport navigateur final horodaté : `artifacts/admin-ergonomics/report.json` (22 septembre UTC). Aucun déploiement ni changement des données de production.

## Problèmes constatés et corrections

- L’image exigeait un titre et déclenchait une sauvegarde implicite de la fiche. Elle peut maintenant être choisie ou déposée en premier, vérifiée et prévisualisée localement. L’envoi et le traitement attendent l’enregistrement explicite ; le remplacement peut être annulé.
- Un changement d’écran supprimait les saisies sans avertissement. La navigation, la déconnexion et la fermeture/recharge protègent maintenant les modifications en attente, y compris dans Textes & contact.
- L’image commençait à 2 561 px du haut sur téléphone. Elle arrive maintenant à 472 px dans le scénario de création à 390 × 844. Les rubriques Vente & prix et Collection & accrochage sont repliables. L’ordre de lecture et de tabulation suit l’ordre visuel.
- La conversion du prix à chaque frappe perturbait les décimales. La saisie conserve le texte, accepte virgule ou point, distingue vide et zéro et refuse plus de deux décimales. Les champs invalides dans une rubrique repliée deviennent visibles et reçoivent le focus.
- Les deux salles existantes sont pleines : 14 + 12 œuvres. La capacité est visible. La création d’une collection propose l’activation explicite d’une salle supplémentaire, jusqu’à quatre salles. L’ajout général privilégie une collection ayant encore de la place. Aucun ajout de salle n’a été effectué dans les données principales.
- Les requêtes concurrentes et les erreurs d’import pouvaient laisser un état trompeur. Les contrôles sont bloqués pendant les opérations, les étapes sont affichées et les échecs distinguent la fiche enregistrée de l’image restant en attente. Réessayer ne crée pas de tableau en double.
- Les réponses serveur non JSON et les expirations de session donnent un message récupérable. Une reconnexion peut se faire dans un autre onglet sans vider la fiche. Recharger une version modifiée ailleurs demande confirmation.
- Dans les stockages local et Blob, la finalisation d’une image contrôle désormais la révision capturée à la création de l’envoi et valide le nouveau ratio dans son emplacement avant de remplacer l’image publiée.
- La recherche porte sur titres et collections sans distinguer accents ou majuscules, les filtres affichent leurs effectifs et une recherche vide propose de réinitialiser les filtres. Chaque collection propose l’ajout direct.
- Contrastes, boutons secondaires, repères pour lecteurs d’écran et restauration du focus à la fermeture de la fenêtre de collection ont été corrigés.
- Le repérage des murs dispose d’un plan de salle avec orientation fixe A/B/C/D, passages réels et tableau sélectionné en bleu. Le plan utilise toute la largeur sur téléphone, numérote chaque place et permet de cliquer directement sur un mur. La flèche tourne vers le mur consulté. Les petits tableaux bas ont leur propre point et état d’occupation. Le code d’emplacement est repris dans la vue de face et la liste des places, avec les miniatures et titres voisins. Consulter un mur ne déplace pas l’œuvre ; l’encart conserve son emplacement et propose de revenir au tableau. Sélectionner à nouveau sa propre place conserve les décalages.
- La création de collection propose des cartes de salles sélectionnables au clic et au clavier, avec les collections existantes, la capacité et l’ordre des connexions. Une salle complète déclenche une explication avant la création. Les actions restent visibles pendant le défilement de la fenêtre sur téléphone.
- Le repère d’accrochage est visible dès la liste des œuvres et dans la rubrique repliée. Le texte du champ d’ordre précise que changer l’ordre dans une collection ne déplace pas les tableaux sur les murs.

## Vérifications exécutées

- Compilation de production Next.js et TypeScript réussis sur la version finale.
- 47 tests réussis dans les suites admin, admin-rooms, blob-admin, blob-data, placement, public et arrival-generation. Incluent la concurrence pendant l’envoi, le refus d’un ratio incompatible, la confidentialité du brouillon et les trajets entre quatre salles.
- Après ajout du plan, 11 tests placement et placement-guide réussis : codes uniques dans les quatre salles, œuvres basses, orientation indépendante de la translation de salle et topologie des passages. Contrôle TypeScript répété avec succès.
- 21 groupes de contrôles navigateur réussis sur une copie jetable : ouverture/enregistrement des 26 tableaux existants ; création avec photo avant titre ; saisies non enregistrées ; salle pleine puis nouvelle salle/collection ; publication ; prix public puis masqué ; disponibilité vendue ; erreurs serveur ; nouvelle tentative d’envoi ; session expirée ; deux onglets concurrents ; placement ; dépublication/republication/archivage ; textes ; reconnexion ; WebKit portrait/paysage. Le plan est parcouru au clic et au clavier sans changement de fiche, les voisins sont visibles, le déplacement explicite vers B1 est conservé uniquement après sauvegarde et la dernière salle indique son passage vers la précédente et son mur fermé. Les deux tableaux bas sont repérés individuellement. Le sélecteur de salle fonctionne aux touches fléchées, conserve le nom saisi et garde ses actions visibles à 390 × 844.
- Chrome 1440 × 900 et 390 × 844 ; WebKit 390 × 844 et 844 × 390. Aucun débordement horizontal dans les formats mobiles testés. Aucun téléphone physique testé.
- Œuvre publiée dans la troisième salle affichée dans le vrai WebGL sous Chrome avec SwiftShader. Vérification fonctionnelle, pas une mesure de performance GPU physique.
- Analyse axe de l’éditeur et de la fenêtre de création de collection : zéro violation détectée. Ce résultat ne constitue pas une certification complète d’accessibilité.
- Aucune erreur JavaScript relevée dans les pages instrumentées. Empreinte de `.local/data.json` inchangée, serveur et copie de la campagne d’acceptation supprimés.

Captures du navigateur :

- `artifacts/admin-ergonomics/creation-desktop.png`
- `artifacts/admin-ergonomics/creation-mobile.png`
- `artifacts/admin-ergonomics/placement-desktop.png`
- `artifacts/admin-ergonomics/settings-mobile.png`
- `artifacts/admin-ergonomics/webkit-portrait.png`
- `artifacts/admin-ergonomics/webkit-landscape.png`
- `artifacts/admin-ergonomics/new-room-published-webgl.png`
- `artifacts/admin-ergonomics/wall-map-desktop.png`
- `artifacts/admin-ergonomics/wall-map-mobile.png`
- `artifacts/admin-ergonomics/wall-neighbours-desktop.png`
- `artifacts/admin-ergonomics/wall-map-webkit.png`
- `artifacts/admin-ergonomics/wall-plan-mobile.png`
- `artifacts/admin-ergonomics/collection-room-desktop.png`
- `artifacts/admin-ergonomics/collection-room-mobile.png`

Commande reproductible : `npm run build && node scripts/admin-ergonomics-qa.mjs`. Elle utilise une copie temporaire du catalogue et du build standalone, avec un port libre. La copie du build évite qu’une compilation concurrente remplace les manifests pendant les essais ; un premier passage interrompu par ce remplacement a été corrigé ainsi, puis répété intégralement avec succès. Le scénario de capacité suppose que moins de quatre salles sont déjà activées.

## Limites et exploitation

Le mode collectif **Réorganiser la salle** a ensuite été ajouté : réserve de tableaux, plan toujours déplié, accès direct aux murs, retrait collectif, annuler/rétablir, brouillon privé par salle et application atomique. Les 59 tests ciblés et les sept groupes navigateur dédiés passent ; détails et limites dans `docs/ADMIN_ROOM_LAYOUT.md`, preuves dans `artifacts/admin-room-layout/`. Les contrôles couvrent notamment l’échange dans une salle pleine, l’absence d’effet public du brouillon et la protection contre les onglets concurrents.

Une vérification ultérieure de la frappe réelle a révélé puis corrigé la perte du signe moins dans les positions. Les champs de placement disposent maintenant de boutons − / +, de limites visibles et d’une validation des saisies intermédiaires. La compilation, les 11 tests de placement et les six groupes du parcours ciblé `scripts/admin-placement-usability-qa.mjs` passent. Le rapport `artifacts/admin-placement-usability/report.json` couvre souris, toucher simulé, positions négatives, sauvegarde/réouverture et WebKit ; voir `docs/ADMIN_PLACEMENT.md`. Ce contrôle supplémentaire n’est pas une nouvelle exécution des 21 parcours généraux précédents.

L’enregistrement de la fiche, le traitement de l’image et la publication sont des étapes récupérables, pas une transaction globale. Si l’envoi échoue, les métadonnées peuvent déjà être enregistrées ; le message le précise. Les fichiers incomplets restent privés, sans purge automatique ajoutée.

Les parcours distants Vercel Blob et Supabase n’ont pas été exercés sur un service externe. La protection supplémentaire de révision pendant l’envoi concerne les adapters local et Blob ; la procédure Supabase existante n’a pas été modifiée. La nouvelle activation de salle utilise les modules architecturaux existants, sans modifier le décor. Les modifications de végétation présentes dans le dépôt appartiennent à une autre intervention.

La prévisualisation de développement sur `http://127.0.0.1:3011/admin` utilise une autre copie locale, remise aux 26 œuvres d’origine après les essais ; ses modifications ne touchent pas le site en ligne.
