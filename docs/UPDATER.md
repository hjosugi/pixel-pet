# Updater

Pixel Pet uses the Tauri v2 updater plugin. Updates are opt-in from the pet
settings panel with the `upd` button.

## Security model

Tauri updater packages must be signed. The public key is committed in
`src-tauri/tauri.conf.json`; the private key must stay out of git.

The current local private key path is:

```bash
.tauri/updater.key
```

If this key is lost, already-installed apps will not be able to trust future
updates. Back it up in a password manager or secret store before shipping to
users.

For GitHub Actions builds, store the key content as the repository secret:

```txt
TAURI_SIGNING_PRIVATE_KEY
```

If a password-protected key is used later, also set:

```txt
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

## Build signed update artifacts

Local Linux/macOS:

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH=.tauri/updater.key
npm run tauri:build
```

GitHub Actions uses `TAURI_SIGNING_PRIVATE_KEY` from repository secrets.

With `bundle.createUpdaterArtifacts` enabled, Tauri generates updater artifacts
and `.sig` files next to the normal bundles.

## Publish manifest

The app checks:

```txt
https://github.com/hjosugi/pixel-pet/releases/latest/download/latest.json
```

Create `latest.json` from uploaded updater artifacts and signatures:

```bash
npm run updater:manifest -- \
  --version 0.2.1 \
  --out latest.json \
  --notes "Pixel Pet 0.2.1" \
  --platform linux-x86_64=https://github.com/hjosugi/pixel-pet/releases/download/v0.2.1/Pixel.Pet.AppImage.tar.gz,path/to/Pixel.Pet.AppImage.tar.gz.sig
```

Repeat `--platform` for each target you attach to the GitHub Release. Upload
`latest.json` to the same release. The `latest` release must point at the newest
stable version so the endpoint resolves correctly.

## Runtime behavior

- Browser preview shows `desktop only`.
- Desktop checks the configured endpoint on demand.
- If an update is available, the user confirms before download/install.
- After install, the app relaunches through the Tauri process plugin.
