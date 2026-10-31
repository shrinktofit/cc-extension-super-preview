# Super Preview

Super Preview adds a focused browser preview shell alongside the preview bundled
with Cocos Creator. The built-in preview remains available as a
fallback, while Super Preview provides clearer loading and error feedback.

The extension reuses the editor's preview server, generated settings, engine
artifacts, and asset routes. It does not start a second HTTP server or require
project-level configuration.

## Scripts

- `pnpm install`
- `node --run build`
- `node --run test`
- `node --run publish -- --dry-run`

The extension's toolbar uses Vortex UI Elements and the shared editor theme. For local
development, their packages are linked from the adjacent `vortex-collection/vortex`
checkout. Build those packages before building this extension; Vite bundles them into
the extension output, so the installed extension does not need those source paths.

## Usage

The normal browser preview button and shortcut continue to open the built-in
preview. A separate play button with a **SUPER** footnote appears to the right of
the built-in preview controls. That button and **Project > Super Preview** open
the selected preset on the editor preview server, or `/super-preview` for the
default selection.

Two Vortex Select controls appear beside SUPER: presets on the left and scenes on
the right. The preset picker always includes **无预设** (no preset) and searches names
and preset IDs. The scene picker always includes **当前场景** (current scene), followed
by scene assets; search matches names and asset paths. Scene paths appear in the
popup to distinguish identical names. Both pickers use the editor theme and support
keyboard navigation with Enter to confirm and Escape to cancel.

Each selection is remembered separately in the project's local Super Preview user
profile. Changing one does not change or lock the other, open a preview, or evaluate
a preset callback. Current scene remains a live selection of the scene being edited.
Scene assets refresh when the picker opens or the asset database changes. Missing
selected scenes and missing or conflicting presets remain visible as unavailable
until another option is selected.

Press SUPER or use the Project menu to launch. A preset's own scene takes priority;
if it does not provide one, Super Preview uses the right-hand scene selection.
Without a preset it uses that selection directly. The built-in preview's scene
selection and profile are independent of Super Preview.

The QR button beside the scene picker shares the same complete URL as SUPER.
Its popup displays a scannable code and a copy button. Opening it does not launch
preview or evaluate a preset; the callback runs when the link is visited. The
popup refreshes when the preset, scene selection, preview IP, or port changes.
Click outside, press Escape, or click the QR button again to dismiss it.

URL parameters starting with `--` select Super Preview options. All other URL
parameters pass to the game with their original names and string values,
overriding matching preset `launchParams`. For example:

```text
/super-preview/presets/example?--scene=scene-uuid&serverPort=12500&scene=lobby
```

This loads `scene-uuid` and gives the game `serverPort: '12500'` and
`scene: 'lobby'`. Preview options stay in the shell's internal configuration.
The launch scene comes from URL `--scene`, the preset's top-level `scene`,
Super Preview's saved scene selection, or `current_scene`, in that order. Game code can
read its effective launch parameters through the preview-only virtual module:

```ts
const { launchParams } = await import('super-preview');
```

The module is available to both the current Cocos SystemJS pipeline and native
browser ESM. Super Preview does not publish a browser global. TypeScript callers
should add the following declaration to a `.d.ts` file already included by their
project's `tsconfig.json`:

```ts
declare module 'super-preview' {
  export const launchParams: Readonly<Record<string, string>>;
}
```

## Presets

An extension can contribute a request-time preset:

```json
{
  "contributions": {
    "super-preview": {
      "presets": [
        {
          "id": "example",
          "label": "Local development",
          "description": "Connect to the local development server",
          "module": "./dist/example.cjs"
        }
      ]
    }
  }
}
```

Opening `/super-preview/presets/example` loads the module's default export. A
declaration may set `"export": "createPreset"` to select a named export instead.
The callback receives the current `projectPath` and `requestUrl`, and returns
a Super Preview scene beside string-valued launch parameters:

```ts
export default async function createPreset({ projectPath, requestUrl }) {
  return {
    scene: 'scene-uuid',
    launchParams: {
      serverPort: '12180',
    },
  };
}
```

`label` and `description` are optional static menu metadata. Without `label`, the
picker displays the preset ID. Listing presets never loads their modules; only
requesting a preset preview evaluates its callback. Changing the toolbar selection
does not change existing preview URLs or browser tabs.

The callback runs for every request. The sibling `scene` is a Super Preview
control field. An explicit `?--scene=other-scene` overrides it for that request,
but is not exposed through the `super-preview` runtime module. Every key inside
`launchParams`, including an application-defined `scene`, is passed through
without controlling the preview scene or logging. For example,
`?serverPort=12500` overrides `launchParams.serverPort`.

Supported preview options:

| Parameter | Behavior | Default |
| --- | --- | --- |
| `--scene` | Launch scene UUID or `current_scene` | Preset, Super Preview scene selection, then `current_scene` |
| `--splashPreview` | Preserve the project's splash duration | `false` |
| `--debug` | Enable engine INFO logging (`false` selects NONE) | `true` |
| `--superPreviewDebug` | Enable preview diagnostic console logging | localStorage `super-preview.debug === '1'` |

Boolean options require the exact value `true` or `false`; empty values and
other spellings return HTTP 400. Explicit `--superPreviewDebug=false` overrides
the localStorage switch. Unknown `--` options also return a descriptive HTTP
400 error before evaluating the preset.

Repeated parameters use their last value. Every supplied boolean value must
be valid, even if a later occurrence overrides it. Business values, including
empty strings, are preserved as strings. A missing or whitespace-only
`--scene` uses the next scene default; nonempty scene options are trimmed.

If a preset module fails while it is being evaluated, Super Preview asks the
editor module loader to clear the declared entry. Dependency cache behavior is
owned by that loader; restart the editor after changing dependencies if stale
code remains.

Like the built-in browser preview, the normal route keeps the project splash but
shortens it to about 50 ms. Open `/super-preview?--splashPreview=true` to preserve
the splash duration configured by the project.

## URL migration

As of 0.0.6, preset URLs use `/super-preview/presets/:id`. Replace existing
`/super-preview/preset-example` links with `/super-preview/presets/example`.
The old preset route is no longer served; `/super-preview` remains unchanged.

This changes the URL parameter namespace directly. Update existing links:

| Previous URL parameter | New URL parameter |
| --- | --- |
| `--serverPort=12500` (game parameter) | `serverPort=12500` |
| `scene=scene-uuid` (preview scene) | `--scene=scene-uuid` |
| `splashPreview=true` | `--splashPreview=true` |
| `--debug=false` (formerly consumed from launch params) | `--debug=false` (now an internal preview option) |
| `--superPreviewDebug=` | `--superPreviewDebug=true` |

Preset top-level `scene` and the `launchParams` object retain their structure.
Game parameters named `scene`, `debug`, `superPreviewDebug`, or `splashPreview`
no longer control the shell. There is no legacy format detection. Cocos's
internal `/settings.js` request continues to use its own `scene` and
`splashPreview` parameter names.

## Diagnostics

Server-side preview diagnostics are written as JSON lines under
`<project>/temp/super-preview/logs/YYYY-MM-DD.log`.
