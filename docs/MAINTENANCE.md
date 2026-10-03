# Maintenance et conservation de la galerie

## Stockage privé et administration

Le catalogue (`museum/catalog.json`), les originaux et les variantes des œuvres sont dans Vercel Blob privé. GitHub conserve le code, les assets du décor et les contenus éditoriaux versionnés ; il ne sauvegarde pas les fichiers ajoutés depuis l’administration.

L’onglet **Stockage & sauvegardes** lit `/api/admin/storage`, après contrôle de session serveur. Il affiche le poids réel de tous les fichiers du store, dont les copies de sécurité, les images et originaux, et la date du dernier instantané terminé. Il ne retourne ni noms de fichiers privés, ni contenus, ni URLs Blob. Le bouton Actualiser déclenche une nouvelle mesure sans interrogation périodique.

`MUSEUM_STORAGE_BUDGET_BYTES=1000000000` correspond au budget de 1 Go de l’offre Hobby actuellement confirmée pour le projet. Ce repère est comparé au volume instantané du store. La facturation/limite Vercel porte sur une moyenne mensuelle, et les opérations et transferts ont leurs propres quotas. Cet écran ne mesure pas les quotas des autres services Vercel.

## Sauvegarde automatique

Vercel Cron appelle `GET /api/cron/backup` chaque jour vers 03:00 UTC. Sur Hobby, l’exécution peut intervenir dans l’heure programmée. `CRON_SECRET`, secret serveur, est obligatoire : toute requête sans son en-tête Authorization exact est refusée (401). La route ne retourne que date, nombre de fichiers et état.

Le catalogue complet (dont brouillons, prix privés et paramètres) est copié sans normalisation. Les fichiers sous `museum/` sont copiés dans `museum-backups/objects/`. La combinaison chemin/ETag identifie une version d’image : les fichiers inchangés ne sont pas recopiés à chaque passage. Les instantanés datés contiennent le catalogue, son SHA-256 et un manifeste qui associe chaque source à sa copie, son poids, son ETag et son SHA-256.

Le manifeste est écrit en dernier. Un échec ou un catalogue modifié pendant la copie ne produit pas de nouvelle sauvegarde considérée comme terminée. Relancer la même sauvegarde dans la journée ne remplace pas le catalogue existant. Les sources de production ne sont ni réécrites ni supprimées par le job. Les instantanés restent conservés ; aucune suppression automatique des sauvegardes n’est activée. Surveiller leur poids dans l’administration.

Les copies sont dans le même store privé. Elles protègent contre la suppression ou le remplacement des fichiers courants, pas contre la perte du compte/store Vercel. Une exportation séparée complète cette protection.

### Exportation et restauration

Avec un token serveur existant dans un fichier local ignoré :

```sh
node --env-file=.local/vercel-blob.env --conditions=react-server --import tsx scripts/export-museum-backup.ts .local/backups/NOUVEAU_DOSSIER
```

Le script est en lecture seule vis-à-vis de Vercel. Il exige un nouveau dossier sous `.local/backups/`, crée les fichiers avec des droits privés et vérifie le SHA-256 du catalogue et de chaque image. Il échoue au lieu d’écraser un export existant. Conserver une copie privée de ce dossier sur un support séparé si une protection contre la perte de l’ordinateur et du compte est souhaitée.

Pour restaurer, vérifier le manifeste et les empreintes, effectuer d’abord une sauvegarde du catalogue courant, puis remettre les assets aux chemins `museum/...` listés dans le manifeste et le `catalog.json` sous `museum/catalog.json`. L’application relit les mêmes identifiants et les mêmes chemins. Faire la première restauration sur un store jetable et vérifier les brouillons, prix privés et variantes. La restauration de production remplace des données : demander l’autorisation explicite avant de la réaliser. Aucun script ne la déclenche automatiquement.

Premier instantané et export vérifiés le 2 octobre 2026 : 102 fichiers et catalogue, environ 60,7 Mo de copies. L’export local est `.local/backups/2026-10-02-verified/`, exclu de Git et des déploiements.

## Réduction des opérations Blob et statistiques

Les lectures publiques du catalogue partagent une lecture d’origine par instance active sur 30 secondes ; les requêtes simultanées attendent le même résultat. Le cache est strictement serveur, séparé par store, cloné pour chaque appel et invalidé après une écriture dans la même instance. Les lectures admin, les écritures conditionnelles et l’anti-spam restent fraîches. Sur une autre instance, une dépublication devient visible au plus tard à l’expiration de ce cache. Le cache des images dans le navigateur utilise uniquement le temps restant dans la fenêtre totale de 60 secondes depuis la lecture d’origine, sans délai supplémentaire cumulatif. Une panne à l’expiration refuse les données au lieu de prolonger un ancien instantané.

Les aperçus par empreinte réutilisent le CDN Blob. La sauvegarde quotidienne compare les ETags et tailles fournis par `list()` : les images déjà copiées n’exigent plus deux `head()` chacune par jour. Les nouvelles copies restent vérifiées. Avec 102 fichiers inchangés, cela évite environ 204 opérations simples par sauvegarde ; les lectures du catalogue et du manifeste et les nouvelles images continuent de compter. Le gain réel dépend du trafic et de la réutilisation des instances ; aucun quota gratuit illimité n’est promis.

Vercel Web Analytics (`@vercel/analytics`) mesure les pages publiques sans cookie publicitaire. Le composant exclut `/admin` et `/api`, et retire paramètres et fragments des URLs avant l’envoi. Il ne reçoit aucun contenu du formulaire et n’enregistre aucun événement personnalisé. L’offre Hobby inclut actuellement 50 000 événements par mois, quota distinct de Blob. L’activation se vérifie dans le tableau Vercel et nécessite le déploiement du SDK.

Les chiffres du tableau Usage sont affichés sur les 30 derniers jours. Une plage de dates d’analyse n’est pas une date garantie de remise à zéro. Vercel indique une attente possible de 30 jours en cas de dépassement Hobby ; ne pas promettre un reset le premier du mois ou une date non affichée par le compte.

## Anti-spam partagé

Les demandes valides consomment atomiquement un compteur dans `museum-system/contact-limits.json`, privé et distinct du catalogue. Une écriture conditionnelle sur ETag arbitre entre instances Vercel ; une collision entraîne une nouvelle lecture, jamais le remplacement silencieux d’un compteur concurrent.

Limites : 5 demandes par IP et par email sur 15 minutes, et 40 demandes globales sur 24 heures (une notification et une confirmation par demande, avec une marge sur les 100 emails/jour de l’offre Resend gratuite). L’en-tête d’adresse IP est celui réécrit par Vercel. Les adresses sont transformées par HMAC avec un secret serveur ; ni nom, ni message, ni adresse en clair ne sont enregistrés dans ces compteurs.

Les compteurs expirés sont retirés lors d’un envoi ou du job quotidien. Une panne de stockage ou une configuration insuffisante refuse l’envoi avec 503 ; aucune limite en mémoire locale ne remplace la protection de production. Les contrôles d’origine, de taille, de schéma, le champ piège et l’idempotence Resend restent actifs. Les messages du formulaire ne sont pas inclus dans les sauvegardes du catalogue.

## Pages légales et référencement

Les pages `/mentions-legales` et `/confidentialite` sont reliées depuis chaque pied de page du catalogue et depuis le formulaire. L’identité publique confirmée est Julie Thiam, Neuchâtel, Suisse, `contact@juliethiam.art`. L’adresse professionnelle et le nom légal complet restent à confirmer ; `SITE_EDITOR_NAME` et `SITE_EDITOR_ADDRESS` permettent de les renseigner sans inventer une adresse. Ne pas confondre l’adresse des cours avec celle de l’éditeur sans confirmation.

Le sitemap contient désormais 32 pages : les 30 pages existantes et les deux pages légales. La propriété Search Console `https://www.juliethiam.art/` est vérifiée via la balise `GOOGLE_SITE_VERIFICATION` publique. Ne pas supprimer cette balise. Cette propriété est un préfixe d’URL canonique, pas une propriété Domaine validée par DNS. La soumission d’un sitemap ne constitue pas une preuve d’indexation de toutes ses pages ; distinguer état de lecture du sitemap, inspection des URLs et rapports de couverture.

Références : [Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [devoir d’informer suisse](https://www.edoeb.admin.ch/fr/devoir-dinformer), [Google et les sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [DPA Resend](https://resend.com/legal/dpa), [DPA Vercel](https://vercel.com/legal/dpa).
