# SiteJulie — GitHub, Vercel et juliethiam.art

Le code est destiné au dépôt privé `https://github.com/veloci11/SiteJulie`.
Le domaine reste enregistré chez Infomaniak. Vercel héberge l’application ; Supabase
conserve les œuvres, les images privées et les comptes administrateurs.

## 1. Préparer Supabase

Le projet Vercel **site-julie** peut installer Supabase depuis le Marketplace avec
le produit **Supabase Postgres backend** à partir de 0 $. L'installation crée la
ressource et synchronise automatiquement `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY`. Le site accepte
aussi les anciens noms `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY`.

1. Dans https://supabase.com/dashboard, créer un projet **SiteJulie** sur une offre
   gratuite si le compte dispose encore de cette possibilité, dans une région
   européenne proche du public. Conserver le mot de passe de base dans son
   gestionnaire de mots de passe.
2. Sur ce **projet neuf**, ouvrir **SQL Editor** et exécuter, une seule fois et dans
   cet ordre, le contenu des trois fichiers du dépôt :
   - `supabase/migrations/202609120001_museum.sql`
   - `supabase/migrations/202609130001_artwork_placement.sql`
   - `supabase/migrations/202609140001_collection_order.sql`
3. Pour retrouver les deux salles actuelles, exécuter également :

   ```sql
   insert into public.rooms (id, sort_order)
   values ('room-2', 2) on conflict (id) do nothing;
   ```

4. Dans **Authentication → Users → Add user → Create new user**, créer le compte
   de l’administrateur avec son adresse et un mot de passe personnel fort. Utiliser
   la création directe, pas une invitation email : le parcours de définition de
   mot de passe par invitation n’est pas implémenté dans cette version du site.
5. Copier l’UUID de ce compte. Dans SQL Editor, remplacer la valeur ci-dessous
   par cet UUID, puis exécuter :

   ```sql
   insert into public.admin_memberships (user_id)
   values ('UUID_DU_COMPTE') on conflict (user_id) do nothing;
   ```

6. Dans les réglages Authentication, désactiver **Allow new users to sign up**.
   Conserver la connexion Email/Password pour le compte créé. Configurer **Site URL**
   sur `https://juliethiam.art`. Un visiteur du musée n’a pas besoin de compte.
7. Relever **Project URL** et les clés dans **Settings → API Keys / Data API**.
   La clé `anon` ou `sb_publishable_…` est publique. La clé `service_role` ou
   `sb_secret_…` est privilégiée et doit rester exclusivement côté serveur.
   Ne jamais coller cette dernière dans GitHub, un fichier public ou une conversation.

Les migrations créent le bucket **privé** `museum-private`, les politiques d’accès
et le catalogue vide. Elles n’importent pas le contenu de `.local/`.

## 2. Importer dans Vercel

1. Dans https://vercel.com/new, choisir l’espace personnel demandé, puis importer
   **veloci11/SiteJulie**. Si le dépôt n’apparaît pas, ouvrir les réglages de
   l’intégration GitHub et donner accès uniquement à **SiteJulie**.
2. Nom du projet : `site-julie`. Framework : **Next.js**. Root Directory : `./`.
   Node.js : **24.x**. Le dépôt définit déjà `npm ci` et `npm run build:vercel`.
   Laisser l’Output Directory sur la valeur automatique de Next.js.
3. Dans **Environment Variables**, définir les variables suivantes :

   | Variable                                                                  | Valeur                                            |
   | ------------------------------------------------------------------------- | ------------------------------------------------- |
   | `MUSEUM_DATA_MODE`                                                        | `supabase`                                        |
   | `NEXT_PUBLIC_SUPABASE_URL`                                                | Project URL de Supabase                           |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique `anon` ou `sb_publishable_…`         |
   | `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY`                      | Clé serveur `service_role` ou `sb_secret_…`       |
   | `NEXT_PUBLIC_SITE_URL`                                                    | `https://juliethiam.art`                          |
   | `MUSEUM_PUBLIC_INDEXING`                                                  | `0` pendant la préparation ; `1` après validation |

   Ne pas recopier `MUSEUM_LOCAL_PREVIEW`, `MUSEUM_LOCAL_DATA_DIR`, `.env.local`
   ni les fichiers de `.local/`. Le contrôle de build refuse le mode local et
   les variables manquantes, plutôt que de déployer un catalogue non configuré.
   Utiliser une base séparée pour les futures prévisualisations de branches :
   une prévisualisation liée à la base publique modifierait les mêmes œuvres.

4. Cliquer **Deploy** et attendre le statut **Ready**. Une modification de variable
   d’environnement nécessite un nouveau déploiement.
5. Sur l’adresse `.vercel.app` obtenue, ouvrir `/admin`, se connecter au compte
   Supabase, puis renseigner les vrais textes dans **Textes & contact**.

## 3. Charger et vérifier les œuvres

Les originaux restent sur le Mac dans `ImageOeuvre/`. Les variantes et l’accrochage
actuels restent dans `.local/` ; aucune de ces données privées n’est versionnée.
Importer les tableaux depuis l’administration en ligne, choisir leur collection,
leur mur et leur ordre, puis publier ceux qui sont prêts. Ne renseigner ni prix,
ni dimensions, ni technique non confirmés. Pour une exposition non commerciale,
ne pas présenter les tableaux comme des produits à vendre.

Avant de connecter le domaine, vérifier avec une œuvre d’essai : enregistrement,
reconnexion, affichage public, changement de salle, masquage d’un prix et
dépublication. En navigation privée, `/api/admin/artworks` doit refuser l’accès et
une image dépubliée ne doit plus recevoir de nouvelle URL signée. Une URL déjà
signée peut rester valable 60 secondes. Tester également ordinateur et téléphone.

**Limite actuelle :** le générateur automatique des images d’arrivée utilise le
Chrome local et ne tourne pas dans Vercel. En mode Supabase, les aperçus affichent
l’architecture sans tableaux ; la scène 3D affiche le catalogue actuel. Les
miniatures exactes des salles nécessitent un service de capture séparé avant de
retrouver intégralement ce comportement local. Ne pas activer la démo pour contourner cela.

## 4. Relier juliethiam.art

Faire cette étape une fois l’adresse Vercel fonctionnelle et le contenu vérifié.

1. Vercel → projet **site-julie** → **Settings → Domains** : ajouter
   `juliethiam.art` puis `www.juliethiam.art`. Choisir le domaine sans `www` comme
   adresse principale et rediriger `www` vers celui-ci.
2. Vercel affiche les enregistrements DNS exacts attendus. Copier ces valeurs :
   ne pas réutiliser une ancienne IP ou une cible CNAME trouvée dans un tutoriel.
3. Infomaniak Manager → **Domaines → juliethiam.art → Zone DNS** : exporter ou
   sauvegarder la zone existante avant modification. Garder les serveurs DNS
   Infomaniak ; aucun transfert de domaine n’est nécessaire.
4. Modifier uniquement les enregistrements web concernés :

   | Nom                   | Type    | Action                                                                                             |
   | --------------------- | ------- | -------------------------------------------------------------------------------------------------- |
   | `@` / domaine racine  | `A`     | Remplacer la cible par celle indiquée par Vercel                                                   |
   | `@` / domaine racine  | `AAAA`  | Ne pas conserver l’ancienne cible Infomaniak si Vercel ne fournit pas de cible IPv6 correspondante |
   | `www`                 | `CNAME` | Mettre la cible exacte indiquée par Vercel ; résoudre les éventuels A/AAAA existants à ce même nom |
   | Nom fourni par Vercel | `TXT`   | Ajouter uniquement si une vérification de propriété est demandée                                   |

5. Préserver les **MX**, SPF, DKIM, DMARC et les sous-domaines de messagerie.
   Au contrôle du 14 septembre 2026, le domaine avait un MX Infomaniak et des
   adresses A/AAAA web Infomaniak : les deux familles IP doivent être prises en compte.
6. Dans Vercel, attendre **Valid Configuration** et l’émission du certificat HTTPS.
   Tester `https://juliethiam.art`, `https://www.juliethiam.art` et `/admin`.
   La propagation dépend du TTL et des caches DNS ; conserver l’ancienne zone
   pour pouvoir rétablir le pointage si nécessaire.
7. Quand les textes et œuvres sont prêts, passer `MUSEUM_PUBLIC_INDEXING` à `1`
   si l’indexation Google est souhaitée, puis redéployer.

## 5. Après la mise en ligne

- Un push sur `main` déclenche un nouveau déploiement si l’intégration GitHub est reliée.
- Les modifications de tableaux depuis l’admin sont stockées dans Supabase, sans push Git.
- Sauvegarder la base **et** les fichiers du bucket privé : une sauvegarde SQL
  seule ne contient pas les images.
- Le domaine continue à être renouvelé chez Infomaniak. Les quotas Vercel et
  Supabase restent à surveiller ; une offre gratuite n’est pas illimitée.

Documentation officielle :

- https://vercel.com/docs/domains/working-with-domains/add-a-domain
- https://www.infomaniak.com/fr/support/faq/admin2/domaine
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/getting-started/api-keys
