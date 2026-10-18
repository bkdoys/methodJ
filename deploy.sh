#!/usr/bin/env bash

# Stop immediately on error
set -e

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [OPTION] [--site SITE_ID]

Type-checks the project, builds it, then deploys to Firebase.

Options:
  (none)           Deploy Hosting only
  --rules, rules   Deploy Firestore rules only
  --storage        Deploy Cloud Storage rules only (card images)
  --functions      Deploy the nightly backup Cloud Function only
  --all, all       Deploy Hosting + Firestore rules (not the function)
  --site SITE_ID   Hosting on this site only (with none or --all)
  -h, --help       Show this help

Hosting sites: the ones listed in .firebaserc under
  "targets" > <project> > "hosting" > "app"   (all of them by default),
else the project's default site.

Examples:
  ./deploy.sh
  ./deploy.sh --site my-test-site
  ./deploy.sh --rules
  ./deploy.sh --all

Via npm:
  npm run deploy
  npm run deploy -- --site my-test-site
  npm run deploy:all
EOF
}

# Arguments: handled before any costly command (lint/build)
MODE=""
SITE=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help|help)
      usage
      exit 0
      ;;
    --site)
      if [ -z "$2" ]; then
        echo "❌ --site needs a site id" >&2
        exit 1
      fi
      SITE="$2"
      shift
      ;;
    --site=*)
      SITE="${1#--site=}"
      ;;
    --all|all|--rules|rules|--functions|functions|--storage|storage)
      if [ -n "$MODE" ]; then
        echo "❌ Only one option at a time: $MODE, $1" >&2
        exit 1
      fi
      MODE="${1#--}"
      ;;
    *)
      echo "❌ Unknown option: $1" >&2
      echo >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ -n "$SITE" ] && [ -n "$MODE" ] && [ "$MODE" != "all" ]; then
  echo "❌ --site only applies to Hosting (no option, or --all)" >&2
  exit 1
fi

# Hosting sites listed in .firebaserc (target "app" of the default project); empty = default site
SITES=""
if [ -f .firebaserc ]; then
  SITES=$(node -e '
    const rc = JSON.parse(require("fs").readFileSync(".firebaserc", "utf8"));
    const project = rc.projects && rc.projects.default;
    const sites = (((rc.targets || {})[project] || {}).hosting || {}).app || [];
    console.log(sites.join(" "));
  ')
fi
if [ -n "$SITE" ]; then
  if [ -n "$SITES" ] && ! [[ " $SITES " == *" $SITE "* ]]; then
    echo "❌ Unknown site: $SITE (known: $SITES)" >&2
    exit 1
  fi
  SITES="$SITE"
fi

echo "🩺 [methodJ] Starting deployment process..."

# 1. TypeScript check
echo "🔍 [1/3] Type-checking..."
npm run lint

# 2. Production build
echo "📦 [2/3] Production build..."
npm run build

# 3. Firebase deployment
# Detect the Firebase CLI executable
if command -v firebase &> /dev/null; then
  FIREBASE_CMD="firebase"
else
  FIREBASE_CMD="npx -y firebase-tools"
fi

# Hosting part of --only, plus the config to use. With named sites, a temporary copy of firebase.json
# repeats the hosting block once per site (firebase.json itself stays site-agnostic).
HOSTING_ONLY="hosting"
CONFIG_ARGS=()
if [ -n "$SITES" ] && { [ -z "$MODE" ] || [ "$MODE" = "all" ]; }; then
  DEPLOY_CONFIG=".firebase-deploy.json"
  trap 'rm -f "$DEPLOY_CONFIG"' EXIT
  node -e '
    const fs = require("fs");
    const [out, ...sites] = process.argv.slice(1);
    const cfg = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
    const { site, target, ...hosting } = cfg.hosting;
    cfg.hosting = sites.map((s) => ({ site: s, ...hosting }));
    fs.writeFileSync(out, JSON.stringify(cfg, null, 2));
  ' "$DEPLOY_CONFIG" $SITES
  CONFIG_ARGS=(--config "$DEPLOY_CONFIG")
  HOSTING_ONLY=$(printf 'hosting:%s,' $SITES)
  HOSTING_ONLY="${HOSTING_ONLY%,}"
  echo "🌐 Hosting sites: $SITES"
fi

# Default: Hosting only
# '--all' or 'all' option: Hosting + Firestore rules
# '--rules' or 'rules' option: Firestore rules only
case "$MODE" in
  all)
    echo "🚀 [3/3] Firebase deployment (Hosting + Firestore rules)..."
    $FIREBASE_CMD deploy "${CONFIG_ARGS[@]}" --only "$HOSTING_ONLY,firestore"
    ;;
  functions)
    echo "🚀 [3/3] Deploying the backup Cloud Function..."
    $FIREBASE_CMD deploy --only functions
    ;;
  storage)
    echo "🚀 [3/3] Deploying Cloud Storage rules..."
    $FIREBASE_CMD deploy --only storage
    ;;
  rules)
    echo "🚀 [3/3] Deploying Firestore rules..."
    $FIREBASE_CMD deploy --only firestore:rules
    ;;
  *)
    echo "🚀 [3/3] Deploying to Firebase Hosting..."
    $FIREBASE_CMD deploy "${CONFIG_ARGS[@]}" --only "$HOSTING_ONLY"
    ;;
esac

echo ""
echo "✅ [methodJ] Deployment completed successfully!"
