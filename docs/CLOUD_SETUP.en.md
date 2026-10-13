# Cloud sync (optional)

[🇫🇷 Français](CLOUD_SETUP.md) · 🇬🇧 English

methodJ works without any account. This page explains how to connect **your own** Firebase project so your courses follow you across devices. Firebase's free plan ("Spark") is plenty for personal use.

## What you get

- A Firestore database that is **yours**: your data goes through no shared server.
- Google sign-in (or email / password).
- Strict security rules: each user only sees their own data ([firestore.rules](../firestore.rules)).

## Quick way: the script

Requirements: Node.js 22+, a Google account.

```bash
./scripts/setup-firebase.sh
```

The script walks you through:
1. signing in to Firebase;
2. the project: an existing one, or a new one (give a unique id, e.g. `medj-yourname`);
3. creating the web app and writing `firebase-applet-config.json` and `.firebaserc` (both are git-ignored, they are yours);
4. creating the Firestore database and publishing the security rules;
5. building and publishing the app (Firebase Hosting), if you want.

### The 3 manual steps (in the Firebase and Google Cloud consoles)

1. **Enable Google sign-in**: Authentication > click **Get started** (once per project) > Sign-in method > Google > Enable, pick a support email, save. (You can also enable "Email/Password".)
2. **Authorized domain**: Authentication > Settings > Authorized domains. `your-project.web.app` is there by default. If you use another domain or `localhost`, add it.
3. **Google's return address** (required, otherwise `redirect_uri_mismatch`): open `https://console.cloud.google.com/apis/credentials?project=your-project` (the `?project=` avoids picking the wrong project), open the **OAuth client ID** of type "Web application", and under "Authorized redirect URIs" **type** `https://your-project.web.app/__/auth/handler`, with no space and no trailing `/`. The `.firebaseapp.com` address is already there, the `.web.app` one is not. Save and wait 5 to 15 minutes.

Then open `https://your-project.web.app`, go to Preferences > Cloud > "Continue with Google".

## Manual way (without the script)

1. Create a project at <https://console.firebase.google.com> and add a **Web** app.
2. Copy [firebase-applet-config.example.json](../firebase-applet-config.example.json) to `firebase-applet-config.json` and fill it with your web app's configuration (Project settings > Your apps). Keep `"firestoreDatabaseId": "(default)"`.
3. Copy `.firebaserc.example` to `.firebaserc` with your project id.
4. Create a Firestore database (production mode, a region near you).
5. Publish the rules: `./deploy.sh --rules`.
6. Enable Google sign-in (see above) and publish the app: `./deploy.sh`.

## Card images (optional)

Images added to cards (photo, diagram, image occlusion cards) are compressed on the device (about 50 to 300 KB each) and kept in its local storage. To get them on your other devices, they go through **Cloud Storage**, not Firestore. Without Storage, everything else works: images simply stay on the device where you added them.

1. Firebase console > **Storage** > Get started. New projects must switch to the **Blaze** plan (pay as you go). The free tier (5 GB stored, 100 GB downloaded per month for a US bucket) is more than enough: 1,000 images are about 250 MB, and each device downloads an image only once. You can set a budget alert in Google Cloud.
2. Publish the Storage rules (only the owner reads and writes, at most 1 MB per image): `./deploy.sh --storage`.
3. Allow reading from the browser (CORS), once, from [Cloud Shell](https://shell.cloud.google.com) or with `gcloud` installed:
   ```bash
   gcloud storage buckets update gs://your-project.firebasestorage.app --cors-file=storage.cors.json
   ```
4. Publish the app (`./deploy.sh`): `firebase.json` allows images to be displayed (`img-src blob:`).

## Troubleshooting

| Message | Cause and fix |
|---|---|
| **Error 400: redirect_uri_mismatch** | The return address is not allowed. Google Cloud console > APIs & Services > Credentials > your "Web application" OAuth client > **Authorized redirect URIs**: add `https://your-domain/__/auth/handler` (no spaces, no trailing `/`, two underscores). Wait a few minutes. |
| **auth/unauthorized-domain** | Add your domain under Authentication > Settings > Authorized domains. |
| **auth/configuration-not-found** | Authentication was never set up in this project: Firebase console > Authentication > **Get started**, then enable Google (Sign-in method). |
| **auth/operation-not-allowed** | The provider is not enabled: Authentication > Sign-in method. |
| Google button does nothing / back on the app but not signed in (iPad) | Serve the app from the Firebase Hosting domain (`.web.app`), publish the latest version, then fully close and reopen the app. If you added security headers (CSP), they must allow `apis.google.com` and `*.firebaseapp.com` (the provided `firebase.json` does). |
| **permission-denied** | Rules are not published or outdated: `./deploy.sh --rules`. |
| An image stays “not yet available” on another device | The device that added it has not sent it yet (offline), or Storage is not set up (see “Card images”). If the browser console shows a CORS error, redo step 3. |
| "Cloud not configured" in the app | `firebase-applet-config.json` is missing or empty. Run the script again. |

## Data and privacy

Data lives in **your** Firestore (`users/{your id}/…`). You can export it as JSON at any time (Preferences > Cloud) and delete the project whenever you like. Keep `firebase-applet-config.json` out of any public repository (it is git-ignored by default).
