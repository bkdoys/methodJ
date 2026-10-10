#!/usr/bin/env bash
# Branche methodJ sur VOTRE projet Firebase (synchronisation entre appareils). Facultatif : sans Firebase,
# l'application fonctionne en local.
#
# Usage : ./scripts/setup-firebase.sh
#
# Ce que fait le script : connexion à Firebase, projet (existant ou créé), application web, base Firestore,
# règles de sécurité, fichiers firebase-applet-config.json et .firebaserc, déploiement en option.
# Ce qu'il NE fait PAS (à faire dans la console, il vous guide à la fin) : activer la connexion Google.
# Guide détaillé : docs/CLOUD_SETUP.md (en anglais : docs/CLOUD_SETUP.en.md)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js est requis (https://nodejs.org)." >&2
  exit 1
fi

if command -v firebase >/dev/null 2>&1; then
  FB="firebase"
else
  FB="npx -y firebase-tools"
fi

ask() { # ask "question" "défaut" -> réponse
  local reply
  read -r -p "$1 [$2] " reply
  echo "${reply:-$2}"
}

# JSON -> valeur : lit stdin, évalue une expression JS sur `j`
json_get() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=($1);if(v===undefined||v===null){process.exit(2)}console.log(typeof v==='string'?v:JSON.stringify(v))}catch(e){process.exit(2)}})"; }

if [ -f firebase-applet-config.json ]; then
  echo "⚠️  firebase-applet-config.json existe déjà : il sera remplacé."
  [ "$(ask 'Continuer ?' 'n')" = "o" ] || { echo "Abandon."; exit 1; }
fi

echo "🔐 [1/6] Connexion à Firebase"
if ! $FB projects:list >/dev/null 2>&1; then
  $FB login
fi

echo ""
echo "📁 [2/6] Projet Firebase"
echo "   Vos projets :"
$FB projects:list || true
PROJECT_ID="$(ask 'Identifiant du projet à utiliser (ou à créer)' '')"
if [ -z "$PROJECT_ID" ]; then echo "❌ Identifiant obligatoire." >&2; exit 1; fi
if ! $FB projects:list --json 2>/dev/null | grep -q "\"projectId\": \"$PROJECT_ID\""; then
  echo "   Ce projet n'existe pas encore : création…"
  $FB projects:create "$PROJECT_ID" --display-name "methodJ"
fi

echo ""
echo "🌐 [3/6] Application web"
APP_JSON="$($FB apps:list WEB --project "$PROJECT_ID" --json 2>/dev/null || true)"
APP_ID="$(echo "$APP_JSON" | json_get 'j.result[0].appId' 2>/dev/null || true)"
if [ -z "$APP_ID" ]; then
  APP_ID="$($FB apps:create WEB "methodJ" --project "$PROJECT_ID" --json | json_get 'j.result.appId')"
fi
echo "   Application : $APP_ID"

SDK_JSON="$($FB apps:sdkconfig WEB "$APP_ID" --project "$PROJECT_ID" --json)"
echo "$SDK_JSON" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const j=JSON.parse(s);
  let cfg=j.result&&(j.result.sdkConfig||(j.result.fileContents&&JSON.parse(j.result.fileContents)));
  if(!cfg){console.error("Configuration illisible : copiez-la depuis la console Firebase (Paramètres du projet > Vos applications) dans firebase-applet-config.json.");process.exit(1)}
  cfg.firestoreDatabaseId="(default)";
  require("fs").writeFileSync("firebase-applet-config.json",JSON.stringify(cfg,null,2)+"\n");
})'
printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$PROJECT_ID" > .firebaserc
echo "   ✔ firebase-applet-config.json et .firebaserc écrits"

echo ""
echo "🗄️  [4/6] Base Firestore"
echo "   Régions courantes : eur3 (Europe), nam5 (États-Unis). Liste complète : $FB firestore:locations"
LOCATION="$(ask 'Région de la base' 'eur3')"

# Sur un projet tout neuf, l'activation des API Google met quelques minutes à se propager : les commandes
# répondent « 403 / API disabled / permission » puis passent. On réessaie donc plusieurs fois.
OUT_FILE="$(mktemp)"
run_with_retry() { # run_with_retry <message d'attente> <commande...> : 0 = réussi, 1 = échec définitif
  local label="$1"; shift
  local attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    if "$@" >"$OUT_FILE" 2>&1; then cat "$OUT_FILE"; return 0; fi
    if grep -qiE "already exists" "$OUT_FILE"; then cat "$OUT_FILE"; return 0; fi
    if grep -qiE "has not been used|is disabled|SERVICE_DISABLED|caller does not have permission|403|propagat" "$OUT_FILE"; then
      echo "   ⏳ $label : l'API n'est pas encore prête (essai $attempt/8), nouvel essai dans 30 s…"
      sleep 30
    else
      cat "$OUT_FILE"; return 1
    fi
  done
  cat "$OUT_FILE"; return 1
}

if run_with_retry "Création de la base" $FB firestore:databases:create "(default)" --location "$LOCATION" --project "$PROJECT_ID"; then
  echo "   ✔ Base prête"
else
  echo "❌ Impossible de créer la base Firestore. Créez-la dans la console (Firestore Database > Créer une base), puis relancez ce script." >&2
  exit 1
fi

echo ""
echo "🛡️  [5/6] Règles de sécurité Firestore"
if ! run_with_retry "Publication des règles" $FB deploy --only firestore:rules --project "$PROJECT_ID"; then
  echo "❌ Impossible de publier les règles. Relancez ./deploy.sh --rules dans quelques minutes." >&2
  exit 1
fi

echo ""
echo "🚀 [6/6] Mise en ligne (Hosting)"
if [ "$(ask 'Construire et publier l’application maintenant ?' 'o')" = "o" ]; then
  ./deploy.sh
  SITE="https://$PROJECT_ID.web.app"
else
  SITE="(non publié : lancez ./deploy.sh plus tard)"
fi

cat <<DONE

✅ Presque terminé. Il reste 3 étapes à faire dans la console (la ligne de commande ne sait pas les faire) :

 1. Activer la connexion Google :
    https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers
    → si un bouton « Commencer » (Get started) apparaît, cliquez dessus d'abord (une seule fois)
    → puis « Google » > Activer > choisir un e-mail d'assistance > Enregistrer
    (optionnel : activer aussi « E-mail/Mot de passe »)

 2. Vérifier le domaine autorisé : Authentication > Paramètres > Domaines autorisés
    doit contenir $PROJECT_ID.web.app (c'est le cas par défaut).

 3. Autoriser l'adresse de retour de Google (sinon : erreur « redirect_uri_mismatch ») :
    https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID
    → ouvrir l'ID client OAuth de type « Application Web » (un seul, créé à l'étape 1)
    → « URI de redirection autorisés » > Ajouter, TAPER (sans espace ni « / » final) :
         https://$PROJECT_ID.web.app/__/auth/handler
      (l'adresse en .firebaseapp.com y est déjà ; la vôtre en .web.app, non)
    → Enregistrer, puis patienter 5 à 15 minutes.

Application : $SITE
En cas d'erreur « redirect_uri_mismatch » : voir docs/CLOUD_SETUP.md, section Dépannage.
DONE
