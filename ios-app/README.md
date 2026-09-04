# Study Hub — iPad app shell

A native iPad app that opens **https://natashastudy.netlify.app**.

The website stays the source of truth. This project does not contain a copy of
the app, the courses or the questions — it is a window onto the live site, so
anything deployed to Netlify appears here on the next launch with no rebuild
and nothing to keep in sync.

The Home Screen install (Safari → Share → Add to Home Screen) gives nearly the
same result for free. Build this when you want it installable *as an app* —
from Xcode, from a TestFlight link, or eventually from the App Store.

## What is already configured

| | |
|---|---|
| Bundle identifier | `com.natashahenry.studyhub` |
| App name under the icon | Study Hub |
| Loads | `https://natashastudy.netlify.app` |
| Minimum iPadOS | 15.0 |
| Orientation | all four, on iPad |
| Split View / Stage Manager | supported (`UIRequiresFullScreen` = false) |
| Dependencies | Swift Package Manager — **no CocoaPods, no Ruby** |

Two details that are easy to get wrong and are already handled:

- **The launch screen is pinned to `#dfe6fb`**, the colour the app actually
  paints. The Capacitor default is `systemBackgroundColor`, which is *black* in
  dark mode, so a dark-mode iPad would flash black before the light app.
- **`WKAppBoundDomains` is set** to the site's domain. Without it a WKWebView
  refuses to run service workers, which is what makes the app work offline.

## Building it on the Mac

1. Copy this `ios-app` folder to the Mac (or clone the repo there).
2. In Terminal, inside `ios-app`:

       npm install
       npx cap sync ios
       npx cap open ios

   The last command opens Xcode. Package resolution happens automatically the
   first time and takes a minute.

3. In Xcode, select the **App** target → **Signing & Capabilities**:
   - tick *Automatically manage signing*
   - choose your Apple ID under *Team* (add it in Xcode → Settings → Accounts)

4. Plug the iPad in, pick it from the device menu at the top, press **Run** (▶).

5. On the iPad the first launch is blocked until you trust the certificate:
   **Settings → General → VPN & Device Management → your Apple ID → Trust**.

## How long it stays installed

| Account | Cost | App keeps working for |
|---|---|---|
| Free Apple ID | £0 | **7 days**, then rebuild from Xcode |
| Apple Developer Program | $99/year | **1 year** |

With the paid account you can also push a build to **TestFlight**, which makes
it genuinely downloadable — install it from a link, no cable, no Xcode.

## About the App Store

App Review guideline 4.2.2 asks apps to be more than a repackaged website, and
this project is deliberately a window onto one. It may well be rejected, and
that is worth knowing before paying the $99 for that reason alone. The paid
account is still worth it for the 1-year install and TestFlight.

## Changing the site it points at

`capacitor.config.json` → `server.url`, then `npx cap sync ios`. If you ever
want the app to carry its own offline copy instead of loading the site, remove
the `server` block and copy the site into `www/` — but then it stops tracking
Netlify, which is the opposite of how it is set up today.
