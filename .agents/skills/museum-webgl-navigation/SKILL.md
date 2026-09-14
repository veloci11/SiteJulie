---
name: museum-webgl-navigation
description: "Implémenter ou corriger les emplacements, trajets de caméra et changements de lieux dans le musée Three.js. Ne pas charger pour le CRUD administratif seul."
---

# Navigation et cadre 3D

Utilise les sections B, C et G de `docs/CONTRATS_TECHNIQUES.md` pour les invariants. Inspecte le contrôleur de caméra existant et le manifeste spatial avant de modifier une trajectoire.

Une destination vient d’un identifiant stable. Centralise menu, clic de mesh, carrousel, URL et retour navigateur dans la même action. Le dernier clic l’emporte sur les animations et chargements précédents.

Calcule le focus depuis le transform monde du tableau, son ratio et l’espace écran utile. Vérifie la projection de ses coins, notamment avec une fiche ouverte ou un écran portrait. Une distance fixe pour toutes les œuvres n’est pas acceptable.

La caméra rejoint des lieux existants en suivant les circulations. Vérifie l’absence de passage à travers les murs, colonnes et meubles, y compris sur les courbes lissées. Utilise un seul propriétaire de la pose pour éviter la concurrence entre controls et animation.

Préserve le Canvas entre les sélections. Réveille le rendu à la demande pendant le trajet et après chargement de ressources. Maintiens les événements DOM et les événements 3D séparés.

Vérifie une œuvre verticale, une horizontale, les murs opposés, About, Contact, trois clics rapides et le retour navigateur. Documente les parcours réellement testés.
