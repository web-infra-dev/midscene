#!/bin/bash
# Build MidsceneIME APK from source.
# Requires: Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT), JDK 11+
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$(cd "$SCRIPT_DIR/../bin" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"

# Locate Android SDK
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-""}}"
if [ -z "$SDK" ]; then
  # Common default locations
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "/usr/local/lib/android/sdk"; do
    if [ -d "$candidate" ]; then
      SDK="$candidate"
      break
    fi
  done
fi
if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then
  echo "Error: Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT." >&2
  exit 1
fi

# Find build-tools (prefer newest that contains aapt2)
BUILD_TOOLS_DIR=""
for dir in $(ls -d "$SDK/build-tools"/*/ 2>/dev/null | sort -V -r); do
  if [ -f "$dir/aapt2" ] && [ -f "$dir/d8" ]; then
    BUILD_TOOLS_DIR="$dir"
    break
  fi
done
if [ -z "$BUILD_TOOLS_DIR" ]; then
  echo "Error: No complete Android build-tools found in $SDK/build-tools/" >&2
  exit 1
fi

AAPT2="$BUILD_TOOLS_DIR/aapt2"
D8="$BUILD_TOOLS_DIR/d8"
ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"
APKSIGNER="$BUILD_TOOLS_DIR/apksigner"

# Find android.jar (prefer API 34, then newest)
ANDROID_JAR=""
for api in 34 35 33 32 31 30; do
  if [ -f "$SDK/platforms/android-$api/android.jar" ]; then
    ANDROID_JAR="$SDK/platforms/android-$api/android.jar"
    break
  fi
done
if [ -z "$ANDROID_JAR" ]; then
  # Fallback: find any android.jar
  ANDROID_JAR=$(find "$SDK/platforms" -name "android.jar" 2>/dev/null | sort -V | tail -1)
fi
if [ -z "$ANDROID_JAR" ]; then
  echo "Error: android.jar not found in $SDK/platforms/" >&2
  exit 1
fi

echo "SDK: $SDK"
echo "Build-tools: $BUILD_TOOLS_DIR"
echo "android.jar: $ANDROID_JAR"

# Clean
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/res_compiled" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$BUILD_DIR/gen"

# 1. Compile resources
"$AAPT2" compile --dir "$SCRIPT_DIR/res" -o "$BUILD_DIR/res_compiled/"

# 2. Link resources + manifest
"$AAPT2" link -o "$BUILD_DIR/base.apk" \
  --manifest "$SCRIPT_DIR/AndroidManifest.xml" \
  -I "$ANDROID_JAR" \
  --java "$BUILD_DIR/gen" \
  "$BUILD_DIR"/res_compiled/*.flat

# 3. Compile Java
javac -source 1.8 -target 1.8 -cp "$ANDROID_JAR" \
  -d "$BUILD_DIR/classes" \
  "$BUILD_DIR"/gen/com/midscene/ime/R.java \
  "$SCRIPT_DIR"/src/com/midscene/ime/*.java

# 4. Dex
"$D8" --min-api 26 --output "$BUILD_DIR/dex" \
  $(find "$BUILD_DIR/classes" -name "*.class")

# 5. Package: add dex to base APK
cp "$BUILD_DIR/base.apk" "$BUILD_DIR/unsigned.apk"
(cd "$BUILD_DIR/dex" && zip -j "$BUILD_DIR/unsigned.apk" classes.dex)

# 6. Align
"$ZIPALIGN" -p -f 4 "$BUILD_DIR/unsigned.apk" "$BUILD_DIR/aligned.apk"

# 7. Sign
KEYSTORE="$BUILD_DIR/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storepass android -alias androiddebugkey -keypass android \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Midscene Debug" 2>/dev/null
fi
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass pass:android "$BUILD_DIR/aligned.apk"

# 8. Output
cp "$BUILD_DIR/aligned.apk" "$OUTPUT_DIR/midscene-ime.apk"
echo "Built: $OUTPUT_DIR/midscene-ime.apk ($(wc -c < "$OUTPUT_DIR/midscene-ime.apk") bytes)"
