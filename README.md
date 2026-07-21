# Super Preview

Super Preview adds a focused browser preview shell alongside the preview bundled
with Cocos Creator and Vortex. The built-in preview remains available as a
fallback, while Super Preview provides clearer loading and error feedback.

The extension reuses the editor's preview server, generated settings, engine
artifacts, and asset routes. It does not start a second HTTP server or require
project-level configuration.

## Scripts

- `pnpm install`
- `node --run build`
- `node --run test`
- `node --run publish -- --dry-run`

## Usage

The normal browser preview button and shortcut continue to open the built-in
preview. A separate play button with a **SUPER** footnote appears to the right of
the built-in preview controls. That button and **Project > Super Preview** open
the stable `/super-preview` route on the editor preview server.

Super Preview shares the built-in scene selector. Selecting a scene there affects
both preview entry points without replacing the built-in preview page.

The launch scene comes from the `scene` query parameter, the editor's preview
profile, or `current_scene`, in that order. Other URL parameters remain available
to the game through `window.location.search`.

Like the built-in browser preview, the normal route keeps the project splash but
shortens it to about 50 ms. Open `/super-preview?splashPreview=true` to preserve
the splash duration configured by the project.

## Diagnostics

Server-side preview diagnostics are written as JSON lines under
`<project>/temp/super-preview/logs/YYYY-MM-DD.log`.
