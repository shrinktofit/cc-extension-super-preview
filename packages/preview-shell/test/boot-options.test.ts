import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('eruda', () => ({ default: { init: vi.fn() } }));
vi.mock('pal/screen-adapter/web', () => ({ screenAdapter: { bindHost: () => {} } }));

const engineHolder: { current?: Record<string, unknown> } = {};
vi.mock('cc', () => ({
  get game() { return engineHolder.current!.game; },
  get director() { return engineHolder.current!.director; },
  get assetManager() { return engineHolder.current!.assetManager; },
  get DebugMode() { return engineHolder.current!.DebugMode; },
  get Game() { return engineHolder.current!.Game; },
}));

describe('Preview boot option and business parameter isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    delete document.body.dataset.superPreviewStage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('boots the preview with embedded options and business parameters kept apart', async () => {
    /// @case
    /// 1. The actual boot entry reads embedded options beside conflicting business logging and scene values.
    /// 2. The browser loads the shell and starts preview on the window load event.
    /// @expect
    /// Business strings never select logging or scenes; the Web host is bound before importing cc and game.init receives the shell canvas.
    const configScript = document.createElement('script');
    configScript.id = 'super-preview-config';
    configScript.type = 'application/json';
    configScript.textContent = JSON.stringify({
      boot: {
        assetsImportBaseUrl: 'https://preview.test/assets/general/import',
        assetsNativeBaseUrl: 'https://preview.test/assets/general/native',
        packResolutionDetailMapUrl: 'https://preview.test/scripting/x/resolution-detail-map.json',
        previewServerUrl: 'https://preview.test/super-preview',
        serverOrigin: 'https://preview.test',
        engineSession: { importMapURL: 'https://preview.test/scripting/engine/development/test/import-map' },
      },
      launchParams: { scene: 'lobby', debug: 'false', superPreviewDebug: 'true' },
      previewOptions: { debug: true, splashPreview: false },
    });
    const shellRoot = document.createElement('div');
    shellRoot.id = 'super-preview-shell';
    document.body.append(configScript, shellRoot);

    const gameInit = vi.fn(async () => {});
    const gameRun = vi.fn((onStart: () => void) => onStart());
    engineHolder.current = {
      DebugMode: { INFO: 1, NONE: 0 },
      Game: {},
      game: { init: gameInit, on: vi.fn(), run: gameRun, pause: vi.fn(), resume: vi.fn() },
      assetManager: {
        pipeline: { remove: vi.fn(), insert: vi.fn() },
        fetchPipeline: { remove: vi.fn(), insert: vi.fn() },
        loadWithJson: (_json: unknown, _options: unknown, _progress: unknown, complete: (error: undefined, asset: unknown) => void) => {
          complete(undefined, { name: 'Preview Scene', scene: {} });
        },
      },
      director: {
        runSceneImmediate: (_scene: unknown, beforeLoad: () => void, complete: () => void) => {
          beforeLoad();
          complete();
        },
      },
    };
    window.System = {
      constructor: { prototype: {} },
      prepareImport: async () => {},
    } as unknown as typeof window.System;
    window._CCSettings = { launch: { launchScene: 'preview-scene' } };

    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/query-extname-map.json') ? { extensions: {} } : [{}, { _id: 'preview-scene' }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../src/boot');
    await vi.waitFor(() => expect(document.body.dataset.superPreviewStage).toBe('scene:launch:done'));

    expect(gameRun).toHaveBeenCalledOnce();
    expect(gameInit).toHaveBeenCalledWith(expect.objectContaining({
      canvas: expect.any(HTMLCanvasElement),
      debugMode: 1,
    }));
    expect(fetchMock).toHaveBeenCalledWith('https://preview.test/scene/preview-scene.json', { cache: 'no-store' });
    expect(error).not.toHaveBeenCalled();
  });
});
