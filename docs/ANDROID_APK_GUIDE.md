# Building MathFlow as an Android APK

MathFlow is architected so that the exact same TypeScript/React math engine, offline graph visualizer, and UI can run both as an installable **Progressive Web App (PWA)** and as a **native Android APK** packaged through [Capacitor](https://capacitorjs.com/).

The native Android project is checked in under the [`android/`](../android) directory with full asset synchronization and Gradle scaffolding.

---

## Why Isn't the `.apk` Binary in Git Directly?

1. **Platform Sandboxing**: Generating a compiled `.apk` binary requires:
   - Java Development Kit (JDK 17 or 21)
   - Android SDK Command-Line Tools & Platforms (`platforms;android-35`, `build-tools;35.0.0`)
   - Gradle (included via Wrapper `gradle-8.11.1`)
   - Google maven repositories (`dl.google.com`, `services.gradle.org`)
   The isolated sandbox environment only permits outbound connections to package repositories (`github.com`, `npmjs.org`, `pypi.org`).
2. **Binary Best Practices**: Git repositories track source code, assets, and build manifests; compiled binary APK artifacts belong in GitHub Actions artifacts or releases.

---

## 3 Ways to Produce the `.apk` File

### Option A — 1-Click via GitHub Actions (Recommended)

A complete workflow is already configured at [`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml).

1. Push your branch to GitHub (`git push origin <your-branch>`).
2. Open your repository on GitHub and click the **Actions** tab.
3. Select **"Build MathFlow Android APK"** and trigger it via **"Run workflow"** (or let it run on push).
4. When finished (typically 2–3 minutes), scroll to the **Artifacts** section at the bottom of the run summary.
5. Download **`mathflow-debug-apk`**, unzip it, and you will have `app-debug.apk` ready to install on any Android phone.

---

### Option B — Locally with Android Studio (Visual GUI)

1. Clone the repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd Android
   npm install
   npm run build
   npx cap sync android
   ```
2. Open the project in Android Studio:
   ```bash
   npx cap open android
   # or launch Android Studio manually and open the "android/" folder
   ```
3. Wait for Gradle sync to finish.
4. Go to **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.
5. Android Studio will notify you when complete with a link to `app-debug.apk` (located at `android/app/build/outputs/apk/debug/app-debug.apk`).
6. To run it immediately on a connected phone or emulator, click the green **Run ▶** button.

---

### Option C — Locally from the Command Line (Headless Gradle)

Prerequisites: JDK 21 installed and `ANDROID_HOME` pointing to your Android SDK.

```bash
# 1. Build web bundle and sync native assets
npm install
npm run build
npx cap sync android

# 2. Compile debug APK using the included Gradle wrapper
cd android
./gradlew assembleDebug

# Output APK path:
# android/app/build/outputs/apk/debug/app-debug.apk
```

For an optimized, signed release APK:
```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release-unsigned.apk
```
Then align and sign using your keystore:
```bash
zipalign -v -p 4 app-release-unsigned.apk MathFlow.apk
apksigner sign --ks mathflow-release.keystore MathFlow.apk
```

---

## How It Functions Compared to the Web / Standard Version

| Feature / Behavior | Web PWA | Native Android APK |
|---|---|---|
| **Local Math Engine** | ✅ 100% offline BigInt engine | ✅ 100% offline (bundled inside APK `assets/public/`) |
| **Interactive Graph** | ✅ Canvas, pan & zoom | ✅ Fully functional via hardware-accelerated WebView |
| **History & Settings** | ✅ `localStorage` | ✅ Persisted in Android WebView app storage sandbox |
| **Camera Capture** | ✅ HTML5 `getUserMedia` | ✅ Native Android Camera permission via `BridgeWebChromeClient` |
| **File / Photo Upload** | ✅ `<input type="file">` | ✅ Native Android system file / photo picker |
| **OCR Math Recognition** | ⚠️ Needs server proxy & internet | ⚠️ Needs backend proxy & internet (same security model) |
| **App Icon & Splash** | Dynamic PWA manifest | Native adaptive icons (`mipmap`) and splash theme |
| **Offline First Launch** | Requires 1st visit to cache SW | ✅ Works immediately on fresh install with zero data |

### Important Note on Camera & OCR in the APK
- **Camera Permissions**: The `android/app/src/main/AndroidManifest.xml` includes `<uses-permission android:name="android.permission.INTERNET" />`. When tapping the camera scanner in the APK, Capacitor automatically requests the runtime `CAMERA` permission prompt standard on Android 6.0+.
- **OCR Backend Endpoint**: In the local web version, `/api/ocr` hits the co-located Express server. For the APK, point the OCR backend URL in settings or environment to your deployed MathFlow server (e.g. `https://your-mathflow.com/api/ocr`), keeping your upstream Mathpix API keys protected server-side without embedding secrets in the client APK.
