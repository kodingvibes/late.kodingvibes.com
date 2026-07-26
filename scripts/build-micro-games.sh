#!/usr/bin/env bash
# Build late-micro-games and rsync to /var/www/html/micro/games/vX.Y.Z/
set -euo pipefail

REPO="${REPO:-/root/late-micro-games}"
DEST="/var/www/html/micro/games"

export PATH="/root/.nvm/versions/node/v24.18.0/bin:$PATH"

cd "$REPO"

VERSION=$(node -e "console.log(require('./package.json').version)")
echo "[build-micro-games] version=$VERSION"

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

npm run build

rm -rf "$DEST/v$VERSION"
mkdir -p "$DEST/v$VERSION"
rsync -a --delete dist/ "$DEST/v$VERSION/"

ln -sfn "v$VERSION" "$DEST/latest"
cat > "$DEST/latest.json" << JSON
{"version":"$VERSION","name":"games"}
JSON
