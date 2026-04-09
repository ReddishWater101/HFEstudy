# Build

## Downloading

Download the latest installer from [GitHub Releases](https://github.com/ReddishWater101/HFEstudy/releases). Run the `.exe` to install or update.

## Building a new release

1. Bump the version in `app/package.json`
2. Run `cd app && npm run release`

This compiles the app, packages a Windows installer, and publishes it as a GitHub Release. The old release is replaced automatically.

## Build resources

This directory also holds platform assets for `electron-builder`:

| File | Purpose | Size |
|---|---|---|
| `icon.icns` | macOS app icon | 1024x1024 |
| `icon.ico` | Windows app icon | multi-resolution (16, 32, 48, 64, 128, 256) |

If icons are missing, `electron-builder` falls back to its default Electron icon.
