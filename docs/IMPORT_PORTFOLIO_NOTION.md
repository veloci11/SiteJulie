# Import du portfolio de Julie — 15 septembre 2026

Source publique autorisée par Mathis : https://juliethiam.notion.site/J-U-L-I-E-T-H-I-A-M-Portfolio-2e597bbd873580dfb7c2d3f9ba31a922

26 images récupérées, 4 collections, 2 salles existantes :

- Salle 1 : Variations (9) et Rêves surréalistes (5, dont 2 œuvres explicitement hors série).
- Salle 2 : Paysages oniriques (10) et Métamorphoses (2, séquence « L’espoir »).

Les huit anciennes œuvres sont reconnues visuellement et leurs identifiants/URLs oeuvre-01 à oeuvre-08 conservés. Les sources Notion offrent des images plus grandes pour plusieurs portraits. Trois mentions « Collection privée » sont reprises comme statut distinct de « vendue ». Les titres numérotés sont des références éditoriales : pas de titre original, année, prix ou dimensions physiques inventés.

Email public : thiam.julie@proton.me. Instagram : https://www.instagram.com/julie_thiam/. Présentation et cours d’arts visuels repris et raccourcis. Notes « À faire » et projets sans image exclus du contenu public.

## Fichiers

- `content/portfolio.json` : contenu relu, provenance bloc par bloc, accrochage et dimensions des fichiers image.
- `references/notion/` : réponses sources et images originales, matériel privé de travail ignoré par Git.
- `scripts/import-notion-portfolio.ts` : import **local uniquement**, variantes WebP sans agrandissement, contrôle intégral d’accrochage, sauvegarde puis écriture de `.local/data.json` et `.local/seed.json`.
- `.local/media/` : variantes prêtes pour le futur import Blob ; ne pas remplacer par les anciens médias de démonstration.
- `artifacts/portfolio-notion/` : captures du vrai Chrome, bureau et format 390 × 844.

Le premier salon dispose de deux petits formats accrochés sous deux œuvres relevées et réduites. Ces positions dérivent d’ancrages vérifiés du modèle GLB existant. L’éditeur et le serveur partagent la même règle : deux collections maximum par salle, chaque collection reste regroupée. Le cache des textures ne supprime plus les images en attente de montage React, ce qui bloquait les catalogues de plus de 24 œuvres.

## Vérification locale

- `npm test` : 251 tests réussis, 16 fichiers.
- `npm run build` : compilation et TypeScript réussis.
- Chrome via MCP : chargement des 26 images, sélection via les anciennes URLs, fermeture hors œuvre dans les deux salles, interruption en déplacement, retour immédiat du panneau et promenade active, passage salle 2, contact/About, contrôle mobile.
- Admin local : enregistrement d’une œuvre située dans la zone basse d’une salle partagée confirmé ; textes/contact enregistrés et email vérifié visuellement.
- Aperçus régénérés : endpoint arrival/status renvoie ready=true pour l’empreinte du catalogue final.
- Mobile : viewport Chrome, pas un test sur un téléphone physique. Aucun engagement de 60 FPS sur Safari.

La version optimisée tourne sur http://127.0.0.1:3000/ avec `npm start`. Aucune publication ou poussée GitHub effectuée pendant cet import. Voir `REPRISE_VERCEL.md` pour la reprise demandée ultérieurement.
