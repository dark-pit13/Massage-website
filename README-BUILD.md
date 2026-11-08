# Appointments — Android app

This builds an `.apk` you tap to install on your Android phone. The app is a
locked-down shell around `https://YOUR-DOMAIN/appointments-app.php`: it shows
that one page, keeps you signed in between launches, hands `tel:` and `mailto:`
links to your dialler and mail app, and refuses to load anything else.

**The website files must be uploaded and working first.** The app is a window
onto your site, not a copy of it. Open the page in your phone's browser and
sign in once before you build.

---

## Before anything else: you may not need this

Your site is already installable without an `.apk`. On the phone, open
`https://YOUR-DOMAIN/appointments-app.php`, then:

- **Android / Chrome:** menu (⋮) → *Install app* or *Add to Home screen*
- **iPhone / Safari:** Share → *Add to Home Screen*

You get the same icon, the same full-screen app, no build and no "unknown
sources" warning — and it updates itself whenever the site changes. The `.apk`
below exists for when you want a real installable package instead.

An `.apk` is Android only. There is no equivalent for iPhone without a paid
Apple developer account.

---

## Route 1 — GitHub builds it for you (nothing to install, works today)

Free, takes about five minutes of your time plus five of waiting, and needs no
Android tools and no live website.

1. Make a free account at [github.com](https://github.com) if you have none.
2. Create a new repository — any name, **Private** is fine.
3. Upload the contents of this `AppointmentsApp` folder into it, so that
   `gradlew`, `settings.gradle` and the `app` folder sit at the top level of
   the repository, not inside another folder. On the repository page use
   *Add file → Upload files* and drag everything in, including the hidden
   `.github` folder. If your computer hides dotted folders, drag the whole
   `AppointmentsApp` folder in and then use GitHub's own file editor to move
   things up, or use GitHub Desktop, which keeps the layout as it is.
4. Open the **Actions** tab. GitHub will ask you to enable workflows for the
   repository — say yes.
5. Choose **Build the APK** on the left, then **Run workflow** on the right.
   Type your address, for example
   `https://your-domain.com/appointments-app.php`, and press the green button.
6. Wait for the green tick, roughly four to six minutes. Open the finished run
   and download **appointments-apk** at the bottom. Inside is
   `app-debug.apk`.
7. Copy it to your phone and follow *Installing on your phone* below.

To change the address later, run the workflow again with a different one. You
never have to edit a file.

## Route 2 — PWABuilder (needs the website live first)

[PWABuilder](https://www.pwabuilder.com) turns a live site into an Android
package in a browser.

1. Upload the website files and check the page loads over `https`.
2. Go to pwabuilder.com and enter
   `https://YOUR-DOMAIN/appointments-app.php`.
3. Choose **Android** → **Generate Package**.
4. Pick **"Signed APK"** when offered, and keep the signing key file it gives
   you somewhere safe — you need the same key to publish any future update.
5. Download the zip, copy the `.apk` to your phone, and follow *Installing on
   your phone* below.

PWABuilder reads the `appointments-app.webmanifest` already on your site, so
the name, icon and colours come out right with nothing to configure.

A package built this way runs as a Trusted Web Activity. It needs a file at
`https://YOUR-DOMAIN/.well-known/assetlinks.json` containing the fingerprint
PWABuilder shows you — without it the app still works but shows a browser
address bar across the top. PWABuilder gives you that file; upload it.

---

## Route 3 — build this project yourself

This folder is a complete Android Studio project. Nothing is missing except
your domain.

### What you need

- **Android Studio** (free, Windows/Mac/Linux) — it brings its own Java and
  Android SDK. Or, without Android Studio: JDK 17 and the Android command-line
  tools with SDK Platform 34 and Build-Tools 34.
- An internet connection for the first build, which downloads the Android
  Gradle Plugin.

### Step 1 — set your address

Open `app/src/main/res/values/strings.xml` and change this one line:

```xml
<string name="app_url" translatable="false">https://YOUR-DOMAIN/appointments-app.php</string>
```

It must be `https`. The app refuses plain `http` by design, since it carries
customer contact details.

Optionally change the name under the icon on the same screen (`app_name`).

### Step 2 — build

**In Android Studio:** *File → Open*, choose this folder, wait for it to sync,
then *Build → Build Bundle(s) / APK(s) → Build APK(s)*. It shows you a link to
the file when it finishes.

**From a terminal:**

```bash
./gradlew assembleDebug
```

The APK lands at:

```
app/build/outputs/apk/debug/app-debug.apk
```

A debug APK is signed automatically and installs on your own phone perfectly
well. Use it unless you plan to put the app on Google Play.

### Step 3 (optional) — a signed release build

Only needed for Google Play, or if you want a build without the `.debug`
suffix.

Create a key once, and never lose it — updates must be signed with the same
one:

```bash
keytool -genkeypair -v -keystore appointments-release.jks \
  -alias appointments -keyalg RSA -keysize 4096 -validity 10000
```

Then fill in the four `APPOINTMENTS_*` lines in `gradle.properties` (they are
there, commented out) and run:

```bash
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`.

Keep `appointments-release.jks` and its passwords out of this folder if you
ever share the project.

---

## Installing on your phone

1. Copy the `.apk` to the phone — USB cable, Google Drive, or email it to
   yourself.
2. Tap it in the Files app.
3. Android will say it cannot install from this source. Tap **Settings**,
   switch on **Allow from this source**, then go back and tap **Install**.
   This is normal for any app that did not come from the Play Store.
4. Open it and sign in with your manager password.

With a cable and the Android tools installed you can instead run:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## How it behaves

- **Staying signed in.** The session cookie is kept between launches, but the
  server still ends a session after 30 minutes of inactivity, so you will be
  asked for the password again now and then. That is the website's rule, not
  the app's.
- **Back button.** Goes back through the app; on the first screen it closes.
- **Calling and emailing.** Tapping a customer's number opens your dialler with
  it filled in; email opens your mail app.
- **Other links.** Anything outside your domain opens in your normal browser,
  not inside the app.
- **No connection.** You get a plain "No connection" screen with a *Try again*
  button. The app does not queue changes made offline.
- **Nothing is backed up.** The sign-in cookie never leaves the phone and is
  not copied to a new device.

## Updating the app

Changes to the website appear in the app straight away — it loads the live
page, so there is nothing to rebuild.

Rebuild the APK only when you change something in this project, such as the
name or icon. Raise `versionCode` in `app/build.gradle` before you do, or the
phone will refuse to install over the existing copy.

## What is in here

```
.github/workflows/build-apk.yml                    cloud build, Route 1
settings.gradle, build.gradle, gradle.properties   Gradle setup
gradlew, gradlew.bat, gradle/wrapper/              build without installing Gradle
app/build.gradle                                   app build and signing config
app/src/main/AndroidManifest.xml                   permissions and the one activity
app/src/main/java/.../MainActivity.java            the WebView shell
app/src/main/res/values/strings.xml                >>> your domain goes here <<<
app/src/main/res/values/colors.xml, themes.xml     brand colours
app/src/main/res/layout/activity_main.xml          WebView plus the offline screen
app/src/main/res/mipmap-*/                         launcher icons
app/src/main/res/xml/                              https-only and backup rules
```

There are no third-party dependencies: the app uses only Android's own WebView.
