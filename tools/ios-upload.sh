#!/usr/bin/env bash
# Archives the iOS app, signs it and uploads it to App Store Connect (it then appears in
# TestFlight), using an App Store Connect API key instead of an Apple Account signed in
# to Xcode or macOS.
#
#   ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx npm run ios:upload
#
# The key is read from $ASC_KEY_PATH, or by default from
# ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8. Keep it outside the repo, and
# revoke it under Users and Access → Integrations if this Mac shouldn't keep access.
set -euo pipefail

TEAM_ID=UB7TUYFHR3
: "${ASC_KEY_ID:?Set ASC_KEY_ID to the Key ID from App Store Connect}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID to the Issuer ID shown above the key list}"
KEY="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
[[ -f "$KEY" ]] || { echo "API key not found: $KEY" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Every upload needs a new build number. Date and time always go up: 261102.1530.
BUILD="$(date +%y%m%d.%H%M)"
AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

cd "$ROOT"
npm run sync

echo "Archiving build $BUILD…"
xcodebuild -quiet -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/App.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD" \
  "${AUTH[@]}" archive

cat > "$OUT/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF

echo "Signing and uploading…"
xcodebuild -quiet -exportArchive -archivePath "$OUT/App.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" "${AUTH[@]}"

echo "Uploaded version $(node -p "require('./package.json').version") build $BUILD."
echo "It appears in App Store Connect → TestFlight once Apple finishes processing (usually 10–30 minutes)."
