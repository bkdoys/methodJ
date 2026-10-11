# Envoi direct vers Google Agenda (facultatif)

L'export `.ics` fonctionne sans rien configurer. Pour que l'application **crée elle-même un agenda dédié dans votre compte
Google et y envoie vos créneaux** (avec mise à jour et retrait des créneaux supprimés), il faut un ID client OAuth à vous.

L'application n'obtient que le droit `calendar.app.created` : elle ne voit que l'agenda qu'elle a créé, jamais vos autres agendas.

1. Console Google Cloud (le projet Firebase convient) → **API et services → Bibliothèque** → activer **Google Calendar API**.
2. **Google Auth Platform** → configurer l'écran de consentement (type *Externe*, votre adresse en contact). En mode **Test**, ajoutez
   votre compte dans *Audience → Utilisateurs test* (vous verrez un avertissement « application non vérifiée », à passer une fois).
3. **Accès aux données** → ajouter le niveau d'accès `…/auth/calendar.app.created` (non sensible).
4. **Clients → Créer un client → Application Web**. Dans *Origines JavaScript autorisées*, ajoutez `http://localhost:3000` et
   l'adresse de votre site. Pas d'URI de redirection.
5. Copiez l'ID client dans `firebase-applet-config.json` : `"googleClientId": "….apps.googleusercontent.com"`, puis reconstruisez.

Sans `googleClientId`, le bouton n'apparaît pas (l'export `.ics` reste disponible). Cette fonction demande aussi que le fichier
`firebase-applet-config.json` existe. L'en-tête de sécurité de `firebase.json` doit autoriser `https://accounts.google.com/gsi/client`
(c'est le cas dans ce dépôt).
