---
name: museum-blender-assets
description: "Créer ou exporter la géométrie et les matériaux architecturaux du musée avec Blender. Ne pas charger pour les textes, tarifs ou formulaires seuls."
---

# Assets architecturaux exportables

Vérifie l’exécutable et la version de Blender. Utilise les sections E et F du contrat technique pour les couleurs, transformations et exports. L’API Python de Blender est une voie de fabrication ; sa présence doit être vérifiée, pas supposée.

Produis le hall, les alcôves et un module de salle réutilisable à partir d’un script et d’une configuration. Exporte les ancres dans la même convention de coordonnées que la géométrie. Les ouvertures doivent être traversables, les normales correctes et les dimensions cohérentes.

Garde tableaux, prix et textes hors du GLB statique et des textures précalculées. Prépare des matériaux compatibles glTF ou des textures calculées explicitement, sans supposer la conversion intégrale de tous les nœuds Blender. Évite le double éclairage des surfaces déjà éclairées dans une texture.

Inspecte à la fois un rendu de composition et l’export chargé dans Three.js. Vérifie UV, transparence, végétation, échelle et lisibilité près des murs. Laisse une alternative procédurale utilisable si Blender est absent, en distinguant clairement scripts préparés et fichiers effectivement produits.

Livrables : scripts, configuration, sources créées, GLB exporté, manifeste compatible, captures du navigateur et provenance/licence de chaque ressource externe.
