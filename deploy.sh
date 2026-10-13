#!/usr/bin/env bash

# Stop immediately on error
set -e

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [OPTION]

Type-checks the project, builds it, then deploys to Firebase.

Options:
  (none)           Deploy Hosting only
  --rules, rules   Deploy Firestore rules only
  --storage        Deploy Cloud Storage rules only (card images)
  --functions      Deploy the nightly backup Cloud Function only
  --all, all       Deploy Hosting + Firestore rules (not the function)
  -h, --help       Show this help

Examples:
  ./deploy.sh
  ./deploy.sh --rules
  ./deploy.sh --all

Via npm:
  npm run deploy
  npm run deploy:all
EOF
}

# Help: handled before any costly command (lint/build)
case "$1" in
  -h|--help|help)
    usage
    exit 0
    ;;
  ""|--all|all|--rules|rules|--functions|functions|--storage|storage)
    ;;
  *)
    echo "❌ Unknown option: $1" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac

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

# Default: Hosting only
# '--all' or 'all' option: Hosting + Firestore rules
# '--rules' or 'rules' option: Firestore rules only
if [ "$1" = "--all" ] || [ "$1" = "all" ]; then
  echo "🚀 [3/3] Firebase deployment (Hosting + Firestore rules)..."
  $FIREBASE_CMD deploy --only hosting,firestore
elif [ "$1" = "--functions" ] || [ "$1" = "functions" ]; then
  echo "🚀 [3/3] Deploying the backup Cloud Function..."
  $FIREBASE_CMD deploy --only functions
elif [ "$1" = "--storage" ] || [ "$1" = "storage" ]; then
  echo "🚀 [3/3] Deploying Cloud Storage rules..."
  $FIREBASE_CMD deploy --only storage
elif [ "$1" = "--rules" ] || [ "$1" = "rules" ]; then
  echo "🚀 [3/3] Deploying Firestore rules..."
  $FIREBASE_CMD deploy --only firestore:rules
else
  echo "🚀 [3/3] Deploying to Firebase Hosting..."
  $FIREBASE_CMD deploy --only hosting
fi

echo ""
echo "✅ [methodJ] Deployment completed successfully!"