---
name: museum-admin-security
description: "Créer ou modifier la publication des œuvres, les politiques Supabase, les médias privés et les opérations administratives. Ne pas charger pour la composition 3D seule."
---

# Administration, publication et accès

Utilise les sections D, E et I du contrat technique. Identifie les données publiques, administratives et les fichiers avant de modifier schéma, requêtes ou stockage.

Vérifie la session côté serveur et les permissions de chaque opération ; applique également les politiques de données et de stockage. Un utilisateur connecté n’est pas automatiquement administrateur. Aucun rôle contrôlé par localStorage ou métadonnées librement éditables.

Sépare prix non public, notes, brouillons et originaux des réponses publiques. RLS ne masque pas magiquement une colonne d’une ligne lisible ; teste aussi l’accès direct via l’API de données. Les privilèges serveur restent dans un module restreint et n’arrivent jamais au navigateur.

La publication valide image prête, métadonnées et emplacement disponible. Téléversement signé privé, chemins décidés côté serveur, décodage réel, plafonds, variantes et erreurs récupérables. Une URL signée déjà délivrée a une durée de validité à respecter et à documenter.

Écris une migration reproductible et teste l’édition avec un administrateur, le refus avec un compte non autorisé et l’absence de fuite pour un visiteur anonyme. Les tests utilisent un environnement jetable sans données de production.

N’invente ni connexion Supabase réussie, ni configuration email. Documente exactement les étapes externes qui restent nécessaires.
