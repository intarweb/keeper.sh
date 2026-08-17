# Keeper mobile assets

The app icon and splash marks are derived from Keeper's canonical web artwork in
`applications/web/public`. Provider marks are exact copies of the integration
artwork used by the web app so provider identity stays consistent across clients.

- `icon.png` is an opaque 1024×1024 App Store icon with the Keeper mark inset in
  the mobile safe area.
- `adaptive-icon.png` is a transparent Android adaptive foreground with the
  Keeper mark centered inside the platform mask-safe zone. Its background is
  supplied separately by `android.adaptiveIcon.backgroundColor`.
- `splash-icon*.png` preserve the light and dark Keeper marks.
- `providers/` contains the canonical provider artwork; do not recolor it.
