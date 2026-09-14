# Sources de documentation

Consultation : 12 septembre 2026. Les choix de stack, budgets et comportements détaillés sont une proposition d’architecture pour ce projet. Les documentations ci-dessous confirment les capacités et contraintes des outils ; vérifier à nouveau les versions exactes lors de l’installation.

## Codex et Astra

1. OpenAI — Skills, format SKILL.md, découverte dans `.agents/skills`, invocation et installation : `https://developers.openai.com/codex/skills/` (redirigé vers `https://learn.chatgpt.com/docs/build-skills`).
2. OpenAI — Configuration, `model_reasoning_effort`, dont `high` et `xhigh` selon le modèle : `https://developers.openai.com/codex/config-reference/`.
3. OpenAI — Guide du modèle Astra et comportements de prompting : `https://developers.openai.com/api/docs/guides/latest-model`.
4. OpenAI — Revoir les skills et prompts pour Astra, descriptions ciblées et contexte utile : `https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra`.
5. OpenAI — Exemple de fabrication architecturale avec Astra, Blender/Python et inspection des exports : `https://developers.openai.com/blog/architectural-visualization-with-astra`.
6. OpenAI — Fiche modèle Astra : `https://developers.openai.com/api/docs/models/gpt-6-astra`.

## Application et scène

7. Next.js — Server et Client Components : `https://nextjs.org/docs/app/getting-started/server-and-client-components`.
8. React Three Fiber — Rendu à la demande, chargement et performances : `https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx`.
9. camera-controls — Transitions et cadrage de caméra : `https://github.com/yomotsu/camera-controls`.
10. Drei — HTML ancré dans la scène, transform et occlusion : `https://drei.docs.pmnd.rs/misc/html`.
11. Three.js — Gestion des espaces colorimétriques : `https://threejs.org/manual/en/color-management.html`.
12. Three.js — Documentation loaders et runtime : `https://threejs.org/docs/`.
13. Blender — API Python : `https://docs.blender.org/api/current/`.
14. Blender — Manuel glTF consulté, export des matériaux, ancres et axe Y : `https://docs.blender.org/manual/id/4.0/addons/import_export/scene_gltf2.html`. Cette page est une version historique ; vérifier les options sur la version effectivement installée. L’URL « latest » n’a pas été lisible via l’outil de recherche pendant la préparation.

## Données et vérification

15. Supabase — RLS PostgreSQL : `https://supabase.com/docs/guides/database/postgres/row-level-security`.
16. Supabase — Contrôle d’accès du stockage et clés privilégiées : `https://supabase.com/docs/guides/storage/security/access-control`.
17. Playwright — Comparaisons visuelles et conditions de stabilité : `https://playwright.dev/docs/test-snapshots`.

Le catalogue des plugins a également été interrogé pour Supabase/Blender : un plugin Supabase de gestion de projets a été identifié comme disponible, mais aucun compte n’a été connecté, aucune installation demandée et aucune base modifiée dans cette conversation. Le pipeline proposé ne dépend pas de ce plugin.
