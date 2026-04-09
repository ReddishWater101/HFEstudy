# Build

## Downloading

Download the latest installer from [GitHub Releases](https://github.com/ReddishWater101/HFEstudy/releases):

- **Windows** — `.exe` installer
- **Mac (Apple Silicon)** — `.dmg` for M1/M2/M3/M4
- **Mac (Intel)** — `.dmg` for older Macs

Your computer may show a security warning since the app is unsigned. On Windows, click **More info > Run anyway**. On Mac, **right-click the app > Open**.

## Building a new release

1. Bump the version in `app/package.json`
2. Run `cd app && npm run release`

This compiles the app, packages installers, and publishes them as a GitHub Release. Defaults to the current platform. Use flags to target specific platforms:

```
npm run release -- --mac    # Mac only (arm64 + x64)
npm run release -- --win    # Windows only
npm run release -- --mac --win  # Both
```

If a release for that version already exists, new assets are uploaded alongside existing ones.

## Build resources

This directory holds platform assets for `electron-builder`:

| File | Purpose | Size |
|---|---|---|
| `icon.icns` | macOS app icon | 1024x1024 |
| `icon.ico` | Windows app icon | multi-resolution (16, 32, 48, 64, 128, 256) |

If icons are missing, `electron-builder` falls back to its default Electron icon.
