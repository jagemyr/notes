#!/usr/bin/env bash
#
# Bygger Te som Android-app (APK) utan Gradle och utan Android Studio, med paket från
# Ubuntu (testat på 24.04):
#
#   sudo apt-get install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner default-jdk-headless
#
# Webbappen i te/ kopieras in som den är, så appen har alltid samma version som pluginet.
# versionName tas från VERSION i te/te.js och versionCode räknas fram ur den (1.11.0 → 11100).
#
# Appen signeras med din egen nyckel. Samma nyckel måste användas vid varje uppdatering,
# annars vägrar telefonen installera över den gamla appen. Skapa nyckeln en gång:
#
#   keytool -genkeypair -keystore te-release.jks -alias te -keyalg RSA -keysize 3072 -validity 10000
#
# och bygg sedan:
#
#   TE_KEYSTORE=/sökväg/te-release.jks TE_KEYSTORE_PASS=lösenord apk/build.sh
#
# Resultatet hamnar i apk/build/te-<version>.apk. Nyckeln ska aldrig ligga i repot.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
BUILD="$HERE/build"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
DX="$(command -v dalvik-exchange || command -v dx || true)"

: "${TE_KEYSTORE:?Ange nyckelfilen i TE_KEYSTORE (se början av build.sh)}"
: "${TE_KEYSTORE_PASS:?Ange nyckelns lösenord i TE_KEYSTORE_PASS}"
[ -f "$ANDROID_JAR" ] || { echo "Hittar inte $ANDROID_JAR (paketet android-sdk-platform-23)" >&2; exit 1; }
[ -n "$DX" ] || { echo "Hittar inte dx (paketet dalvik-exchange)" >&2; exit 1; }

VERSION="$(sed -n "s/^ *var VERSION = '\([0-9]*\.[0-9]*\.[0-9]*\)';.*/\1/p" "$REPO/te/te.js")"
[ -n "$VERSION" ] || { echo "Hittar inte VERSION i te/te.js" >&2; exit 1; }
IFS=. read -r MAJOR MINOR PATCH <<< "$VERSION"
CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))
echo "Te $VERSION (versionCode $CODE)"

rm -rf "$BUILD"
mkdir -p "$BUILD/assets/te" "$BUILD/classes"

# Webbappen, som den publiceras på GitHub Pages. ?v= behövs bara mot webbläsarens cache,
# så det tas bort: i appen läses filerna direkt ur paketet.
cp -R "$REPO/te/." "$BUILD/assets/te/"
sed -i 's/?v=[0-9.]*//g' "$BUILD/assets/te/index.html"

# Java → class → dex. Ingen R-klass behövs: koden använder inga resurser.
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -nowarn \
  -bootclasspath "$ANDROID_JAR" -d "$BUILD/classes" \
  $(find "$HERE/src" -name '*.java')
"$DX" --dex --min-sdk-version=23 --output="$BUILD/classes.dex" "$BUILD/classes"

# Manifest, resurser och webbappen i ett paket, sedan koden.
aapt package -f \
  -M "$HERE/AndroidManifest.xml" -S "$HERE/res" -A "$BUILD/assets" -I "$ANDROID_JAR" \
  --version-code "$CODE" --version-name "$VERSION" --replace-version --error-on-failed-insert \
  -F "$BUILD/te-unsigned.apk"
(cd "$BUILD" && aapt add te-unsigned.apk classes.dex >/dev/null)

zipalign -f -p 4 "$BUILD/te-unsigned.apk" "$BUILD/te-aligned.apk"
apksigner sign --ks "$TE_KEYSTORE" --ks-pass env:TE_KEYSTORE_PASS \
  --out "$BUILD/te-$VERSION.apk" "$BUILD/te-aligned.apk"
apksigner verify --print-certs "$BUILD/te-$VERSION.apk" | sed -n '1,2p'
rm -f "$BUILD/te-unsigned.apk" "$BUILD/te-aligned.apk" "$BUILD/te-$VERSION.apk.idsig"

echo "Klar: $BUILD/te-$VERSION.apk"
