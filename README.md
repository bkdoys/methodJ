# methodJ · Planificateur de révisions en répétition espacée

🇫🇷 Français · [🇬🇧 English](README.en.md)

methodJ planifie vos révisions selon la **méthode des J** (répétition espacée) : à chaque cours, des créneaux de révision sont placés à J0, J1, J3, J7, J15, J30, J60… Vous gardez la main : glisser-déposer, décalage en cascade, chronomètre, statistiques.

> ⚠️ methodJ est un outil d'organisation du travail. Il ne fournit aucun contenu médical ni avis médical.

**Planning de la semaine** : les créneaux se déplacent au doigt ou à la souris, d'un jour à l'autre.

![Planning de la semaine](docs/screenshots/planning.png)

**Écran scindé** (tablette ou grand écran) : le planning du jour à gauche, le catalogue des cours et leur cycle de répétitions (J0, J1, J3…) à droite.

![Écran scindé : planning du jour et catalogue des cours](docs/screenshots/planning-split.jpg)

**Catalogue et arborescence** : rangez vos cours par discipline › dossier › sous-dossier, filtrez en un clic, donnez une couleur à chaque dossier (ou laissez la nuance automatique de la discipline), élargissez l'arbre à votre goût, et attachez des liens (Drive, flashcards…) à chaque cours.

![Catalogue des cours avec l'arborescence](docs/screenshots/cours-arbre.jpg)

**Dashboard** : tout ce qui demande une action au même endroit (retards, jours au-dessus de votre objectif, créneaux hors de la plage de travail), avec des propositions de lissage et de rattrapage que vous cochez avant de les accepter. Les règles sont décrites dans [docs/PLANNING_RULES.md](docs/PLANNING_RULES.md).

![Dashboard : jours à surveiller, lissage proposé et retards](docs/screenshots/dashboard.jpg)

**Cartes** : les cartes du jour à gauche, vos paquets rangés par discipline › dossier › cours à droite (▶ pour les cartes du jour d'un dossier, « Tout » pour toutes ses cartes, recherche dans les questions et les réponses).

![Vue Cartes : cartes du jour et paquets par discipline](docs/screenshots/cartes.jpg)

**Une carte, et une carte à masques** : le lecteur plein écran note chaque réponse (Encore, Difficile, Bien, Facile) et affiche le délai avant le prochain passage ; sur un schéma, on masque des zones (rectangles, ovales ou contours au polygone) et on devine une zone à la fois.

![Carte recto/verso : réponse affichée et boutons de note](docs/screenshots/carte.jpg)

![Carte à masques sur un schéma : la zone à deviner en rouge](docs/screenshots/carte-masques.jpg)

**Statistiques** : progression du programme (cours commencés, rythme), charge à venir sur 14, 30 ou 60 jours, mémorisation selon l'étape J, écart au planning d'origine (la date prévue est figée à la validation du J0) et, si vous saisissez une date d'examen, une projection de ce qu'il reste à commencer.

![Statistiques : progression, charge à venir, écart au planning d'origine](docs/screenshots/stats.jpg)

**Statistiques des cartes** : rétention estimée et réelle, cartes révisées par jour, cartes dues sur 30 jours, cartes souvent oubliées, et progression par discipline.

![Statistiques : flashcards et progression par discipline](docs/screenshots/stats-cartes.jpg)

<details>
<summary>Thème sombre</summary>

![Planning de la semaine, thème sombre](docs/screenshots/planning-sombre.png)

![Écran scindé, thème sombre](docs/screenshots/planning-split-sombre.jpg)

![Catalogue des cours avec l'arborescence, thème sombre](docs/screenshots/cours-arbre-sombre.jpg)

![Dashboard, thème sombre](docs/screenshots/dashboard-sombre.jpg)

![Vue Cartes, thème sombre](docs/screenshots/cartes-sombre.jpg)

![Carte recto/verso, thème sombre](docs/screenshots/carte-sombre.jpg)

![Carte à masques, thème sombre](docs/screenshots/carte-masques-sombre.jpg)

![Statistiques, thème sombre](docs/screenshots/stats-sombre.jpg)

![Statistiques des cartes, thème sombre](docs/screenshots/stats-cartes-sombre.jpg)

</details>

## Fonctionnalités

- **Méthode des J personnalisable** : choisissez vos intervalles, enregistrez vos réglages par défaut, durée de créneau par défaut et exceptions par J.
- **Vues Jour, N jours, Semaine et Mois**, avec échelle horaire, créneaux déplaçables au doigt ou à la souris (aussi d'un jour à l'autre), plages horaires et pauses (déjeuner…) par jour de la semaine, que l'on peut lever pour un jour précis.
- **Décalage en cascade** : si vous repoussez un créneau, les suivants non faits suivent.
- **Chronomètre de révision** avec notes et auto-évaluation de la maîtrise.
- **Catalogue de cours**, disciplines et couleurs personnalisables (import CSV/JSON), avec une arborescence (discipline › dossier › sous-dossier) pour ranger et filtrer les cours, et des liens (Drive, flashcards…) attachés à chaque cours, et un export `.ics` de vos créneaux (Google Agenda, Apple, Outlook).
- **Cartes (flashcards)** rédigées dans chaque cours (recto/verso ou texte à trous, avec images : photo prise depuis l'iPad, fichier, capture collée ou dessin à main levée (au doigt ou au stylet, aussi pour annoter une image), compressées à l'ajout ; et cartes à masques sur un schéma, comme l'Image Occlusion d'Anki), révisées avec l'algorithme FSRS (celui d'Anki) : cartes du jour, ou toutes les cartes d'un cours, d'un dossier ou d'une discipline, aussi depuis un créneau J. Import CSV (export Anki « Notes en texte brut » ou tableur). Enregistrées sur l'appareil et synchronisées par cours (images via Cloud Storage, facultatif : voir [la synchronisation](docs/CLOUD_SETUP.md#images-des-cartes-facultatif)).
- **Dashboard** : retards, jours surchargés ou avec des créneaux hors plage, lissage de charge et rattrapage proposés (jamais appliqués sans votre accord, annulables), état de la synchronisation.
- **Statistiques** : cours commencés et rythme, 7 derniers jours comparés aux 7 d'avant, charge à venir (14, 30 ou 60 jours), mémorisation par étape J, **écart au planning d'origine** (la date prévue de chaque J est figée à la validation du J0 ; repousser un créneau ne la change pas), et, pour les cartes, rétention estimée et réelle, activité du journal des révisions, cartes dues et cartes souvent oubliées. Une **date d'examen** facultative (Préférences > Planning) ajoute une projection du rythme nécessaire ; sans date, rien n'est affiché.
- **Interface en français et en anglais** : la langue du navigateur est suivie au premier lancement, puis réglable dans Préférences > Affichage.
- **Installable** sur iPad / téléphone / ordinateur (PWA), plein écran.
- **Vos données vous appartiennent** : tout est stocké dans votre navigateur, avec export / import JSON. La synchronisation entre appareils est **facultative** (votre propre projet Firebase, voir ci-dessous).

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
