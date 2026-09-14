---
name: museum-qa
description: "Vérifier un jalon du musée ou une régression visuelle, fonctionnelle, de sécurité ou de performance. Adapter les vérifications au changement réalisé."
---

# Vérification du musée

Utilise la section H du contrat pour choisir les parcours concernés. Ne répète pas toute la suite pour un changement mineur sans raison.

Démarre l’application, teste ses vrais écrans et conserve les erreurs utiles. Vérifie compilation et types, puis les fonctions de cadrage/placement et les parcours pertinents. Pour une évolution visuelle, prends des captures navigateur stabilisées après chargement et arrivée de la caméra.

Les parcours prioritaires sont sélection et clics rapides, destinations About/Contact, liens profonds, création/publication d’une œuvre, changement de prix, permissions, contexte email et repli 2D. Teste au moins un ratio vertical et un horizontal.

Compare la composition à la référence par revue visuelle ; les captures pixel à pixel servent aux régressions de l’application, pas à imposer une image IA comme vérité géométrique. Ne remplace pas une capture cassée par la référence.

Pour les performances, note machine, navigateur, résolution, réseau et qualité. Une émulation mobile n’est pas un test de GPU mobile. Ne revendique pas un appareil non essayé.

Livrable : résultats observés, captures du site, mesures disponibles, régressions corrigées et limites précises. Distingue test écrit, test exécuté et test réussi.
