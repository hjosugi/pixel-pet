# Release builds

Pixel Pet is still a local prototype, so release builds are unsigned by default.
The release workflow uploads generated bundles as GitHub Actions artifacts
instead of committing installer output.
Updater artifacts are generated when the Tauri updater signing key is available
to the build environment.

## Local prerequisites

All platforms:

```txt
Node.js 24
Rust stable
npm dependencies from package-lock.json
Tauri v2 system prerequisites for the target OS
```

Linux additionally needs WebKitGTK and tray/appindicator packages. On Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libwebkit2gtk-4.1-dev \
  patchelf
```

Build locally:

```bash
npm ci
npm run assets:check
npm run tauri:build
```

For CI-style unsigned prototype bundles:

```bash
npm run tauri -- build --ci --no-sign
```

## GitHub release workflow

`.github/workflows/release.yml` runs on tags matching `v*` and by manual
dispatch. It builds on:

```txt
ubuntu-latest
macos-latest
windows-latest
```

Artifacts are uploaded from:

```txt
src-tauri/target/release/bundle/**/*
```

`src-tauri/target` is ignored by git, so generated installers and app bundles
stay out of source control.

## Updater artifacts

The app checks the latest GitHub Release for `latest.json`. See
`docs/UPDATER.md` for the signing key, updater artifact, and manifest
publishing flow.

GitHub Actions needs this repository secret to produce signed updater artifacts:

```txt
TAURI_SIGNING_PRIVATE_KEY
```

If the key has a password, also set:

```txt
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

## Platform caveats

Windows:

- Builds are unsigned for now.
- SmartScreen warnings are expected until Authenticode signing is configured.
- WebView2 runtime availability still needs a distribution decision before a
  public release.

macOS:

- This prototype uses `macOSPrivateApi` for transparent windows.
- Unsigned `.app` or `.dmg` output may be blocked by Gatekeeper.
- App Store distribution is not compatible with the current transparency
  approach.
- Notarization and hardened runtime are intentionally deferred.

Linux:

- Bundle output depends on the host packages available in the build image.
- AppImage/deb/rpm behavior should be tested on real desktops before publishing.
- Tray behavior varies by desktop environment.

## Signing path

Later production releases should add:

```txt
Windows: Authenticode or Azure Trusted Signing
macOS: Developer ID signing, hardened runtime, notarization, stapling
Linux: checksum/signature files for uploaded artifacts
```

Signing keys, certificates, API tokens, and notarization credentials must live
in GitHub Actions secrets or the local developer keychain. They must not be
committed.
