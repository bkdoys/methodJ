# methodJ · Spaced-repetition revision planner

[🇫🇷 Français](README.md) · 🇬🇧 English

methodJ schedules your revisions with the **"J method"** (spaced repetition): for each course, review slots are placed at J0, J1, J3, J7, J15, J30, J60… (J = *jour*, day). You stay in control: drag and drop, cascading reschedule, touch gestures (swipe to change day, pinch to zoom), timer, statistics. A course can also be in **free review** (no J scheduled): you add reviews (R) to it whenever you like, and switch it to the J method later if needed; the dashboard flags a free course left aside. A card can also be created without a course: it waits in “Cards to sort” until you file it. The interface is available in French and English (follows your browser on first launch, then adjustable in Preferences > Display > Language).

> ⚠️ methodJ is a study-organisation tool. It provides no medical content and no medical advice.

**Weekly planner**: slots can be dragged by finger or mouse, including from one day to another.

![Weekly planner](docs/screenshots/planning.png)

**Split screen** (tablet or large display): today's schedule on the left, the course catalogue and each course's repetition cycle (J0, J1, J3…) on the right.

![Split screen: today's schedule and course catalogue](docs/screenshots/planning-split.jpg)

**Course catalogue and folder tree**: file courses by subject › folder › sub-folder, filter in one click, give each folder a colour (or keep the automatic shade of its subject), resize the tree to your liking, and attach links (Drive, flashcards…) to each course.

![Course catalogue with the folder tree](docs/screenshots/cours-arbre.jpg)

**Dashboard**: everything that needs an action in one place (overdue slots, days above your target, slots outside the working window), with smoothing and catch-up proposals that you tick before accepting them. The rules are described in [docs/PLANNING_RULES.en.md](docs/PLANNING_RULES.en.md).

![Dashboard: days to watch, proposed smoothing and overdue slots](docs/screenshots/dashboard.jpg)

**Cards**: today's cards on the left, your decks filed by subject › folder › course on the right (▶ for a folder's cards due today, “All” for all of its cards, search in questions and answers).

![Cards view: today's cards and decks by subject](docs/screenshots/cartes.jpg)

**A card, and an image-occlusion card**: the full-screen player grades each answer (Again, Hard, Good, Easy) and shows the delay before the next review; on a diagram you hide areas (rectangles, ovals or polygon outlines) and guess one area at a time.

![Front/back card: answer shown with the grade buttons](docs/screenshots/carte.jpg)

![Image-occlusion card on a diagram: the area to guess in red](docs/screenshots/carte-masques.jpg)

**Statistics**: progress through the syllabus (courses started, pace), upcoming load over 14, 30 or 60 days, memorisation by J step, gap to the original plan (the planned date is frozen when J0 is completed) and, if you enter an exam date, a projection of what is left to start.

![Statistics: progress, upcoming load, gap to the original plan](docs/screenshots/stats.jpg)

**Card statistics**: estimated and actual retention, cards reviewed per day, cards due over 30 days, often-forgotten cards, and progress by subject.

![Statistics: flashcards and progress by subject](docs/screenshots/stats-cartes.jpg)

<details>
<summary>Dark theme</summary>

![Weekly planner, dark theme](docs/screenshots/planning-sombre.png)

![Split screen, dark theme](docs/screenshots/planning-split-sombre.jpg)

![Course catalogue with the folder tree, dark theme](docs/screenshots/cours-arbre-sombre.jpg)

![Dashboard, dark theme](docs/screenshots/dashboard-sombre.jpg)

![Cards view, dark theme](docs/screenshots/cartes-sombre.jpg)

![Front/back card, dark theme](docs/screenshots/carte-sombre.jpg)

![Image-occlusion card, dark theme](docs/screenshots/carte-masques-sombre.jpg)

![Statistics, dark theme](docs/screenshots/stats-sombre.jpg)

![Card statistics, dark theme](docs/screenshots/stats-cartes-sombre.jpg)

</details>

## Features

- **Customisable J method**: pick your intervals, save your defaults, set a default slot length plus exceptions per J.
- **Day, N-day, Week and Month views** with a time scale, slots you can drag by finger or mouse (also from one day to another), allowed hours and breaks (e.g. lunch) per weekday, which you can override for a single day.
- **Cascading reschedule**: if you push a slot back, the following unfinished ones follow.
- **Revision timer** with notes and a mastery self-assessment.
- **Course catalogue**, customisable subjects and colours (CSV/JSON import), with a folder tree (subject › folder › sub-folder) to file and filter courses, and links (Drive, flashcards…) attached to each course, plus an `.ics` export of your slots (Google Calendar, Apple, Outlook).
- **Flashcards** written in each course (front/back or cloze, with images: photo taken from the iPad, file, pasted screenshot or freehand drawing (finger or stylus, also to annotate an image), compressed when added; and image occlusion cards on a diagram, like Anki's Image Occlusion), reviewed with the FSRS algorithm (Anki's): today's cards, or every card of a course, folder or subject, also from a J slot. CSV import (Anki “Notes in Plain Text” export or spreadsheet). Stored on the device and synced per course (images through Cloud Storage, optional: see [cloud sync](docs/CLOUD_SETUP.en.md#card-images-optional)).
- **Dashboard**: overdue slots, days that are overloaded or have slots outside the window, load smoothing and catch-up proposals (never applied without your consent, and undoable), sync state.
- **Statistics**: courses started and pace, the last 7 days against the 7 before, upcoming load (14, 30 or 60 days), memorisation per J step, **gap to the original plan** (each J's planned date is frozen when J0 is completed; postponing a slot does not change it) and, for cards, estimated and actual retention, review-log activity, due cards and often-forgotten cards. An optional **exam date** (Preferences > Planning) adds a projection of the pace you need; without a date, nothing is shown.
- **Installable** on iPad / phone / computer (PWA), full screen.
- **Your data stays yours**: everything is stored in your browser, with JSON export / import. Syncing between devices is **optional** (your own Firebase project, see below).

## Quick start (no account, local)

Requirement: [Node.js](https://nodejs.org) 22 or later.

```bash
git clone <this-repository-url>
cd <folder>
npm install
npm run dev        # http://localhost:3000
```

Without Firebase configuration methodJ runs entirely locally. The "Cloud" tab in Preferences says so.

## Sync your devices (optional)

Syncing uses **your own** free Firebase project (Firestore + Google sign-in). Nothing is shared with anyone: your data lives in your account.

```bash
./scripts/setup-firebase.sh
```

The script creates the project, the database and the security rules, writes the configuration and can publish the app. Two settings remain to be done in the Firebase console: everything is explained in [docs/CLOUD_SETUP.en.md](docs/CLOUD_SETUP.en.md).

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (port 3000) |
| `npm test` | Unit tests |
| `npm run lint` | TypeScript check |
| `npm run build` | Builds `dist/` |
| `./deploy.sh` | Checks, builds and publishes to Firebase Hosting (`--rules` for rules only, `--all` for both) |

## Updating

After a `git pull`, run `npm install` again. If the release adds data fields, also republish the security rules: `./deploy.sh --rules`.

## Contributing

Suggestions and fixes are welcome (issues and pull requests). Please run `npm run lint` and `npm test` before proposing a change.

## License

[GNU AGPL v3](LICENSE). If you host a modified version of methodJ for other people, you must publish its source code.
