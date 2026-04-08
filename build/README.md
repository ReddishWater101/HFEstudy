# Build resources

This directory holds platform assets that `electron-builder` consumes when packaging.

Add the following before cutting your first release:

| File | Purpose | Size |
|---|---|---|
| `icon.icns` | macOS app icon | 1024×1024 |
| `icon.ico` | Windows app icon | multi-resolution (16, 32, 48, 64, 128, 256) |

If these are missing, `electron-builder` falls back to its default icon and unsigned packaging will still work — but the resulting binaries will look generic.
