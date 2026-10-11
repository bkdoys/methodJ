# Send directly to Google Calendar (optional)

The `.ics` export works with no setup. For the app to **create its own dedicated calendar in your Google account and send your
slots to it** (updating them, and removing slots you deleted), you need your own OAuth client ID.

The app only gets the `calendar.app.created` permission: it sees the calendar it created, never your other calendars.

1. Google Cloud console (the Firebase project works) → **APIs & Services → Library** → enable **Google Calendar API**.
2. **Google Auth Platform** → set up the consent screen (*External*, your address as contact). In **Testing** mode, add your
   account under *Audience → Test users* (you will see an “unverified app” warning, to skip once).
3. **Data access** → add the scope `…/auth/calendar.app.created` (non-sensitive).
4. **Clients → Create client → Web application**. Under *Authorized JavaScript origins*, add `http://localhost:3000` and your
   site address. No redirect URI.
5. Put the client ID in `firebase-applet-config.json`: `"googleClientId": "….apps.googleusercontent.com"`, then rebuild.

Without `googleClientId` the button is hidden (the `.ics` export stays available). This feature also needs
`firebase-applet-config.json` to exist. The security header in `firebase.json` must allow `https://accounts.google.com/gsi/client`
(it does in this repository).
