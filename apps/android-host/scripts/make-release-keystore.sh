#!/usr/bin/env bash
# Create the internal release key used to sign `assembleRelease`, once per machine.
#
# The key is deliberately *not* in version control (`keystore/` is gitignored): anyone
# holding it can sign an APK that Android will accept as an update to an installed
# Midscene. Hand the devices a build signed with this key and keep the file.
#
# Required environment variables:
#   MIDSCENE_KEYSTORE, MIDSCENE_KEYSTORE_PASSWORD, MIDSCENE_KEY_ALIAS, MIDSCENE_KEY_PASSWORD
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
keystore="${MIDSCENE_KEYSTORE:?set MIDSCENE_KEYSTORE}"
password="${MIDSCENE_KEYSTORE_PASSWORD:?set MIDSCENE_KEYSTORE_PASSWORD}"
alias_name="${MIDSCENE_KEY_ALIAS:?set MIDSCENE_KEY_ALIAS}"
key_password="${MIDSCENE_KEY_PASSWORD:?set MIDSCENE_KEY_PASSWORD}"

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
