import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RenderNode {
  style: Record<string, string>;
}

vi.mock('eruda', () => ({ default: { init: vi.fn() } }));

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>();
  const renderer = vue.createRenderer<RenderNode, RenderNode>({
    createElement: () => ({ style: {} }),
    createText: () => ({ style: {} }),
    createComment: () => ({ style: {} }),
    insert: () => {},
    remove: () => {},
    setText: () => {},
    setElementText: () => {},
    parentNode: () => null,
    nextSibling: () => null,
    patchProp: () => {},
  });
  return {
    ...vue,
    createApp: (...args: Parameters<typeof renderer.createApp>) => renderer.createApp(...args)
      .provide(vue.ssrContextKey, { modules: new Set() }),
  };
});

describe('Preview boot option and business parameter isolation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { debug: true, option: true, stored: undefined, business: 'false', logs: true },
    { debug: false, option: false, stored: '1', business: 'true', logs: false },
    { debug: true, option: undefined, stored: '1', business: 'false', logs: true },
    { debug: true, option: undefined, stored: undefined, business: 'true', logs: false },
    { debug: true, option: true, stored: 'blocked', business: 'false', logs: true },
    { debug: true, option: false, stored: 'blocked', business: 'true', logs: false },
    { debug: true, option: undefined, stored: 'blocked', business: 'true', logs: false },
  ])('uses debug=$debug and diagnostics=$logs with option=$option, storage=$stored and business=$business', async ({ debug, option, stored, business, logs }) => {
    /// @case
    /// 1. The actual boot entry reads embedded options beside conflicting business logging and scene values.
    /// 2. Browser storage is enabled, empty or blocked, and the window load event starts preview.
    /// @expect
    /// Engine logging follows the preview boolean; diagnostic stage output follows the explicit option or storage default.
    /// Business strings never select logging or scenes, and boot succeeds even when storage is blocked.
    const gameInit = vi.fn(async () => {});
    const gameRun = vi.fn((onStart: () => void) => onStart());
    const engine = {
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
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      _CCSettings: { launch: { launchScene: 'preview-scene' } },
      get localStorage() {
        if (stored === 'blocked') {
          throw new Error('Storage blocked');
        }
        return { getItem: () => stored };
      },
      System: { prepareImport: async () => {}, import: async () => engine },
    });
    const body = { dataset: {} as Record<string, string> };
    vi.stubGlobal('document', {
      readyState: 'loading',
      baseURI: 'https://preview.test/super-preview',
      body,
      createElement: () => ({ style: {} }),
      querySelector: (selector: string) => selector === '#super-preview-shell'
        ? { style: {} }
        : {
          textContent: JSON.stringify({
            boot: {
              serverOrigin: 'https://preview.test',
              previewServerUrl: 'https://preview.test/super-preview',
            },
            launchParams: { scene: 'lobby', debug: business, superPreviewDebug: business },
            previewOptions: { debug, superPreviewDebug: option, splashPreview: false },
          }),
        },
    });
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/query-extname-map.json') ? { extensions: {} } : [{}, { _id: 'preview-scene' }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../src/boot');
    const onLoad = listeners.get('load');
    expect(onLoad).toBeDefined();
    onLoad?.();
    await vi.waitFor(() => expect(body.dataset.superPreviewStage).toBe('scene:launch:done'));

    expect(gameRun).toHaveBeenCalledOnce();
    expect(gameInit).toHaveBeenCalledWith(expect.objectContaining({ debugMode: debug ? 1 : 0 }));
    expect(fetchMock).toHaveBeenCalledWith('https://preview.test/scene/preview-scene.json', { cache: 'no-store' });
    const stageLogs = info.mock.calls.filter(([message]) => typeof message === 'string' && message.startsWith('[Super Preview] stage '));
    expect(stageLogs.length > 0).toBe(logs);
    expect(error).not.toHaveBeenCalled();
  });
});
