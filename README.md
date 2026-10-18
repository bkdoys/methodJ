# methodJ · Planificateur de révisions en répétition espacée

🇫🇷 Français · [🇬🇧 English](README.en.md)

methodJ repose sur la **méthode des J** : on ne relit pas un cours une fois, on le revoit à intervalles de plus en plus espacés. Quand vous ajoutez un cours, vous indiquez le jour du premier passage (**J0**) ; methodJ place alors les révisions suivantes à **J1, J3, J7, J15, J30, J60…** (J = *jour* : J7 est 7 jours après J0). Chaque créneau se valide une fois fait. Vous gardez la main : si vous repoussez un créneau, les suivants du même cours suivent (cascade) ; les intervalles, les durées, les horaires et les pauses se règlent.

Autour de cette méthode, methodJ ajoute de quoi tenir le rythme : un tableau de bord qui signale les retards et lisse la charge, des cours en révision libre et une **période de révision** avant un examen, des cartes à mémoriser (flashcards), des statistiques, un export vers votre agenda.

> ⚠️ methodJ est un outil d'organisation du travail. Il ne fournit aucun contenu médical ni avis médical.

## La méthode des J

**Planning de la semaine** : les créneaux se déplacent au doigt ou à la souris, d'un jour à l'autre.

![Planning de la semaine](docs/screenshots/planning.png)

**Écran scindé** (tablette ou grand écran) : le planning du jour à gauche, le catalogue des cours et leur cycle de répétitions (J0, J1, J3…) à droite.

![Écran scindé : planning du jour et catalogue des cours](docs/screenshots/planning-split.jpg)

**Catalogue et arborescence** : rangez vos cours par discipline › dossier › sous-dossier, filtrez en un clic, donnez une couleur à chaque dossier (ou laissez la nuance automatique de la discipline), élargissez l'arbre à votre goût, et attachez des liens (Drive, flashcards…) à chaque cours.

![Catalogue des cours avec l'arborescence](docs/screenshots/cours-arbre.jpg)

Ce que vous réglez :

- **Une méthode personnalisable** : choisissez vos intervalles, enregistrez vos réglages par défaut, durée de créneau par défaut et exceptions par J.
- **Vues Jour, N jours, Semaine et Mois**, avec échelle horaire, créneaux déplaçables au doigt ou à la souris (aussi d'un jour à l'autre), plages horaires et pauses (déjeuner…) par jour de la semaine, que l'on peut lever pour un jour précis.
- **Décalage en cascade** : si vous repoussez un créneau, les suivants non faits suivent.
- **Gestes tactiles** : balayer pour changer de jour, pincer pour zoomer sur la journée.
- **Chronomètre de révision** avec notes et auto-évaluation de la maîtrise.
- **Catalogue de cours**, disciplines et couleurs personnalisables (import CSV/JSON), arborescence (discipline › dossier › sous-dossier) pour ranger et filtrer, liens (Drive, flashcards…) attachés à chaque cours.

## Les fonctionnalités annexes

### Tableau de bord, lissage et rattrapage

Tout ce qui demande une action au même endroit : retards, jours au-dessus de votre objectif, créneaux hors de la plage de travail, avec des propositions de lissage et de rattrapage que vous cochez avant de les accepter (jamais appliquées sans votre accord, annulables). Les règles sont décrites dans [docs/PLANNING_RULES.md](docs/PLANNING_RULES.md).

![Dashboard : jours à surveiller, lissage proposé et retards](docs/screenshots/dashboard.jpg)

### Révision libre et période de révision

Un cours peut être en **révision libre** (sans J programmé) : vous lui ajoutez des révisions (R) quand vous le souhaitez, et vous le repassez en méthode des J plus tard si besoin ; le tableau de bord signale un cours libre laissé de côté.

Avant un examen, la **période de révision** organise un tour complet : cochez des cours (arbre discipline › dossier › cours) et choisissez des dates. methodJ passe ces cours en révision libre et répartit leurs révisions sur la période : un nombre de passages selon la maîtrise de chaque cours, régulièrement espacés, le dernier près de l'examen, les disciplines alternées (jamais toute une discipline le même jour) et la charge lissée. La période a ses propres horaires, pauses et objectif quotidien, qui remplacent les vôtres pendant ces dates ; si ça ne rentre pas, methodJ propose des journées plus longues, puis une période plus longue. Tout est un **aperçu** (planning simulé, charge jour par jour, passages par cours) : rien n'est modifié avant « Planifier », « Autre répartition » tire un autre agencement, et l'ensemble s'annule d'un clic. methodJ vous la propose quand l'examen approche (réglable, ou toujours / jamais, dans Préférences > Examen). Voir [les règles](docs/PLANNING_RULES.md#la-période-de-révision).

![Période de révision : aperçu de la répartition](docs/screenshots/periode.jpg)

### Cartes (flashcards)

Des cartes rédigées dans chaque cours (recto/verso ou texte à trous, avec images : photo prise depuis l'iPad, fichier, capture collée ou dessin à main levée au doigt ou au stylet, aussi pour annoter une image ; et cartes à masques sur un schéma, comme l'Image Occlusion d'Anki), révisées avec l'algorithme FSRS (celui d'Anki) : cartes du jour, ou toutes les cartes d'un cours, d'un dossier ou d'une discipline, aussi depuis un créneau J. Import CSV (export Anki « Notes en texte brut » ou tableur). Une carte peut être créée sans cours : elle attend dans « Cartes à trier » que vous la rangiez. Les cartes sont enregistrées sur l'appareil et synchronisées par cours (images via Cloud Storage, facultatif : voir [la synchronisation](docs/CLOUD_SETUP.md#images-des-cartes-facultatif)).

![Vue Cartes : cartes du jour et paquets par discipline](docs/screenshots/cartes.jpg)

Le lecteur plein écran note chaque réponse (Encore, Difficile, Bien, Facile) et affiche le délai avant le prochain passage ; sur un schéma, on masque des zones (rectangles, ovales ou contours au polygone) et on devine une zone à la fois.

![Carte recto/verso : réponse affichée et boutons de note](docs/screenshots/carte.jpg)

![Carte à masques sur un schéma : la zone à deviner en rouge](docs/screenshots/carte-masques.jpg)

### Statistiques

Progression du programme (cours commencés, rythme), 7 derniers jours comparés aux 7 d'avant, charge à venir sur 14, 30 ou 60 jours, mémorisation selon l'étape J, **écart au planning d'origine** (la date prévue de chaque J est figée à la validation du J0 ; repousser un créneau ne la change pas) et, si vous saisissez une **date d'examen** (Préférences > Examen), une projection du rythme nécessaire ; sans date, rien n'est affiché.

![Statistiques : progression, charge à venir, écart au planning d'origine](docs/screenshots/stats.jpg)

Pour les cartes : rétention estimée et réelle, cartes révisées par jour, journal des révisions, cartes dues sur 30 jours, cartes souvent oubliées, et progression par discipline.

![Statistiques : flashcards et progression par discipline](docs/screenshots/stats-cartes.jpg)

### Agenda et sauvegardes

- **Export `.ics`** de vos créneaux (Google Agenda, Apple, Outlook), et, si vous le configurez, **envoi direct vers un agenda Google** dédié, mis à jour à chaque envoi.
- **Sauvegarde JSON** à tout moment (export / import), et, si vous êtes connecté avec Google, un bouton **« Sauvegarder sur Drive »** qui dépose l'export dans un dossier de votre Drive (un fichier par jour). L'envoi vers Google Agenda et Drive est facultatif : voir [docs/GOOGLE_CALENDAR_SETUP.md](docs/GOOGLE_CALENDAR_SETUP.md).

### Et aussi

- **Interface en français et en anglais** : la langue du navigateur est suivie au premier lancement, puis réglable dans Préférences > Affichage. Thème clair ou sombre.
- **Installable** sur iPad / téléphone / ordinateur (PWA), plein écran.
- **Vos données vous appartiennent** : tout est stocké dans votre navigateur, avec export / import JSON. La synchronisation entre appareils est **facultative** (votre propre projet Firebase, voir ci-dessous).

<details>
<summary>Thème sombre</summary>

![Planning de la semaine, thème sombre](docs/screenshots/planning-sombre.png)

![Écran scindé, thème sombre](docs/screenshots/planning-split-sombre.jpg)

![Catalogue des cours avec l'arborescence, thème sombre](docs/screenshots/cours-arbre-sombre.jpg)

![Dashboard, thème sombre](docs/screenshots/dashboard-sombre.jpg)

![Période de révision, thème sombre](docs/screenshots/periode-sombre.jpg)

![Vue Cartes, thème sombre](docs/screenshots/cartes-sombre.jpg)

![Carte recto/verso, thème sombre](docs/screenshots/carte-sombre.jpg)

![Carte à masques, thème sombre](docs/screenshots/carte-masques-sombre.jpg)

![Statistiques, thème sombre](docs/screenshots/stats-sombre.jpg)

![Statistiques des cartes, thème sombre](docs/screenshots/stats-cartes-sombre.jpg)

</details>

## Démarrage rapide (sans compte, en local)

Prérequis : [Node.js](https://nodejs.org) 22 ou plus.

```bash
git clone <URL-de-ce-depot>
cd <dossier>
npm install
npm run dev        # http://localhost:3000
```

Sans configuration Firebase, methodJ fonctionne entièrement en local. L'onglet « Cloud » des Préférences l'indique.

## Synchroniser vos appareils (facultatif)

La synchronisation utilise **votre** projet Firebase gratuit (Firestore + connexion Google). Vous n'avez rien à partager avec personne : vos données sont dans votre compte.

```bash
./scripts/setup-firebase.sh
```

Le script crée le projet, la base et les règles de sécurité, écrit la configuration et peut publier l'application. Deux réglages restent à faire dans la console Firebase : tout est expliqué dans [docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md).

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (port 3000) |
| `npm test` | Tests unitaires |
| `npm run lint` | Vérification TypeScript |
| `npm run build` | Construit `dist/` |
| `./deploy.sh` | Vérifie, construit et publie sur Firebase Hosting (`--rules` pour les règles seules, `--all` pour tout) |

## Mise à jour

Après un `git pull`, relancez `npm install`. Si la version ajoute des champs de données, republiez aussi les règles de sécurité : `./deploy.sh --rules`.

## Contribuer

Les suggestions et corrections sont les bienvenues (issues et pull requests). Merci de lancer `npm run lint` et `npm test` avant de proposer un changement.

## Licence

[GNU AGPL v3](LICENSE). Si vous hébergez une version modifiée de methodJ pour d'autres personnes, vous devez en publier le code source.
