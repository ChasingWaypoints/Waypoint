#!/usr/bin/env bash
# Runs an eas command with Apple credentials loaded from the gitignored
# .secrets/ folder. The repo is public: no key material, no account
# identifiers, nothing Apple-specific belongs in a tracked file.
#
# eas.json therefore holds only ascApiKeyPath — it rejects unknown keys, so
# this is where the explanation lives. Key ID, Issuer ID and Team ID are read
# from .secrets/ids.env and exported as the EXPO_ASC_* variables EAS looks for.
#
#   ./scripts/with-apple-env.sh build --platform ios --profile production
#   ./scripts/with-apple-env.sh submit --platform ios --profile production
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRETS="$ROOT/.secrets"

[ -f "$SECRETS/ids.env" ]        || { echo "missing $SECRETS/ids.env"; exit 1; }
[ -f "$SECRETS/asc-api-key.p8" ] || { echo "missing $SECRETS/asc-api-key.p8"; exit 1; }

set -a; . "$SECRETS/ids.env"; set +a

export EXPO_ASC_API_KEY_PATH="$SECRETS/asc-api-key.p8"
export EXPO_ASC_KEY_ID="$ASC_KEY_ID"
export EXPO_ASC_ISSUER_ID="$ASC_ISSUER_ID"
export EXPO_APPLE_TEAM_ID="$APPLE_TEAM_ID"
# The Apple account is an Organization, which decides how EAS registers the
# distribution certificate and provisioning profile.
export EXPO_APPLE_TEAM_TYPE="COMPANY_OR_ORGANIZATION"
export EXPO_TOKEN="$(tr -d '\n\r ' < "$ROOT/.eas-token")"

cd "$ROOT/mobile"
exec npx eas-cli "$@"
