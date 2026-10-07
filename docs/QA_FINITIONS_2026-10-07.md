# Finitions de la visite — 7 octobre 2026

## Corrections

- Le panneau « Les œuvres » conserve la promenade et son horloge. La souris ne pilote pas le décor sous le panneau ; choisir une œuvre conserve le focus arrêté.
- Le focus d’une œuvre réserve la même marge à gauche et à droite pour la fiche. Son centre reste sur l’axe horizontal du Canvas, sans superposition de la fiche au cadre.
- La fiche, le bouton de reprise et les boutons d’introduction deviennent inertes derrière un panneau. La navigation principale et le carrousel restent accessibles.
- Le renderer 3D se charge en parallèle du shell sur ordinateur. Le téléphone conserve le catalogue sans importer le renderer ; une erreur de chunk garde le catalogue utilisable.
- Les détails HD respectent l’expiration du cache HTTP et le contrôle de publication. Une réponse refusée conserve la texture de salle au lieu de décoder une ancienne réponse HD.

## Vérifications réalisées

- `npm test` : 401 tests réussis sur 38 fichiers.
- `npm run typecheck` et `npm run build` : réussis.
- Chrome natif, fixture locale, scènes et images réelles : focus d’une œuvre, portrait à 1440 × 900, panneau œuvres pendant promenade et après fermeture, trois clics « suivante », catalogue à 390 × 844 sans Canvas ni débordement.
- Promenade observée sous le panneau : horloge 19,0878 → 61,5803 s ; pose déplacée, navigation identique, puis 61,9553 s après fermeture, un seul Canvas.
- Projections testées : tableaux verticaux/horizontaux, quatre orientations de murs et plusieurs tailles d’écran ; cadre hors de la fiche, caméra accessible et hors obstacles.
- Bundle catalogue : 139 968 octets gzip, inchangé. Entrée accueil : +62 octets gzip ; chunk 3D de 1 110 177 octets toujours absent des scripts initiaux du catalogue et de l’accueil.

Captures et mesures : `artifacts/polish-2026-10-07/` et `artifacts/loading-audit-2026-10-07/` (artefacts locaux exclus de la publication).

## Limites

Le téléphone est un viewport de Chrome, pas un appareil physique. Aucun gain de temps de chargement ou de FPS n’est annoncé sans comparaison réseau contrôlée. Le test du cache HTTP HD simule un cache expiré ; il ne prétend pas avoir attendu une expiration réelle dans le navigateur. Le fonctionnement actuel avec deux salles est borné ; le préchargement de toutes les salles devra être revu si le musée est fortement agrandi.
