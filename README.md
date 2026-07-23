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
profile, or `current_scene`, in that order. Preview code can read the effective
parameters through the preview-only virtual module:

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
          "module": "./dist/example.cjs"
        }
      ]
    }
  }
}
```

Opening `/super-preview/preset-example` loads the module's default export. A
declaration may set `"export": "createPreset"` to select a named export instead.
The callback receives the current `projectPath` and `requestUrl`, and returns
only string-valued launch parameters:

```ts
export default async function createPreset({ projectPath, requestUrl }) {
  return {
    launchParams: {
      scene: 'scene-uuid',
      serverPort: '12180',
    },
  };
}
```

The callback runs for every request. Explicit URL query values override preset
values, so `/super-preview/preset-example?scene=other-scene` remains available
for one-off overrides.

If a preset module fails while it is being evaluated, Super Preview asks the
Vortex module loader to clear the declared entry. Dependency cache behavior is
owned by that loader; restart the editor after changing dependencies if stale
code remains.

Like the built-in browser preview, the normal route keeps the project splash but
shortens it to about 50 ms. Open `/super-preview?splashPreview=true` to preserve
the splash duration configured by the project.

## Diagnostics

Server-side preview diagnostics are written as JSON lines under
`<project>/temp/super-preview/logs/YYYY-MM-DD.log`.
