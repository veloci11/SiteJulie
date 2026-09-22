# Aperçus des salles — régénération locale

En mode `MUSEUM_DATA_MODE=demo` avec `MUSEUM_LOCAL_PREVIEW=1`, une demande d’aperçu périmé ou de `/api/museum/arrival/status` déclenche un lot de captures en arrière-plan. La réponse image et le bouton Enregistrer n’attendent pas le navigateur. Le client vérifie le statut pendant l’ouverture du menu des salles et change la version de ses images lorsque le lot est prêt.

Le statut public expose uniquement `{fingerprint,ready,supported,error?,retryAfterMs?}`. Le fingerprint couvre toutes les œuvres publiques : remplacement du média, titre, emplacement, dimensions, cadre, collection, ordre et disponibilité. Le lot n’est déclaré prêt que lorsque toutes les salles actives possèdent leurs vues horizontale et portrait. Une révision périmée dans l’URL ne permet jamais de lire une ancienne image : chaque GET relit la projection publique courante.

Les fichiers sont privés sous `MUSEUM_LOCAL_DATA_DIR/arrival/generated/<fingerprint>/`. Une seule capture tourne à la fois dans le processus Node ; les changements suivants remplacent la demande en attente. Le service recontrôle les données avant capture et avant installation atomique du lot. Les lots incomplets ou devenus obsolètes sont jetés. Les anciennes révisions automatiques sont supprimées après une génération réussie ; les captures manuelles historiques restent lisibles uniquement si leur fingerprint correspond exactement. Toutes les réponses utilisent `private, no-store`.

Les bases `public/museum/arrival-empty-room-N-wide.webp` et `arrival-empty-room-N-portrait.webp` ne contiennent que le décor. Elles sont produites une fois par version architecturale avec `scripts/capture-arrival.ts`. Si une base spécifique manque, le service retourne un fond neutre sans œuvre ; il n’utilise pas la salle1 pour représenter la salle2. L’ancienne base générique reste compatible avec la salle1.

## Exécution et limites

- Node persistant local, Google Chrome installé et `playwright-core`1.63.0, déclaré comme dépendance serveur externe dans Next. Son dossier complet doit être inclus dans le tracing standalone, notamment `browsers.json` que le chargement dynamique exige. Le premier essai a détecté cette omission avant le rendu ; son diagnostic ne constitue pas un succès de parcours. Aucun navigateur téléchargé automatiquement.
- Cible fixée à `http://127.0.0.1:${PORT || 3000}` : aucun Host, Origin, lien public ou paramètre utilisateur ne choisit la destination.
- Session anonyme sans cookie administrateur. Réseau limité à cette origine ; les requêtes d’arrivée du navigateur sont bloquées pour empêcher une génération récursive.
- Chrome headless utilise SwiftShader. Il ne crée aucune nouvelle caméra visible dans la visite, mais consomme du CPU pendant la capture. Aucune mesure de performances natives n’est revendiquée ici.
- Fermeture du navigateur et des pages dans `finally`, limite globale180s, délai de reprise60s après erreur. Une erreur garde le fond vide et ne bloque pas le catalogue. Les images sont traitées en mémoire ; les répertoires temporaires normaux sont supprimés. Un arrêt brutal du système peut laisser un dossier privé `.pending-*`, jamais servi.
- `MUSEUM_ARRIVAL_GENERATION=0` désactive le travail de fond, notamment pour les campagnes QA/performance indépendantes.
- Supabase/hébergement distant : la génération locale est désactivée (`supported:false`). Aucun service de capture distant ni stockage de captures Supabase n’est configuré ou prétendu opérationnel.

## Vérification

`npx vitest run tests/arrival.test.ts tests/arrival-generation.test.ts` : 7 tests CPU passent (publication, coalescence, modification pendant capture, lot partiel, reprise, remplacement/déplacement/vente, origine loopback). TypeScript passe.

`node scripts/arrival-generation-qa.mjs` est le parcours réel sur fixture jetable port3003, à lancer après le build. Il vérifie deux lots complets, une sauvegarde UI avec changement de collection et vente, le menu des salles actualisé sans remplacement du Canvas, la projection publique et le refus de servir un aperçu ancien après archivage. Il conserve ses preuves dans `artifacts/arrival-generation/` et compare les empreintes des données principales avant/après. Le rapport `passed` fait foi ; la préparation du script seule ne constitue pas un succès de parcours.

Dernier parcours réel : **réussi le 14 septembre 2026 à 04:18 UTC**, rapport `artifacts/arrival-generation/report.json` (`passed:true`). Le clic Enregistrer a répondu en 1,44 s ; les deux lots de quatre vues ont pris 56,6 s puis 58,3 s en SwiftShader. Ce sont les durées observées sur cette fixture, pas une promesse de latence générale ni un benchmark natif. Deux pages réelles ont confirmé le passage à 3/5 œuvres, l’URL fingerprint-ready actualisée et le même élément Canvas. Après archivage, une requête conservant l’ancienne révision a reçu immédiatement la base sans œuvre. Les prix non publics sont nuls et les champs administratifs absents du DTO anonyme. Les empreintes seed/data principales sont identiques avant/après ; fixture et navigateurs fermés, port 3003 libre vérifié.

Captures inspectées : `admin-save.png`, `gallery-live-previews.png`, `room-1-before.webp`, puis les quatre `room-N-{wide,portrait}.webp` dans le même dossier. Le premier essai avait détecté `browsers.json` absent du standalone ; l’inclusion complète de playwright-core a corrigé ce packaging. Un sélecteur QA devenu trop strict a été adapté au label réel avant le passage final. Aucune mutation des données principales n’a servi à ces vérifications.

## Complément du 21 septembre 2026

Les sauvegardes autorisées déclenchent maintenant la génération locale sans attendre la visite suivante. La version d’accueil est également vérifiée pendant le chargement initial du musée.

Une génération depuis le navigateur de l’atelier a été ajoutée pour le mode Blob : vues de la vraie scène, stockage privé, validation de l’empreinte, publication du lot complet, statut et reprise à la prochaine ouverture si l’atelier a été fermé. Elle évite de dépendre d’un navigateur installé sur le serveur Vercel. Voir [Expérience de visite](EXPERIENCE_VISITE.md) pour les limites, les contrôles et les preuves. Cette extension a été développée et testée localement ; elle n’a pas été publiée ni validée avec des écritures sur le Blob de production.
