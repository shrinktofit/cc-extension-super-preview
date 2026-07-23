import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response } from 'express';

interface ResponseState {
  body?: unknown;
  contentType?: string;
  headers: Record<string, string>;
  statusCode?: number;
}

const messageRequest = vi.fn();
const messageSend = vi.fn();
const profileGetConfig = vi.fn();
const moduleRemoveCache = vi.fn();
const moduleRequireFile = vi.fn();
const broadcastListeners = new Map<string, Set<(...args: unknown[]) => void>>();
const enabledPresetPackages: Editor.Interface.PackageInfo[] = [];

const addBroadcastListener = vi.fn((name: string, listener: (...args: unknown[]) => void) => {
  const listeners = broadcastListeners.get(name) ?? new Set();
  listeners.add(listener);
  broadcastListeners.set(name, listeners);
});

const removeBroadcastListener = vi.fn((name: string, listener: (...args: unknown[]) => void) => {
  broadcastListeners.get(name)?.delete(listener);
});

vi.stubGlobal('Editor', {
  Message: {
    __protected__: {
      addBroadcastListener,
      removeBroadcastListener,
    },
    request: messageRequest,
    send: messageSend,
  },
  Module: {
    removeCache: moduleRemoveCache,
    requireFile: moduleRequireFile,
  },
  Profile: {
    getConfig: profileGetConfig,
  },
  Project: {
    path: '',
  },
});

const { get } = await import('../src/contributions/server/index.js');
const toolbar = await import('../src/contributions/toolbar/index.js');
const {
  contributions: presetContributions,
  methods,
  unload,
} = await import('../src/main.js');

describe('Super Preview extension surfaces', () => {
  beforeEach(() => {
    broadcastListeners.clear();
    addBroadcastListener.mockClear();
    removeBroadcastListener.mockClear();
    messageRequest.mockReset();
    messageSend.mockReset();
    moduleRemoveCache.mockReset();
    moduleRequireFile.mockReset();
    profileGetConfig.mockReset();
    installDefaultEditorResponses();
  });

  afterEach(() => {
    for (const packageInfo of enabledPresetPackages.splice(0)) {
      presetContributions.disable(packageInfo);
    }
  });

  it('keeps the built-in root route available and renders only the stable route', async () => {
    /// @case
    /// 1. The built-in preview server owns the root route.
    /// 2. The user opens the stable Super Preview route with an explicit scene.
    /// @expect
    /// Super Preview does not register the root route and renders its shell without signaling built-in readiness.
    expect(get.some((entry) => entry.url === '/')).toBe(false);

    const { response, state } = createResponse();
    await invokeStringRoute(
      '/super-preview',
      createRequest('/super-preview?scene=request-scene-uuid&splashPreview=true'),
      response,
    );

    expect(state.statusCode).toBe(200);
    expect(state.contentType).toBe('text/html; charset=utf-8');
    expect(state.body).toEqual(expect.stringContaining('<title>Super Preview</title>'));
    expect(state.body).toEqual(expect.stringContaining('id="super-preview-shell"'));
    expect(state.body).toEqual(expect.stringContaining('/settings.js?scene=request-scene-uuid'));
    expect(state.body).toEqual(expect.stringContaining('splashPreview=true'));
    expect(state.body).toEqual(expect.stringContaining(
      'https://preview.test/scripting/engine/cache/dev/preview/bundled/index.js',
    ));
    const config = readEmbeddedConfig(String(state.body));
    expect(config).toMatchObject({
      boot: {
        previewServerUrl: 'https://preview.test/super-preview',
        serverOrigin: 'https://preview.test',
      },
      launchParams: {
        scene: 'request-scene-uuid',
        splashPreview: 'true',
      },
    });
    expect(moduleRequireFile).not.toHaveBeenCalled();
    expect(messageSend).not.toHaveBeenCalledWith('preview', 'ready');
  });

  it('keeps the engine splash visible and only preserves its full duration on request', async () => {
    /// @case
    /// 1. The user opens the normal Super Preview route and then requests splash preview explicitly.
    /// 2. The browser loads the public Preview Shell stylesheet.
    /// @expect
    /// Normal preview uses the built-in short splash, explicit preview preserves its duration, and neither is covered by the shell loader.
    const normalResponse = createResponse();
    await invokeStringRoute(
      '/super-preview',
      createRequest('/super-preview?scene=request-scene-uuid'),
      normalResponse.response,
    );
    expect(normalResponse.state.body).toEqual(
      expect.stringContaining('/settings.js?scene=request-scene-uuid'),
    );
    expect(normalResponse.state.body).not.toEqual(expect.stringContaining('splashPreview=true'));

    const splashResponse = createResponse();
    await invokeStringRoute(
      '/super-preview',
      createRequest('/super-preview?scene=request-scene-uuid&splashPreview=true'),
      splashResponse.response,
    );
    expect(splashResponse.state.body).toEqual(expect.stringContaining('splashPreview=true'));

    const styleResponse = createResponse();
    await invokeAssetRoute(
      createRequest('/super-preview/assets/style.css', {}, ['assets/style.css']),
      styleResponse.response,
    );
    const style = Buffer.isBuffer(styleResponse.state.body)
      ? styleResponse.state.body.toString('utf8')
      : '';
    expect(style).toMatch(/\.loading-screen[^{]*\{[^}]*background:\s*transparent[^}]*\}/su);
    expect(style).toMatch(/\.progress-bar[^{]*\{[^}]*bottom:\s*10%[^}]*\}/su);
    expect(style).not.toContain('.boot-status');
    expect(style).toMatch(/\.error-overlay[^{]*\{[^}]*z-index:\s*20[^}]*background:\s*rgb\(18 18 18 \/ 88%\)[^}]*\}/su);

    const shellResponse = createResponse();
    await invokeAssetRoute(
      createRequest('/super-preview/assets/index.js', {}, ['assets/index.js']),
      shellResponse.response,
    );
    const shell = Buffer.isBuffer(shellResponse.state.body)
      ? shellResponse.state.body.toString('utf8')
      : '';
    expect(shell).not.toContain('boot-status');
  });

  it('uses the editor preview scene when the request does not select one', async () => {
    /// @case
    /// 1. The preview URL does not include a scene parameter.
    /// 2. The editor preview profile selects a scene.
    /// @expect
    /// The generated settings request uses the profile scene instead of current_scene.
    profileGetConfig.mockResolvedValue('profile-scene-uuid');
    const { response, state } = createResponse();

    await invokeStringRoute('/super-preview', createRequest('/super-preview'), response);

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual(expect.stringContaining('/settings.js?scene=profile-scene-uuid'));

    profileGetConfig.mockResolvedValue(undefined);
    const defaultResponse = createResponse();
    await invokeStringRoute(
      '/super-preview',
      createRequest('/super-preview'),
      defaultResponse.response,
    );
    expect(defaultResponse.state.body).toEqual(expect.stringContaining('/settings.js?scene=current_scene'));
  });

  it('keeps Vortex scene asset references and the current-scene marker', async () => {
    /// @case
    /// 1. Vortex opens preview with a selected scene UUID.
    /// 2. Vortex opens preview with the current-scene marker.
    /// @expect
    /// UUIDs pass through unchanged while current_scene keeps its live route.

    const selectedResponse = createResponse();
    await invokeStringRoute(
      '/super-preview',
      createRequest('/super-preview?scene=selected-scene-uuid'),
      selectedResponse.response,
    );
    expect(selectedResponse.state.body).toEqual(
      expect.stringContaining('/settings.js?scene=selected-scene-uuid'),
    );

    profileGetConfig.mockResolvedValue('current_scene');
    const currentResponse = createResponse();
    await invokeStringRoute('/super-preview', createRequest('/super-preview'), currentResponse.response);
    expect(currentResponse.state.body).toEqual(
      expect.stringContaining('/settings.js?scene=current_scene'),
    );
  });

  it('renders a preset through its default export and exposes launch params only as modules', async () => {
    /// @case
    /// 1. An enabled extension contributes a preset whose default export returns launch params.
    /// 2. The user opens the preset route with an explicit query override.
    /// @expect
    /// The final Super Preview HTML uses the effective scene and publishes the same immutable launch params from one embedded config through native ESM and SystemJS modules without a global or URL payload.
    const createPreset = vi.fn(async () => ({
      launchParams: {
        fullFlow: '',
        scene: 'preset-scene-uuid',
        serverPort: '12180',
      },
    }));
    moduleRequireFile.mockReturnValue(createPreset);
    const packageInfo = enablePreset('example-preset-default', {
      id: 'example',
      module: './dist/example.cjs',
    });
    const { response, state } = createResponse();

    await invokePresetRoute(
      createRequest('/super-preview/preset-example?scene=query-scene-uuid&serverPort=13000'),
      response,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual(expect.stringContaining('/settings.js?scene=query-scene-uuid'));
    expect(state.body).not.toEqual(expect.stringContaining('__SUPER_PREVIEW'));
    expect(createPreset).toHaveBeenCalledWith({
      projectPath: '',
      requestUrl: new URL(
        'https://preview.test/super-preview/preset-example?scene=query-scene-uuid&serverPort=13000',
      ),
    });
    expect(messageRequest).toHaveBeenCalledWith(
      'super-preview',
      'evaluate-preset-launch-params',
      {
        presetId: 'example',
        requestUrl:
          'https://preview.test/super-preview/preset-example?scene=query-scene-uuid&serverPort=13000',
      },
    );
    const html = String(state.body);
    const nativeImportMap = readInlineImportMap(html, 'importmap');
    const systemImportMap = readInlineImportMap(html, 'systemjs-importmap', 'super-preview');
    const expectedLaunchParams = {
      fullFlow: '',
      scene: 'query-scene-uuid',
      serverPort: '13000',
    };
    expect(readEmbeddedConfig(html).launchParams).toEqual(expectedLaunchParams);
    expect(new URL(nativeImportMap.imports['super-preview']).searchParams.has('p')).toBe(false);
    expect(new URL(systemImportMap.imports['super-preview']).searchParams.has('p')).toBe(false);

    presetContributions.disable(packageInfo);
  });

  it('keeps contributor module loading behind a private main-process message', async () => {
    /// @case
    /// 1. Main registers a preset while the server process receives a stubbed IPC result.
    /// 2. The server renders that preset route.
    /// @expect
    /// The manifest keeps the message private and the server uses the IPC result without loading the contributor module itself.
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      contributions?: {
        messages?: Record<string, {
          methods?: string[];
          public?: boolean;
        }>;
      };
    };
    expect(
      packageJson.contributions?.messages?.['evaluate-preset-launch-params'],
    ).toEqual({
      methods: ['evaluate-preset-launch-params'],
      public: false,
    });
    enablePreset('example-preset-ipc-boundary', {
      id: 'ipc-boundary',
      module: './dist/ipc-boundary.cjs',
    });
    messageRequest.mockImplementation(async (
      extension: string,
      message: string,
    ) => {
      if (
        extension === 'super-preview'
        && message === 'evaluate-preset-launch-params'
      ) {
        return {
          launchParams: {
            scene: 'ipc-scene',
          },
          ok: true,
        };
      }
      return defaultMessageResponse(extension, message);
    });

    const { response, state } = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-ipc-boundary'),
      response,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual(expect.stringContaining('/settings.js?scene=ipc-scene'));
    expect(moduleRequireFile).not.toHaveBeenCalled();
  });

  it('recreates preset state after its contribution is disabled and enabled', async () => {
    /// @case
    /// 1. Main enables a preset contribution and the server requests it through extension IPC.
    /// 2. Main disables and then enables the same contribution before another server request.
    /// @expect
    /// Both requests render successfully and the contributor module is reloaded for the new main-owned registry lifecycle.
    moduleRequireFile.mockReturnValue(async () => ({
      launchParams: {
        scene: 'lifecycle-scene',
      },
    }));
    const packageInfo = enablePreset('example-preset-lifecycle', {
      id: 'lifecycle',
      module: './dist/lifecycle.cjs',
    });

    const firstResponse = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-lifecycle'),
      firstResponse.response,
    );
    expect(firstResponse.state.statusCode).toBe(200);

    presetContributions.disable(packageInfo);
    presetContributions.enable(packageInfo, {
      presets: [{
        id: 'lifecycle',
        module: './dist/lifecycle.cjs',
      }],
    });

    const secondResponse = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-lifecycle'),
      secondResponse.response,
    );
    expect(secondResponse.state.statusCode).toBe(200);
    expect(moduleRequireFile).toHaveBeenCalledTimes(2);
  });

  it('clears the preset entry and logs the original module evaluation error', async () => {
    /// @case
    /// 1. A preset entry throws during module evaluation.
    /// @expect
    /// The route returns 500, requests cleanup for the declared entry, and diagnostics preserve the evaluation error.
    const projectPath = mkdtempSync(join(tmpdir(), 'super-preview-preset-error-'));
    const moduleError = new Error('preset module evaluation failed');
    moduleRequireFile.mockImplementation(() => {
      throw moduleError;
    });
    enablePreset('example-preset-module-error', {
      id: 'module-error',
      module: './dist/module-error.cjs',
    });
    Reflect.set(Editor.Project, 'path', projectPath);

    try {
      const { response, state } = createResponse();
      await invokePresetRoute(
        createRequest('/super-preview/preset-module-error'),
        response,
      );

      expect(state.statusCode).toBe(500);
      expect(moduleRemoveCache).toHaveBeenCalledTimes(1);
      expect(moduleRemoveCache).toHaveBeenCalledWith(
        'V:\\extensions\\example-preset-module-error\\dist\\module-error.cjs',
      );
      const logDirectory = join(projectPath, 'temp', 'super-preview', 'logs');
      const [logFile] = readdirSync(logDirectory);
      const records = readFileSync(join(logDirectory, logFile), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as {
          event: string;
          payload?: {
            error?: {
              message?: string;
            };
          };
        });
      expect(records.find((record) => record.event === 'preset-route-error'))
        .toMatchObject({
          event: 'preset-route-error',
          payload: {
            error: {
              message: moduleError.message,
            },
          },
        });
    } finally {
      Reflect.set(Editor.Project, 'path', '');
      rmSync(projectPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it('loads a configured preset export and rejects invalid callback results', async () => {
    /// @case
    /// 1. One preset selects a named module export and another returns unsupported data.
    /// 2. Each preset route is requested.
    /// @expect
    /// The configured export renders normally while the invalid contribution fails visibly with status 500.
    moduleRequireFile.mockImplementation((modulePath: string) => {
      if (modulePath.endsWith('named.cjs')) {
        return {
          createPreset: async () => ({
            launchParams: {
              scene: 'named-scene',
            },
          }),
        };
      }
      return {
        default: async () => ({
          launchParams: {
            serverPort: 12180,
          },
        }),
      };
    });
    enablePreset('example-preset-named', {
      export: 'createPreset',
      id: 'named',
      module: './dist/named.cjs',
    });
    enablePreset('example-preset-invalid', {
      id: 'invalid',
      module: './dist/invalid.cjs',
    });

    const namedResponse = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-named'),
      namedResponse.response,
    );
    expect(namedResponse.state.statusCode).toBe(200);
    expect(namedResponse.state.body).toEqual(
      expect.stringContaining('/settings.js?scene=named-scene'),
    );

    const invalidResponse = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-invalid'),
      invalidResponse.response,
    );
    expect(invalidResponse.state.statusCode).toBe(500);
  });

  it('reports missing and conflicting enabled presets without falling back', async () => {
    /// @case
    /// 1. A missing preset is requested and two enabled extensions claim another preset ID.
    /// 2. Super Preview resolves both routes.
    /// @expect
    /// Missing presets return 404 and contribution conflicts return 409 instead of rendering the ordinary preview.
    moduleRequireFile.mockReturnValue({
      default: async () => ({ launchParams: {} }),
    });
    enablePreset('example-preset-conflict-a', {
      id: 'conflict',
      module: './dist/a.cjs',
    });
    enablePreset('example-preset-conflict-b', {
      id: 'conflict',
      module: './dist/b.cjs',
    });

    const missingResponse = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-missing'),
      missingResponse.response,
    );
    expect(missingResponse.state.statusCode).toBe(404);

    const conflictResponse = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-conflict'),
      conflictResponse.response,
    );
    expect(conflictResponse.state.statusCode).toBe(409);
    expect(conflictResponse.state.body).not.toEqual(
      expect.stringContaining('id="super-preview-shell"'),
    );
  });

  it('rejects invalid preset declarations before loading their modules', async () => {
    /// @case
    /// 1. An extension contributes a preset whose module escapes its package.
    /// 2. The user requests that preset.
    /// @expect
    /// The invalid contribution is not registered, the route returns 404, and no contributor module is loaded.
    enablePreset('example-preset-escaped', {
      id: 'escaped',
      module: '../outside.cjs',
    });

    const { response, state } = createResponse();
    await invokePresetRoute(
      createRequest('/super-preview/preset-escaped'),
      response,
    );

    expect(state.statusCode).toBe(404);
    expect(moduleRequireFile).not.toHaveBeenCalled();
  });

  it('opens the stable route through the extension message', async () => {
    /// @case
    /// 1. The Project menu sends the extension open message.
    /// 2. The built-in preview extension reports its public base URL.
    /// @expect
    /// Super Preview opens its stable path on the same protocol, host, and port.
    messageRequest.mockImplementation(async (extension: string, message: string) => {
      if (extension === 'preview' && message === 'query-preview-url') {
        return 'https://preview.test:7456';
      }
      return defaultMessageResponse(extension, message);
    });

    await methods.open();

    expect(messageSend).toHaveBeenCalledWith(
      'program',
      'open-url',
      'https://preview.test:7456/super-preview',
    );
  });

  it('serves the extension map and rejects unsafe shell asset paths', async () => {
    /// @case
    /// 1. The shell requests the preview extension map after asset-db is ready.
    /// 2. A request attempts to escape the exported shell asset directory.
    /// @expect
    /// Binary assets receive the .cconb extension and traversal is rejected with status 400.
    let assetDBReady = false;
    messageRequest.mockImplementation(async (extension: string, message: string) => {
      if (extension === 'asset-db' && message === 'query-ready') {
        if (!assetDBReady) {
          queueMicrotask(() => {
            assetDBReady = true;
            emitBroadcast('asset-db:ready');
          });
        }
        return assetDBReady;
      }
      if (extension === 'asset-db' && message === 'query-assets') {
        return [
          {
            uuid: 'binary-asset',
            library: {
              '.bin': 'V:/library/binary.bin',
            },
          },
          {
            uuid: 'json-asset',
            library: {
              '.json': 'V:/library/json.json',
            },
          },
        ];
      }
      return defaultMessageResponse(extension, message);
    });
    const mapResponse = createResponse();
    await invokeStringRoute(
      '/super-preview/query-extname-map.json',
      createRequest('/super-preview/query-extname-map.json'),
      mapResponse.response,
    );

    expect(mapResponse.state.statusCode).toBe(200);
    expect(mapResponse.state.body).toMatchObject({
      extensions: {
        'binary-asset': '.cconb',
      },
    });

    const assetResponse = createResponse();
    await invokeAssetRoute(
      createRequest('/super-preview/assets/../secret', {}, ['assets/../secret']),
      assetResponse.response,
    );

    expect(assetResponse.state.statusCode).toBe(400);
    expect(assetResponse.state.body).toMatchObject({ ok: false });

    const missingAssetResponse = createResponse();
    await invokeAssetRoute(
      createRequest('/super-preview/assets/missing.js', {}, ['assets/missing.js']),
      missingAssetResponse.response,
    );
    expect(missingAssetResponse.state.statusCode).toBe(404);

    const validAssetResponse = createResponse();
    await invokeAssetRoute(
      createRequest('/super-preview/assets/boot.js', {}, ['assets/boot.js']),
      validAssetResponse.response,
    );
    expect(validAssetResponse.state.statusCode).toBe(200);
    expect(Buffer.isBuffer(validAssetResponse.state.body)).toBe(true);
    unload();
  });

  it('emits native and SystemJS runtime loading branches without a static bare import', async () => {
    /// @case
    /// 1. The published Preview Shell boot entry and its imported chunk are inspected.
    /// 2. The page has emitted native and SystemJS import maps for the same runtime module.
    /// @expect
    /// The build artifact contains both dynamic loading branches and no static bare runtime import; browser behavior is covered by runtime smoke tests.
    const entryResponse = createResponse();
    await invokeAssetRoute(
      createRequest('/super-preview/assets/boot.js', {}, ['assets/boot.js']),
      entryResponse.response,
    );
    const entrySource = readResponseBuffer(entryResponse.state.body);
    const chunkName = entrySource.match(/import\s+"\.\/([^"]+)"/u)?.[1];
    expect(chunkName).toBeTruthy();

    const chunkResponse = createResponse();
    await invokeAssetRoute(
      createRequest(
        `/super-preview/assets/${chunkName}`,
        {},
        [`assets/${chunkName}`],
      ),
      chunkResponse.response,
    );
    const bootSource = `${entrySource}\n${readResponseBuffer(chunkResponse.state.body)}`;

    expect(bootSource).not.toMatch(/\bfrom\s+["']super-preview["']/u);
    expect(bootSource).toMatch(/HTMLScriptElement\.supports\?\.\(["']importmap["']\)/u);
    expect(bootSource).toMatch(/\bimport\(["']super-preview["']\)/u);
    expect(bootSource).toMatch(/globalThis\.System/u);
    expect(bootSource).toMatch(/\.import\(["']super-preview["']\)/u);
  });
});

describe('Super Preview toolbar contribution', () => {
  beforeEach(() => {
    messageRequest.mockReset();
  });

  it('declares a built-in-sized play button after the built-in preview group', () => {
    /// @case
    /// 1. Vortex loads the extension manifest and middle toolbar contribution.
    /// 2. The toolbar renders the Super Preview launch control.
    /// @expect
    /// The contribution follows built-in preview priority and uses the built-in 24x22 play-button size with SUPER below the toolbar row.
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      contributions?: {
        toolbar?: {
          middle?: string;
          middlePriority?: number;
        };
      };
    };

    expect(packageJson.contributions?.toolbar).toEqual({
      middle: './dist/contributions/toolbar/index.cjs',
      middlePriority: 1,
    });
    expect(toolbar.template).toContain('value="play"');
    expect(toolbar.template).toContain('SUPER');
    expect(toolbar.template).toContain('tooltip="Super Preview"');
    expect(toolbar.template).toContain('class="super-preview-open transparent"');
    expect(toolbar.template).toMatch(
      /<\/ui-button>\s*<span class="super-preview-footnote">SUPER<\/span>/u,
    );
    expect(toolbar.style).toMatch(/width:\s*24px/u);
    expect(toolbar.style).toMatch(/height:\s*22px/u);
    expect(toolbar.style).toMatch(
      /\.super-preview-footnote\s*\{[^}]*position:\s*absolute[^}]*top:\s*calc\(100% \+ 1px\)/su,
    );
    expect(toolbar.style).not.toMatch(/\.super-preview-open ui-icon[^}]*font-size/u);
  });

  it('opens once while a toolbar request is pending and recovers after success', async () => {
    /// @case
    /// 1. The user clicks the Super Preview toolbar button twice before opening finishes.
    /// 2. The open request succeeds and the user clicks again.
    /// @expect
    /// Only one request runs concurrently, the button is re-enabled, and a later click can open again.
    const pendingOpen = createDeferred<void>();
    messageRequest.mockReturnValueOnce(pendingOpen.promise).mockResolvedValueOnce(undefined);
    const context = createToolbarContext();

    toolbar.ready.call(context as never);
    context.open.dispatch('click');
    context.open.dispatch('click');

    expect(messageRequest).toHaveBeenCalledTimes(1);
    expect(messageRequest).toHaveBeenCalledWith('super-preview', 'open');
    expect(context.open.hasAttribute('disabled')).toBe(true);

    pendingOpen.resolve();
    await vi.waitFor(() => expect(context.open.hasAttribute('disabled')).toBe(false));

    context.open.dispatch('click');
    await vi.waitFor(() => expect(messageRequest).toHaveBeenCalledTimes(2));
    toolbar.close.call(context as never);
  });

  it('logs an actionable error and restores the button after an open failure', async () => {
    /// @case
    /// 1. The toolbar asks the extension to open Super Preview.
    /// 2. The extension message rejects.
    /// @expect
    /// The error is logged with the extension prefix and the launch button becomes usable again.
    const error = new Error('preview unavailable');
    messageRequest.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = createToolbarContext();

    toolbar.ready.call(context as never);
    context.open.dispatch('click');

    await vi.waitFor(() => expect(context.open.hasAttribute('disabled')).toBe(false));
    expect(consoleError).toHaveBeenCalledWith('[Super Preview] Failed to open preview', error);
    toolbar.close.call(context as never);
    consoleError.mockRestore();
  });
});

function emitBroadcast(name: string, ...args: unknown[]) {
  for (const listener of broadcastListeners.get(name) ?? []) {
    listener(...args);
  }
}

function installDefaultEditorResponses() {
  profileGetConfig.mockResolvedValue(undefined);
  messageRequest.mockImplementation(defaultMessageResponse);
}

async function defaultMessageResponse(
  extension: string,
  message: string,
  request?: unknown,
) {
  if (
    extension === 'super-preview'
    && message === 'evaluate-preset-launch-params'
  ) {
    const evaluatePresetLaunchParams = Reflect.get(
      methods,
      'evaluate-preset-launch-params',
    ) as ((request: unknown) => unknown) | undefined;
    if (!evaluatePresetLaunchParams) {
      throw new Error('Missing main evaluate-preset-launch-params method');
    }
    return evaluatePresetLaunchParams(request);
  }
  if (extension === 'engine' && message === 'query-engine-info') {
    return {
      outputs: {
        preview: 'V:\\engine\\cache\\dev\\preview',
      },
      typescript: {
        path: 'V:\\engine',
      },
    };
  }
  if (extension === 'preview' && message === 'query-preview-url') {
    return 'https://preview.test';
  }
  return undefined;
}

async function invokeStringRoute(url: string, request: Request, response: Response) {
  const pathname = new URL(request.originalUrl ?? request.url, 'https://preview.test').pathname;
  const route = get.find((entry) => (
    entry.url === url
    || (entry.url instanceof RegExp && entry.url.test(pathname))
  ));
  if (!route) {
    throw new Error(`Missing server route: ${url}`);
  }
  await route.handle(request, response);
}

async function invokeAssetRoute(request: Request, response: Response) {
  const route = get.find((entry) => (
    entry.url instanceof RegExp
    && entry.url.source.includes('assets')
  ));
  if (!route) {
    throw new Error('Missing shell asset route');
  }
  await route.handle(request, response);
}

async function invokePresetRoute(request: Request, response: Response) {
  const pathname = new URL(request.originalUrl ?? request.url, 'https://preview.test').pathname;
  const route = get.find((entry) => entry.url instanceof RegExp && entry.url.test(pathname));
  if (!route) {
    throw new Error('Missing preset route');
  }
  request.params = (route.url instanceof RegExp
    ? route.url.exec(pathname)?.slice(1) ?? []
    : []) as unknown as Request['params'];
  await route.handle(request, response);
}

function enablePreset(
  packageName: string,
  preset: {
    export?: string;
    id: string;
    module: string;
  },
  packagePath = `V:\\extensions\\${packageName}`,
) {
  const packageInfo = {
    debug: false,
    enable: true,
    info: {
      name: packageName,
      version: '1.0.0',
    },
    invalid: false,
    name: packageName,
    path: packagePath,
    version: '1.0.0',
  } satisfies Editor.Interface.PackageInfo;
  enabledPresetPackages.push(packageInfo);
  presetContributions.enable(packageInfo, {
    presets: [preset],
  });
  return packageInfo;
}

function readInlineImportMap(
  html: string,
  type: string,
  requiredSpecifier?: string,
) {
  const scripts = Array.from(
    html.matchAll(new RegExp(`<script type="${type}">([\\s\\S]*?)<\\/script>`, 'gu')),
  );
  for (const script of scripts) {
    const importMap = JSON.parse(script[1]) as {
      imports: Record<string, string>;
    };
    if (!requiredSpecifier || importMap.imports[requiredSpecifier]) {
      return importMap;
    }
  }
  throw new Error(`Missing inline ${type} for ${requiredSpecifier ?? 'runtime'}`);
}

function readEmbeddedConfig(html: string) {
  const script = html.match(
    /<script id="super-preview-config" type="application\/json">([\s\S]*?)<\/script>/u,
  );
  if (!script?.[1]) {
    throw new Error('Missing embedded Super Preview config');
  }
  return JSON.parse(script[1]) as {
    boot: Record<string, string>;
    launchParams: Record<string, string>;
  };
}

function readResponseBuffer(body: unknown) {
  if (!Buffer.isBuffer(body)) {
    throw new Error('Expected a binary server response');
  }
  return body.toString('utf8');
}

function createRequest(path: string, query: Record<string, string> = {}, params: string[] = []) {
  const headers = {
    host: 'preview.test',
  };
  return {
    get(name: string) {
      return headers[name.toLowerCase() as keyof typeof headers];
    },
    header(name: string) {
      return headers[name.toLowerCase() as keyof typeof headers];
    },
    headers,
    method: 'GET',
    originalUrl: path,
    params,
    protocol: 'https',
    query,
    url: path,
  } as unknown as Request;
}

function createResponse() {
  const state: ResponseState = {
    headers: {},
  };
  const response = {} as Response;
  response.status = vi.fn((statusCode: number) => {
    state.statusCode = statusCode;
    return response;
  });
  response.type = vi.fn((contentType: string) => {
    state.contentType = contentType;
    return response;
  });
  response.set = vi.fn((name: string, value: string) => {
    state.headers[name] = value;
    return response;
  }) as unknown as Response['set'];
  response.send = vi.fn((body: unknown) => {
    state.body = body;
    return response;
  });
  response.json = vi.fn((body: unknown) => {
    state.body = body;
    return response;
  });
  return { response, state };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

class FakeToolbarElement {
  readonly attributes = new Set<string>();
  readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(name: string, listener: EventListener) {
    const listeners = this.listeners.get(name) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  dispatch(name: string) {
    const event = {
      stopPropagation: vi.fn(),
      type: name,
    } as unknown as Event;
    for (const listener of this.listeners.get(name) ?? []) {
      listener(event);
    }
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  removeEventListener(name: string, listener: EventListener) {
    this.listeners.get(name)?.delete(listener);
  }

  setAttribute(name: string) {
    this.attributes.add(name);
  }
}

function createToolbarContext() {
  const root = new FakeToolbarElement();
  const open = new FakeToolbarElement();
  return {
    $: {
      open: open as unknown as HTMLElement,
      root: root as unknown as HTMLElement,
    },
    open,
    root,
  };
}
