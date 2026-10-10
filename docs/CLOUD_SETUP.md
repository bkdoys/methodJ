# Synchronisation Cloud (facultative)

🇫🇷 Français · [🇬🇧 English](CLOUD_SETUP.en.md)

methodJ fonctionne sans compte. Cette page explique comment brancher **votre propre** projet Firebase pour retrouver vos cours sur tous vos appareils. L'offre gratuite de Firebase (plan « Spark ») suffit largement pour un usage personnel.

## Ce que vous obtenez

- Une base Firestore **à vous** : vos données ne passent par aucun serveur partagé.
- Une connexion Google (ou e-mail / mot de passe).
- Des règles de sécurité strictes : chaque utilisateur ne voit que ses propres données ([firestore.rules](../firestore.rules)).

## Méthode rapide : le script

Prérequis : Node.js 20+, un compte Google.

```bash
./scripts/setup-firebase.sh
```

Le script vous guide :
1. connexion à Firebase ;
2. projet : un existant, ou création d'un nouveau (donnez un identifiant unique, par exemple `medj-prenom-nom`) ;
3. création de l'application web et écriture de `firebase-applet-config.json` et `.firebaserc` (ces deux fichiers sont ignorés par git, ils vous sont propres) ;
4. création de la base Firestore et publication des règles de sécurité ;
5. construction et publication de l'application (Firebase Hosting), si vous le souhaitez.

### Les 3 étapes manuelles (dans les consoles Firebase et Google Cloud)

1. **Activer la connexion Google** : Authentication > cliquer sur **Commencer** (à faire une seule fois par projet) > Méthode de connexion > Google > Activer, choisir un e-mail d'assistance, enregistrer. (Vous pouvez activer aussi « E-mail/Mot de passe ».)
2. **Domaine autorisé** : Authentication > Paramètres > Domaines autorisés. `votre-projet.web.app` y figure par défaut. Si vous utilisez un autre domaine ou `localhost`, ajoutez-le.
3. **Adresse de retour de Google** (obligatoire, sinon `redirect_uri_mismatch`) : ouvrez `https://console.cloud.google.com/apis/credentials?project=votre-projet` (le `?project=` évite de se tromper de projet), ouvrez l'**ID client OAuth** de type « Application Web », et dans « URI de redirection autorisés » **tapez** `https://votre-projet.web.app/__/auth/handler`, sans espace ni `/` final. L'adresse en `.firebaseapp.com` y est déjà, pas celle en `.web.app`. Enregistrez et patientez 5 à 15 minutes.

Ouvrez ensuite `https://votre-projet.web.app`, puis Préférences > Cloud > « Continuer avec Google ».

## Méthode manuelle (sans le script)

1. Créez un projet sur <https://console.firebase.google.com> et ajoutez une application **Web**.
2. Copiez [firebase-applet-config.example.json](../firebase-applet-config.example.json) en `firebase-applet-config.json` et remplissez-le avec la configuration de votre application web (Paramètres du projet > Vos applications). Laissez `"firestoreDatabaseId": "(default)"`.
3. Copiez `.firebaserc.example` en `.firebaserc` avec l'identifiant de votre projet.
4. Créez une base Firestore (mode production, région proche de chez vous).
5. Publiez les règles : `./deploy.sh --rules`.
6. Activez la connexion Google (voir ci-dessus) et publiez l'application : `./deploy.sh`.

## Dépannage

| Message | Cause et solution |
|---|---|
| **Erreur 400 : redirect_uri_mismatch** | L'adresse de retour n'est pas autorisée. Console Google Cloud > API et services > Identifiants > votre client OAuth « Application Web » > **URI de redirection autorisés** : ajoutez `https://votre-domaine/__/auth/handler` (sans espace ni `/` final, avec les deux tirets bas). Patientez quelques minutes. |
| **auth/unauthorized-domain** | Ajoutez votre domaine dans Authentication > Paramètres > Domaines autorisés. |
| **auth/configuration-not-found** | Authentication n'a jamais été initialisé dans ce projet : console Firebase > Authentication > **Commencer**, puis activez Google (Méthode de connexion). |
| **auth/operation-not-allowed** | Le fournisseur n'est pas activé : Authentication > Méthode de connexion. |
| Le bouton Google ne fait rien / retour sans connexion (iPad) | Utilisez le domaine Firebase Hosting (`.web.app`) pour l'application, publiez la dernière version, puis fermez et rouvrez l'app. Si vous avez ajouté des en-têtes de sécurité (CSP), ils doivent autoriser `apis.google.com` et `*.firebaseapp.com` (c'est le cas de `firebase.json` fourni). |
| **permission-denied** | Les règles ne sont pas publiées ou sont anciennes : `./deploy.sh --rules`. |
| « Cloud non configuré » dans l'app | `firebase-applet-config.json` est absent ou vide. Relancez le script. |

## Données et vie privée

Les données sont dans **votre** Firestore (`users/{votre identifiant}/…`). Vous pouvez les exporter à tout moment en JSON (Préférences > Cloud) et supprimer le projet quand vous voulez. Gardez `firebase-applet-config.json` hors de tout dépôt public (il est ignoré par git par défaut).
