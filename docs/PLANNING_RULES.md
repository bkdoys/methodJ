# Surcharge, retards et lissage de charge

Cette page décrit exactement ce que fait l'application quand un jour est trop chargé ou quand des révisions sont en retard.
Le principe : **elle signale et propose, elle ne déplace jamais rien sans votre accord**, et chaque application se défait d'un clic.

## Quand il n'y a plus de place un jour

Un créneau qui ne trouve plus de place dans la plage de travail de son jour **n'est ni décalé au jour suivant ni supprimé**. Il s'empile
juste après le dernier créneau, donc après la fin de la plage (au plus tard jusqu'à minuit), dans la zone grisée du planning. Les dates
des J restent donc celles de la méthode.

L'application le signale de trois façons : un marqueur ambre sur le créneau, un en-tête de jour ambre (vues plusieurs jours et semaine,
et badges sous « Charge du jour » en vue Jour), et une carte « Jours à surveiller » dans l'onglet **Dashboard** (la pastille de l'onglet
les compte).

Un jour est « à surveiller » dans deux cas :
- **Objectif dépassé** : la somme des durées de tous ses créneaux dépasse l'objectif quotidien (Réglages, `dailyTargetHours`) ;
- **Créneaux hors plage** : un créneau non validé est placé après la fin (ou avant le début) de la plage de travail du jour, pauses comprises.
  Un jour « forcé » (cadenas ouvert) n'est jamais signalé hors plage, puisque vous avez levé les limites exprès.

## Le lissage d'un jour chargé

Pour chaque jour à surveiller, du plus proche au plus lointain, l'application essaie deux choses, dans cet ordre.

**D'abord, sans changer de jour.** Si un créneau déborde de la plage alors qu'une place est libre plus tôt le même jour (par exemple un créneau
posé tard à la main, avec un trou le matin), il est **remonté à la première place libre** de la journée, en évitant les pauses. Cela ne touche
ni les autres jours ni la cascade. Si le jour est seulement au-dessus de l'objectif, remonter ne change rien : on passe à l'étape suivante.

**Ensuite, on cherche un créneau non validé à repousser de quelques jours** :

1. On essaie d'abord les J les plus élevés (plus de marge qu'un J0 ou un J1) ; un créneau validé n'est jamais touché.
2. Retard maximal accepté selon le J : **1 jour** pour J0 et J1, **2 jours** pour J2 et J3, **3 jours** au-delà.
3. Un créneau repoussé est **replacé à la première place libre de son nouveau jour** (comme lors d'un déplacement à la main) : le jour d'arrivée est
   jugé avec cette heure, pas avec l'ancienne. Un créneau qui garderait une heure débordant aussi là-bas n'est donc plus refusé s'il y a de la place plus tôt.
4. Un déplacement n'est retenu que s'il **allège** le jour de départ (moins de créneaux hors plage, ou moins de minutes au-dessus de l'objectif)
   et ne rend **aucun autre jour pire**, cascade comprise : un jour sans alerte n'en reçoit pas, un jour déjà chargé ne doit pas empirer.
5. Si la cascade est activée (Réglages), les J suivants non validés du même cours sont décalés du même nombre de jours ; leurs jours d'arrivée
   entrent dans la vérification.
6. Si aucun créneau ne convient, l'application le dit : **« aucune solution simple »**. Il reste à décaler à la main ou à ajuster la plage de
   travail ou l'objectif.

Les déplacements sont calculés l'un après l'autre sur un état simulé. Chaque proposition a une **case à cocher, tout est coché par défaut**,
et un seul bouton **Accepter (N déplacements)** dont le nombre suit les cases. Si vous décochez un déplacement dont un autre dépendait
(par exemple parce que sa cascade libérait de la place), l'autre est grisé et n'est pas appliqué : le nombre affiché est toujours celui de ce
qui sera réellement fait.

## Le rattrapage des retards

C'est le **même moteur** (même cascade, mêmes vérifications), avec un autre objectif : ici on ne cherche pas à alléger un jour, on cherche
la première place libre.

1. Les créneaux en retard sont traités du plus ancien au plus récent.
2. Chacun est replacé **le plus tôt possible à partir d'aujourd'hui**, sur un jour où il n'aggrave rien (objectif et plage respectés,
   cascade comprise), à la première place libre de ce jour.
3. Avec la cascade, les J suivants du même cours suivent le mouvement ; ceux qui ont déjà bougé ne sont pas proposés une seconde fois.
   Comme pour le lissage, les propositions se cochent et se décochent.
4. On cherche sur les **14 prochains jours**. Au-delà, ou si aucun jour ne convient : « aucune solution simple », à décaler à la main.

## À savoir

- Les deux plans sont indépendants : appliquer l'un recalcule l'autre. Selon l'ordre, un jour peut devenir impossible à alléger
  (par exemple si le rattrapage a rempli les jours suivants) : l'application le dit alors honnêtement.
- Un seul message « Plan appliqué » avec **Annuler** remet tous les créneaux (et les dates de départ des cours) comme avant.
- Les créneaux déplacés sont replacés dans la plage de travail de leur nouveau jour, en évitant les pauses.
- Rien de tout cela ne touche aux règles Firestore ni aux données stockées : seules les dates et heures des créneaux changent, comme
  pour un décalage fait à la main.
