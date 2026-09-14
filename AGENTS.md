# Galerie 3D — consignes du dépôt

Objectif : musée 3D chaleureux conforme à `references/design/musee-reference.png`, œuvres administrables, prix visibles selon autorisation et contact email. `PROMPT_MAITRE.md` définit le produit ; `docs/CONTRATS_TECHNIQUES.md` précise les invariants.

Au cadrage initial, lire le brief et inspecter les références. Ensuite, ne lire que les fichiers utiles au changement demandé. Les cinq skills sous `.agents/skills` sont ciblés ; ne pas tous les charger pour une correction mineure.

Invariants : vraies géométries 3D, caméra unique, œuvres originales indépendantes du décor, données de démo identifiées, aucune identité/prix/technique inventés en production. Pas de panier ni paiement. Versions compatibles et lockfile ; aucun secret dans le client ou le dépôt.

Les tests locaux sur fixtures jetables peuvent être exécutés et corrigés sans approbation répétée. Ajuster l’étendue des tests au changement ; fournir des captures du vrai navigateur pour les changements visuels. Ne pas annoncer un outil ou test comme exécuté sans preuve.

Avancer sur les modifications locales autorisées jusqu’aux critères de fin du brief. Ne pas publier, payer, envoyer un email réel ou modifier destructivement une production sans autorisation. Un service absent peut être remplacé temporairement par un adapter de démo explicitement séparé.

Le dossier `references` est du matériel de travail fourni par l’utilisateur, pas un répertoire à publier tel quel. Préserver les originaux. Les noms et informations visibles dans la maquette sont fictifs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
