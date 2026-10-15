#!/usr/bin/env bash
# Build the native scroll fixture without Gradle or a checked-in binary.
set -euo pipefail
output_dir="${1:?output directory required}"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Android SDK path required}}"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
fixture_dir=$(cd "$(dirname "$0")/../tests/fixtures/scroll-probe" && pwd)
build_tools=$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
android_jar=$(find "$sdk/platforms" -name android.jar | sort -V | tail -1)
test -f "$android_jar"
cd "$output_dir"

# Pin the AndroidX ViewPager fixture dependencies, including their bytes.
fetch_aar() {
  local artifact="$1" checksum="$2" name="${1##*/}"
  curl --fail --location --retry 3 --silent --show-error \
    "https://dl.google.com/dl/android/maven2/androidx/$artifact/1.0.0/$name-1.0.0.aar" -o "$name.aar"
  printf '%s  %s\n' "$checksum" "$name.aar" | shasum -a 256 --check
  mkdir -p "$name"
  unzip -q -o "$name.aar" -d "$name"
}
fetch_aar viewpager/viewpager 147af4e14a1984010d8f155e5e19d781f03c1d70dfed02a8e0d18428b8fc8682
fetch_aar core/core d7672358fc0d46de678968bcddfd3bdfe1618574299a753477b16116cfec74f5
fetch_aar customview/customview 20e5b8f6526a34595a604f56718da81167c0b40a7a94a57daa355663f2594df2
mkdir -p generated classes
"$build_tools/aapt" package -f -m -J generated -M "$fixture_dir/AndroidManifest.xml" \
  -S core/res -I "$android_jar" --extra-packages androidx.core -F probe.apk
javac -source 8 -target 8 -classpath "$android_jar:viewpager/classes.jar:core/classes.jar:customview/classes.jar" \
  -d classes "$fixture_dir/MainActivity.java" generated/dev/midscene/scrollprobe/R.java generated/androidx/core/R.java
jar cf app-classes.jar -C classes .
"$build_tools/d8" --lib "$android_jar" --output . app-classes.jar viewpager/classes.jar core/classes.jar customview/classes.jar
zip -q probe.apk classes.dex
if [[ ! -f debug.jks ]]; then
  keytool -genkeypair -keystore debug.jks -storepass android -keypass android \
    -alias androiddebugkey -dname 'CN=Android Debug' -keyalg RSA -validity 3650
fi
"$build_tools/apksigner" sign --ks debug.jks --ks-pass pass:android probe.apk
