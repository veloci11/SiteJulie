# Refonte chaleureuse et mobile — contrat partagé

Deux salles réelles reliées, 4 œuvres dans chacune. Données d’artiste inchangées. Références : les deux PNG fournis le 10 septembre (Downloads), surtout le décor méditerranéen sable et la lumière enveloppante.

## Géométrie / coordonnées communes

Axes Three Y-up, mètres. Chaque module : x = -6 à 6, z = -9 à 9 ; offset des salles = 18 m sur +Z. room-1 = hall.glb, room-2 et suivantes = extension.glb. Hauteur libre au moins 5.5 m, sommet des voûtes possible 6.6 m.

12 ancres conservées par module, toutes y = 2.65 :
- Gauche x=-5.86, z=6,2,-1.5,-4, rotationY=+PI/2.
- Droite x=+5.86, mêmes z, rotationY=-PI/2.
- Fond z=-8.86 : x=-3.5,0,+3.5, rotationY=0.
- Entrée z=+8.86 : x=+3.5, rotationY=PI.
- Exception extension : ancre10 déplacée à entrée gauche x=-3.5,z=+8.86, rotationY=PI, libérant la porte centrale du fond.
- Maximum œuvres : 2.3 m de large,3 m de haut ; ancre10 hall maximum2.8 m de large.

Portes frontales z=±9 centrées x=0 : largeur3.2 m, passage clair jusqu’à y3.8. Hall fermé au fond, ouvert à l’avant ; extension ouverte aux deux bouts. À la dernière salle, la porte avant donne sur une terrasse et un extérieur construit, jamais le vide.

Alcôves latérales : x=±6 à ±10, z=-9 à -4. Ouvertures latérales centrées z=-6.5, largeur2.6 m, hauteur claire3.5 m. Fond éditorial x=±9.8,z=-6.5, titre gravé vers y3.8. Architecture peut différer entre salles sans bouger les ancres ni boucher les parcours.

Mobilier/arbres/sculptures hors accès normaux aux œuvres et parcours : chaque volume solide ajouté doit avoir proxy dans manifest. Principaux trajets : centre x=0, z7,3,0,-3,-6.5,-7.5, alcôves x±8.4,z=-6.5, connexion centrale z9. Demi-largeur du couloir central>=1.25m.

## Répartition de démonstration

room-1 « La galerie » : œuvre01→slot02, œuvre02→slot06, œuvre03→slot10 (fond central), œuvre04→slot04.
room-2 « Le salon » : œuvre05→slot02, œuvre06→slot06, œuvre07→slot09, œuvre08→slot11.

seed seulement : aucun data.json utilisateur à remplacer. Scripts de préparation doivent reproduire cette répartition. Compatibilité des anciens slugs, ids, images et métadonnées.

## Interface / rectangle de focus

Le Canvas occupe 100dvh, taille stable. Header et commandes sont superposés.
- Portrait téléphone largeur<=700 : réserve haute88px, basse216px, pas de panneau droit. Fiche compacte et boutons tactiles en bas ; collection ouverte dans un tiroir, sélection referme le tiroir.
- Paysage compact (largeur>700,hauteur<=520) : haut64px,bas96px,droite280px.
- Ordinateur : haut96px,bas164px,droite330px.
Ajuster proportionnellement sur les très petites dimensions en conservant un rectangle valide. Ne pas reproduire l’ancienne grille header+carrousel+footer qui retire la moitié de l’écran.

Le parent gère MuseumShell/globals.css/MuseumCanvas/MuseumScene/MuseumLighting/RenderQuality/StoneReflections/EditorialWall et l’intégration. Agent scène : config/navigation/CameraDirector/tests navigation. Agent assets : Blender/scripts/assets/public museum. Agent données : seed, scripts de préparation, données/navigation publique si besoin et tests associés.
