# methodJ · Spaced-repetition revision planner

[🇫🇷 Français](README.md) · 🇬🇧 English

methodJ schedules your revisions with the **"J method"** (spaced repetition): for each course, review slots are placed at J0, J1, J3, J7, J15, J30, J60… (J = *jour*, day). You stay in control: drag and drop, cascading reschedule, timer, statistics. The interface is available in French and English (follows your browser on first launch, then adjustable in Preferences > Display > Language).

> ⚠️ methodJ is a study-organisation tool. It provides no medical content and no medical advice.

**Weekly planner**: slots can be dragged by finger or mouse, including from one day to another.

![Weekly planner](docs/screenshots/planning.png)

**Split screen** (tablet or large display): today's schedule on the left, the course catalogue and each course's repetition cycle (J0, J1, J3…) on the right.

![Split screen: today's schedule and course catalogue](docs/screenshots/planning-split.jpg)

**Course catalogue and folder tree**: file courses by subject › folder › sub-folder, filter in one click, and attach links (Drive, flashcards…) to each course.

![Course catalogue with the folder tree](docs/screenshots/cours-arbre.jpg)

<details>
<summary>Dark theme</summary>

![Weekly planner, dark theme](docs/screenshots/planning-sombre.png)

![Split screen, dark theme](docs/screenshots/planning-split-sombre.jpg)

![Course catalogue with the folder tree, dark theme](docs/screenshots/cours-arbre-sombre.jpg)

</details>

## Features

- **Customisable J method**: pick your intervals, save your defaults, set a default slot length plus exceptions per J.
- **Day, N-day, Week and Month views** with a time scale, slots you can drag by finger or mouse (also from one day to another), allowed hours and breaks (e.g. lunch) per weekday, which you can override for a single day.
- **Cascading reschedule**: if you push a slot back, the following unfinished ones follow.
- **Revision timer** with notes and a mastery self-assessment.
- **Course catalogue**, customisable subjects and colours (CSV/JSON import), with a folder tree (subject › folder › sub-folder) to file and filter courses, and links (Drive, flashcards…) attached to each course, plus an `.ics` export of your slots (Google Calendar, Apple, Outlook).
- **Statistics**: streak, overdue, upcoming load, retention per J.
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
