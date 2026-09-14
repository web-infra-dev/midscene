#!/usr/bin/env bash
# Create the internal release key used to sign `assembleRelease`, once per machine.
#
# The key is deliberately *not* in version control (`keystore/` is gitignored): anyone
# holding it can sign an APK that Android will accept as an update to an installed
# Midscene. Hand the devices a build signed with this key and keep the file.
#
# Overridable, so a team can keep the real key somewhere safer:
#   MIDSCENE_KEYSTORE, MIDSCENE_KEYSTORE_PASSWORD, MIDSCENE_KEY_ALIAS, MIDSCENE_KEY_PASSWORD
set -euo pipefail

cd "$(dirname "$0")/.."
keystore="${MIDSCENE_KEYSTORE:-keystore/midscene-release.jks}"
password="${MIDSCENE_KEYSTORE_PASSWORD:-midscene}"
alias_name="${MIDSCENE_KEY_ALIAS:-midscene}"
key_password="${MIDSCENE_KEY_PASSWORD:-$password}"

if [[ -f "$keystore" ]]; then
  echo "keystore already exists: $keystore"
  exit 0
fi

mkdir -p "$(dirname "$keystore")"
keytool -genkeypair \
  -keystore "$keystore" \
  -storepass "$password" \
  -keypass "$key_password" \
  -alias "$alias_name" \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -dname "CN=Midscene, OU=Android Host, O=Midscene, L=-, ST=-, C=CN" \
  -storetype PKCS12

echo "created $keystore (alias $alias_name)"
