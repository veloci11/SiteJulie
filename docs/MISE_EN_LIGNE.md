# SiteJulie — GitHub, Vercel et juliethiam.art

Le code est destiné au dépôt privé `https://github.com/veloci11/SiteJulie`.
Le domaine reste enregistré chez Infomaniak. Vercel héberge l’application et son
stockage Blob privé conserve le catalogue et les images. Un seul compte admin est
configuré par variables serveur ; aucun service Supabase n’est requis.

## 1. Préparer Vercel Blob et l’admin

1. Dans le projet Vercel **site-julie**, ouvrir **Storage**, créer un store
   **Vercel Blob privé** nommé `site-julie-media` et le connecter aux environnements
   Production et Preview. Vercel ajoute automatiquement `BLOB_READ_WRITE_TOKEN`.
2. Définir l’identifiant dans `MUSEUM_ADMIN_USERNAME`, puis choisir un mot de
   passe d’au moins 10 caractères. Sur le Mac, générer son hash
   sans conserver le mot de passe dans le dépôt :

   ```bash
   read -s MUSEUM_ADMIN_PASSWORD_TO_HASH
   export MUSEUM_ADMIN_PASSWORD_TO_HASH
   npm run admin:hash
   unset MUSEUM_ADMIN_PASSWORD_TO_HASH
   ```

   Copier uniquement le résultat `scrypt$...` dans
   `MUSEUM_ADMIN_PASSWORD_HASH`. Le mot de passe lui-même ne va jamais dans
   GitHub ou dans une variable accessible au navigateur.

3. Générer `MUSEUM_SESSION_SECRET` avec `openssl rand -base64 48`. Cette valeur et
   le hash du mot de passe sont des variables Vercel **Sensitive**.

Le cookie admin est HTTP-only, signé côté serveur, limité à huit heures et vérifié
pour chaque lecture ou modification administrative. Le stockage reste privé ; les
images publiées utilisent des URL temporaires de 60 secondes.

## 2. Importer dans Vercel

1. Dans https://vercel.com/new, choisir l’espace personnel demandé, puis importer
   **veloci11/SiteJulie**. Si le dépôt n’apparaît pas, ouvrir les réglages de
   l’intégration GitHub et donner accès uniquement à **SiteJulie**.
2. Nom du projet : `site-julie`. Framework : **Next.js**. Root Directory : `./`.
   Node.js : **24.x**. Le dépôt définit déjà `npm ci` et `npm run build:vercel`.
   Laisser l’Output Directory sur la valeur automatique de Next.js.
3. Dans **Environment Variables**, définir les variables suivantes :

   | Variable                     | Valeur                                            |
   | ---------------------------- | ------------------------------------------------- |
   | `MUSEUM_DATA_MODE`           | `blob`                                            |
   | `BLOB_READ_WRITE_TOKEN`      | Ajouté automatiquement par le store privé         |
   | `MUSEUM_ADMIN_USERNAME`      | Identifiant unique de l’administrateur            |
   | `MUSEUM_ADMIN_PASSWORD_HASH` | Résultat `scrypt$...` de `npm run admin:hash`     |
   | `MUSEUM_SESSION_SECRET`      | Résultat de `openssl rand -base64 48`             |
   | `NEXT_PUBLIC_SITE_URL`       | `https://juliethiam.art`                          |
   | `MUSEUM_PUBLIC_INDEXING`     | `0` pendant la préparation ; `1` après validation |

   Ne pas recopier `MUSEUM_LOCAL_PREVIEW`, `MUSEUM_LOCAL_DATA_DIR`, `.env.local`
   ni les fichiers de `.local/`. Le contrôle de build refuse le mode local et
   les variables manquantes, plutôt que de déployer un catalogue non configuré.
   Les prévisualisations connectées au même store modifieraient le même catalogue.

4. Cliquer **Deploy** et attendre le statut **Ready**. Une modification de variable
   d’environnement nécessite un nouveau déploiement.
5. Sur l’adresse `.vercel.app` obtenue, ouvrir `/admin`, se connecter avec le
   mot de passe choisi, puis renseigner les vrais textes dans
   **Textes & contact**.

## 3. Charger et vérifier les œuvres

Les originaux restent sur le Mac dans `ImageOeuvre/`. Les variantes et l’accrochage
actuels restent dans `.local/` ; aucune de ces données privées n’est versionnée.
Après connexion du store, `npm run blob:seed` permet d’importer les 8 œuvres et
leurs variantes actuelles. Ce script remplace le catalogue distant et exige
explicitement `MUSEUM_BLOB_ALLOW_SEED=1`; ne pas le relancer après des modifications
faites dans l’admin sans sauvegarde. Les futurs tableaux s’ajoutent directement
depuis l’administration en ligne.

Avant de connecter le domaine, vérifier avec une œuvre d’essai : enregistrement,
reconnexion, affichage public, changement de salle, masquage d’un prix et
dépublication. En navigation privée, `/api/admin/artworks` doit refuser l’accès et
une image dépubliée ne doit plus recevoir de nouvelle URL signée. Une URL déjà
signée peut rester valable 60 secondes. Tester également ordinateur et téléphone.

**Limite actuelle :** le générateur automatique des images d’arrivée utilise le
Chrome local et ne tourne pas dans Vercel. En mode Blob, les aperçus affichent
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
- Les modifications de tableaux depuis l’admin sont stockées dans Vercel Blob, sans push Git.
- Sauvegarder `museum/catalog.json` et les fichiers du store Blob privé.
- Le domaine continue à être renouvelé chez Infomaniak. Les quotas Vercel et
  Vercel Blob restent à surveiller ; une offre gratuite n’est pas illimitée.

Documentation officielle :

- https://vercel.com/docs/domains/working-with-domains/add-a-domain
- https://vercel.com/docs/vercel-blob
- https://www.infomaniak.com/fr/support/faq/admin2/domaine
