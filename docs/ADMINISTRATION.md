# Guide de l’atelier

Ouvrir `/admin`. Dans la prévisualisation locale, le bouton « Ouvrir l’atelier de démonstration » crée une session locale de huit heures. Les données sont dans `.local/data.json` ; les images originales et variantes dans `.local/sources` et `.local/media`. Ce mode est explicitement signalé et limité à localhost. Les œuvres fournies ont une légende de démonstration ; remplacer leurs informations par les données confirmées avant une mise en ligne.

## Ajouter un tableau

1. Choisir **Ajouter une œuvre**, renseigner le titre et le lien (minuscules, chiffres, tirets).
2. Choisir l’image (JPEG, PNG, WebP, AVIF, 20 Mio / 25 mégapixels maximum). Le brouillon est enregistré, le fichier est décodé et trois variantes WebP sont produites. L’original reste conservé séparément et privé.
3. Ajouter un texte alternatif, puis les informations connues. Laisser les dimensions, technique et année vides si elles sont inconnues. Une image principale est prise en charge ; les images de détail supplémentaires ne sont pas encore proposées.
4. Choisir **Prix sur demande** ou **Afficher le prix**. Un prix interne masqué ne part jamais dans les données publiques. Les montants sont enregistrés en centimes, en EUR, CHF ou USD. Un prix inconnu reste vide.
5. Garder **Automatique** ou choisir un mur. Les emplacements occupés sont indisponibles. **Activer une salle supplémentaire** ajoute explicitement douze emplacements, dans une limite de quatre salles. L’ordre du catalogue ne modifie pas la place du tableau.
6. Dans Publication, choisir **Publiée**, puis **Enregistrer les modifications**. Vérifier ensuite le catalogue dans une autre fenêtre.

Pour retirer une œuvre, choisir Brouillon ou Archivée puis enregistrer. Pour une vente, choisir Vendue dans Disponibilité : elle peut rester publiée. Aucun paiement ni panier n’est proposé. Pour les textes et l’email, ouvrir **Textes & contact**, modifier puis enregistrer. Le bouton public de contact ouvre l’application de messagerie ; aucun email n’est envoyé par le serveur.

Une modification concurrente affiche une erreur : revenir à la liste et rouvrir l’œuvre avant de réessayer. Si une image échoue, le brouillon reste disponible ; choisir un autre fichier. L’archivage est réversible et aucune suppression définitive n’est exposée dans cette version.

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

- `npx vitest run tests/admin.test.ts` : autorisations et cookies, origine, projection sans prix caché, révisions concurrentes, persistance, publication et capacité des salles, emplacements compatibles, décodage et variantes sans agrandissement. Chaque test utilise un dossier temporaire supprimé ensuite.
- `node scripts/admin-browser-qa.mjs` : copie temporaire du projet et des médias, build Next de production indépendante, serveur sur 127.0.0.1:3001, parcours complet dans Google Chrome installé et seconde session publique. Le serveur et la copie sont supprimés à la fin. Le stockage principal n’est pas modifié. Sorties : `artifacts/admin/browser-report.json` et capture `published-fixture.png`.

Le parcours navigateur a été exécuté avec succès le 12 septembre 2026 : connexion, brouillon, upload PNG, publication automatique, prix public, masquage sans fuite, reconnexion, archivage puis refus de l’œuvre et du média anonymes. La validation Supabase distante et la réception d’emails ne sont pas couvertes et n’ont pas été effectuées.
