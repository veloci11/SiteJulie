# Guide de l’atelier

Ouvrir `/admin`. Dans la prévisualisation locale, le bouton « Ouvrir l’atelier de démonstration » crée une session locale de huit heures. Les données sont dans `.local/data.json` ; les images originales et variantes dans `.local/sources` et `.local/media`. Ce mode est explicitement signalé et limité à localhost. Les œuvres fournies ont une légende de démonstration ; remplacer leurs informations par les données confirmées avant une mise en ligne.

## Ajouter un tableau

1. Choisir **Ajouter une œuvre**, depuis l’en-tête ou directement dans la collection voulue. Le lien est généré automatiquement ; **Personnaliser le lien de l’œuvre** permet de le modifier.
2. Choisir ou déposer l’image, même avant le titre (JPEG, PNG, WebP, AVIF, 20 Mio / 25 mégapixels maximum). L’aperçu est immédiat. Rien n’est envoyé avant **Enregistrer les modifications**. Le bouton de retrait annule le changement d’image. Pour une photo HEIC, exporter d’abord en JPEG.
3. Renseigner le titre et un texte alternatif, puis les informations connues. Laisser les dimensions réelles, technique et année vides si elles sont inconnues. Les dimensions réelles sont exprimées en cm : leur saisie ou modification remet le tableau à cette taille (100 %), dans la place disponible. Les réglages manuels suivants sont conservés à la sauvegarde et à la réouverture. Une image principale est prise en charge ; les images de détail supplémentaires ne sont pas encore proposées.
4. Ouvrir **Vente & prix**, puis choisir **Prix sur demande** ou **Afficher le prix**. La saisie accepte virgule ou point, avec deux décimales maximum. Un prix interne masqué ne part jamais dans les données publiques. Les montants sont enregistrés en centimes, en EUR, CHF ou USD. Un prix inconnu reste vide.
5. Ouvrir **Collection & accrochage** si nécessaire. Le placement reste automatique tant qu’aucune zone n’est choisie. Une zone peut contenir plusieurs tableaux : seul le nouvel arrivant est adapté à l’espace restant. Les œuvres présentes restent inchangées. Un ajout nécessitant un petit côté inférieur à 25 cm est refusé. Dans **Nouvelle collection**, **Activer une nouvelle salle** ajoute explicitement douze zones, dans une limite de quatre salles. Une collection reste dans sa salle ; un manque de place n’empêche pas d’enregistrer un brouillon. L’ordre du catalogue ne modifie pas la place du tableau.
6. Dans Publication, choisir **Publiée**, puis **Enregistrer les modifications**. Vérifier ensuite le catalogue dans une autre fenêtre.

Pour retirer une œuvre, choisir Brouillon ou Archivée puis enregistrer. Pour une vente, choisir Vendue dans Disponibilité : elle peut rester publiée. Aucun paiement ni panier n’est proposé. Pour les textes et l’email, ouvrir **Textes & contact**, modifier puis enregistrer. Le bouton public de contact ouvre l’application de messagerie ; aucun email n’est envoyé par le serveur.

La barre d’enregistrement indique les modifications en attente, l’envoi de l’image, son traitement et le résultat. Les contrôles sont bloqués pendant l’enregistrement pour éviter de perdre une saisie en cours. Changer d’écran ou fermer/recharger la page avec des modifications demande confirmation.

Une modification concurrente affiche une erreur et propose **Recharger la version enregistrée**, avec confirmation avant de remplacer vos saisies. Si une image échoue, la fiche déjà enregistrée reste disponible et le fichier choisi reste en attente : **Enregistrer les modifications** réessaie sans créer un second tableau. L’image précédente est conservée si son remplacement échoue. Pour une création suivie d’une publication, la fiche reste en brouillon tant que l’image ou le placement n’est pas validé. Ces étapes ne constituent pas une transaction unique ; le message précise les éventuels enregistrements partiels.

Dans **Textes & contact**, le serveur compare les réglages de départ à ceux enregistrés avant toute modification : une édition concurrente est refusée (HTTP 409), sans effacer vos saisies. Après déploiement, recharger les onglets `/admin` pour activer cette protection. Les anciens onglets restent compatibles avec le serveur mais ne transmettent pas la comparaison des réglages ; ils ne bénéficient pas de cette protection tant qu’ils ne sont pas rechargés. La comparaison tient compte du remplacement configuré de l’adresse email publique.

La capacité indique la surface des zones non couverte par les cadres, en m². Ce chiffre ne représente pas un nombre de tableaux supplémentaires : l’accrochage dépend du format, de la taille et de l’espace entre les cadres. L’avertissement de manque de place vérifie le placement réel du format connu de l’œuvre, même si toutes les zones contiennent déjà un tableau.

Une session expirée conserve le formulaire et propose de se reconnecter dans un autre onglet, puis de réessayer. L’archivage est réversible et aucune suppression définitive n’est exposée dans cette version.

## Réorganiser plusieurs tableaux

Depuis **Les œuvres**, choisir **Réorganiser la salle**. Le plan A/B/C/D et la vue de face permettent de retirer les tableaux dans une réserve puis de les replacer au clic ou par glisser-déposer à la souris. **Tout mettre en réserve**, **Annuler le geste** et **Rétablir** facilitent les changements complets. Ce mode garde toutes les œuvres dans leur salle et conserve leurs collections. Le plan reste toujours déplié. Le tableau sélectionné dispose d’une poignée ↘ pour le redimensionner ; la largeur et la hauteur dans le showroom sont aussi saisissables, avec proportions conservées et arrêt avant les bords/voisins. Un seul clic sur Annuler revient au début du geste.

**Enregistrer le brouillon** permet de fermer puis de reprendre, même si des tableaux restent dans la réserve. **Appliquer à la galerie** attend que tout soit correctement replacé et sauvegarde toute la salle en une opération. La galerie reste inchangée pendant les essais ; quitter des modifications non enregistrées déclenche un avertissement. Voir [le guide du mode salle](ADMIN_ROOM_LAYOUT.md) pour les parcours et limites de stockage.

# Mise en service Supabase

Cette intégration est préparée dans le code, mais **n’a pas été connectée ou testée sur un service externe**. Les tests locaux de démo ne prouvent pas le fonctionnement du projet Supabase déployé.

1. Créer un projet Supabase de développement, désactiver les inscriptions publiques dans Auth, configurer les URLs autorisées et la récupération de mot de passe dans le tableau de bord.
2. Exécuter `supabase/migrations/202609120001_museum.sql` sur ce projet neuf avec le CLI Supabase (`supabase db push`) ou le SQL Editor. Le schéma n’importe ni œuvres de démonstration ni identité d’artiste.
3. Créer/inviter le compte de l’artiste dans Auth côté administration. Avec son UUID vérifié, exécuter `insert into public.admin_memberships(user_id) values ('UUID_DU_COMPTE');`. Ne jamais permettre l’auto-attribution du rôle depuis le navigateur. Aucun mot de passe n’est codé dans le projet.
4. Renseigner `MUSEUM_DATA_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, puis supprimer `MUSEUM_LOCAL_PREVIEW`. La clé privilégiée sert uniquement à signer un chemin de variante validé et à finaliser un traitement déjà autorisé et décodé côté serveur. Elle reste dans `lib/media/signer.ts`, marqué serveur uniquement.
5. Vérifier sur des fixtures jetables : anonyme refusé dans `/api/admin/artworks`, compte connecté sans rôle refusé, admin accepté, publication avec une image, non-fuite du prix masqué par RPC **et accès direct REST aux tables**, dépublication, concurrence et accès privé aux fichiers source. Tester la migration et les politiques Storage sur le projet réel avant toute publication.
6. Configurer les vrais textes, identité et email confirmés dans l’atelier, puis importer les images. Le jeu local n’est jamais copié automatiquement vers Supabase.

Le téléversement Supabase est direct depuis le navigateur vers un chemin signé privé décidé côté serveur. Le processeur ne reçoit qu’un identifiant de téléversement, vérifie son propriétaire et décode réellement le fichier. Son budget est 60 secondes ; la limite 20 Mio est un maximum d’entrée, à valider avec les ressources de l’hébergeur. Les objets incomplets restent récupérables ; ils ne sont pas supprimés automatiquement.

Les tables administratives n’ont aucune lecture anonyme. La fonction `get_public_museum` expose une projection explicite des œuvres publiées. Les URLs de média publiques passent par l’identifiant d’œuvre et une variante autorisée, puis un contrôle de publication. Les signatures privées durent **60 secondes** : après dépublication, une URL déjà délivrée peut fonctionner jusqu’à sa fin de validité. Un navigateur peut toujours conserver une image déjà affichée ; la révocation absolue immédiate n’est pas promise.

# Sauvegarde

Pour la démo, arrêter le serveur puis sauvegarder tout `.local/` dans un emplacement privé : `data.json` (ou `seed.json`), `sources/` et `media/`. Conserver également les images sources de `ImageOeuvre/`. Pour restaurer, remettre le dossier complet et redémarrer le serveur.

Pour Supabase, une sauvegarde PostgreSQL ne sauvegarde pas les objets Storage : exporter la base et télécharger le bucket privé `museum-private` avec un outil authentifié administrateur, dans une sauvegarde chiffrée. Conserver ensemble chemins, fichiers, dates et migration. Tester une restauration dans un projet jetable avant de compter sur la sauvegarde. Aucun outil de purge des anciennes images n’est fourni ; ne pas supprimer les objets encore référencés et respecter au minimum le TTL des signatures.

# Vérifications exécutables

- `npm run build && node scripts/admin-ergonomics-qa.mjs` : campagne actuelle, compilation standalone et copie jetable des données/médias sur un port local disponible. Parcours Chrome et WebKit, captures dans `artifacts/admin-ergonomics/`. Les anciens scripts ci-dessous documentent des versions antérieures de l’interface et leurs sélecteurs peuvent nécessiter une mise à jour.

- `npx vitest run tests/admin.test.ts` : autorisations et cookies, origine, projection sans prix caché, révisions concurrentes, persistance, publication et capacité des salles, emplacements compatibles, décodage et variantes sans agrandissement. Chaque test utilise un dossier temporaire supprimé ensuite.
- `node scripts/admin-browser-qa.mjs` : copie temporaire du projet et des médias, build Next de production indépendante, serveur sur 127.0.0.1:3001, parcours complet dans Google Chrome installé et seconde session publique. Le serveur et la copie sont supprimés à la fin. Le stockage principal n’est pas modifié. Sorties : `artifacts/admin/browser-report.json` et capture `published-fixture.png`.

Le parcours navigateur a été exécuté avec succès le 12 septembre 2026 : connexion, brouillon, upload PNG, publication automatique, prix public, masquage sans fuite, reconnexion, archivage puis refus de l’œuvre et du média anonymes. La validation Supabase distante et la réception d’emails ne sont pas couvertes et n’ont pas été effectuées.

Le fonctionnement des zones partagées, des pointillés permanents et de l’ajout automatique est détaillé dans [ADMIN_ZONES.md](ADMIN_ZONES.md).
