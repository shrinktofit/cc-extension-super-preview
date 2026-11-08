import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewShellUi } from '../src/boot/shell-ui';
import type { SuperPreviewBootConfig } from '../src/config';

const mocks = vi.hoisted(() => ({
  gameInit: vi.fn(async () => {}),
  gameOn: vi.fn(),
  gameRun: vi.fn((onStart: () => void) => onStart()),
  installQueryExtnamePipe: vi.fn(async () => {}),
  startLaunchScene: vi.fn(async () => {}),
}));

vi.mock('cc', () => ({
  DebugMode: {
    INFO: 1,
    NONE: 0,
  },
  Game: {
    EVENT_ENGINE_INITED: 'engine-inited',
    EVENT_GAME_INITED: 'game-inited',
    EVENT_POST_BASE_INIT: 'post-base-init',
    EVENT_POST_INFRASTRUCTURE_INIT: 'post-infrastructure-init',
    EVENT_POST_SUBSYSTEM_INIT: 'post-subsystem-init',
    EVENT_PRE_BASE_INIT: 'pre-base-init',
    EVENT_PRE_INFRASTRUCTURE_INIT: 'pre-infrastructure-init',
    EVENT_PRE_PROJECT_INIT: 'pre-project-init',
    EVENT_PRE_SUBSYSTEM_INIT: 'pre-subsystem-init',
    EVENT_POST_PROJECT_INIT: 'post-project-init',
  },
  game: {
    init: mocks.gameInit,
    on: mocks.gameOn,
    run: mocks.gameRun,
  },
}));

vi.mock('../src/boot/engine-ready/query-extname', () => ({
  installQueryExtnamePipe: mocks.installQueryExtnamePipe,
}));

vi.mock('../src/boot/engine-ready/scene', () => ({
  startLaunchScene: mocks.startLaunchScene,
}));

const { bootEngineReady } = await import('../src/boot/engine-ready/index');
const canvas = document.createElement('canvas');
canvas.id = 'GameCanvas';

const config: SuperPreviewBootConfig = {
  assetsImportBaseUrl: 'https://preview.test/assets/general/import',
  assetsNativeBaseUrl: 'https://preview.test/assets/general/native',
  packResolutionDetailMapUrl: 'https://preview.test/scripting/x/resolution-detail-map.json',
  engineSession: { importMapURL: 'https://preview.test/scripting/engine/development/test/import-map' },
  previewServerUrl: 'https://preview.test/super-preview',
  serverOrigin: 'https://preview.test',
};

const ui = {
  hideSplash: vi.fn(),
  reportBootStage: vi.fn(),
  reportLoadProgress: vi.fn(),
  showError: vi.fn(),
  showLoading: vi.fn(),
} as unknown as PreviewShellUi;

describe('Preview Shell scene selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren(canvas);
  });

  afterEach(() => {
    delete (window as { _CCSettings?: unknown })._CCSettings;
    vi.unstubAllGlobals();
  });

  it('launches the scene selected by preview settings', async () => {
    window._CCSettings = {
      launch: {
        launchScene: 'settings-scene',
      },
    };

    await bootEngineReady(ui, config, { debug: true });

    expect(mocks.startLaunchScene).toHaveBeenCalledWith(
      'settings-scene',
      `${config.serverOrigin}/scene`,
      ui,
    );
  });

  it('uses the current-scene marker when settings omit a scene', async () => {
    window._CCSettings = {};

    await bootEngineReady(ui, config, { debug: true });

    expect(mocks.startLaunchScene).toHaveBeenCalledWith(
      'current_scene',
      `${config.serverOrigin}/scene`,
      ui,
    );
  });

  it('applies Preview resource URL overrides to assets and scene loading', async () => {
    /// @case
    /// 1. A Preview settings hook supplies client-only resource URL bases.
    /// 2. Super Preview initializes the engine and launches the selected scene.
    /// @expect
    /// Asset requests and the scene JSON request use the supplied client namespace.
    window._CCSettings = {
      launch: {
        launchScene: 'settings-scene',
      },
      preview: {
        resourceUrls: {
          importBase: '/oh-my-headless/client/browser/assets/general/import',
          remoteBundles: ['main', 'resources'],
          sceneBase: '/oh-my-headless/client/browser/scene',
          server: '/oh-my-headless/client/browser/',
        },
      },
    };

    await bootEngineReady(ui, config, { debug: true });

    expect(mocks.gameInit).toHaveBeenCalledWith({
      canvas,
      debugMode: 1,
      overrideSettings: expect.objectContaining({
        assets: expect.objectContaining({
          importBase: 'https://preview.test/oh-my-headless/client/browser/assets/general/import',
          nativeBase: config.assetsNativeBaseUrl,
          bundleBase: 'https://preview.test/assets/',
          remoteBundles: ['main', 'resources'],
          server: 'https://preview.test/oh-my-headless/client/browser/',
          subpackages: [],
        }),
      }),
    });
    expect(mocks.startLaunchScene).toHaveBeenCalledWith(
      'settings-scene',
      `${config.serverOrigin}/oh-my-headless/client/browser/scene`,
      ui,
    );
  });

  it('anchors default bundle and effect requests to the preview server root', async () => {
    /// @case
    /// 1. A nested Super Preview preset boots without resource URL overrides.
    /// 2. Engine settings contain a relative effect path and an empty remote server.
    /// @expect
    /// The engine receives absolute resource URLs rooted at the preview server, not the preset route.
    window._CCSettings = {
      assets: { server: '' },
      rendering: { effectSettingsPath: 'src/effect.bin' },
    };

    await bootEngineReady(ui, config, { debug: true });

    expect(mocks.gameInit).toHaveBeenCalledWith(expect.objectContaining({
      overrideSettings: expect.objectContaining({
        assets: expect.objectContaining({
          importBase: config.assetsImportBaseUrl,
          nativeBase: config.assetsNativeBaseUrl,
          bundleBase: 'https://preview.test/assets/',
          server: 'https://preview.test/',
        }),
        rendering: { effectSettingsPath: 'https://preview.test/src/effect.bin' },
        path: { previewServer: config.previewServerUrl },
      }),
    }));
  });

  it('preserves independent resource hosts and the configured bundle directory', async () => {
    /// @case
    /// 1. Settings use separate CDN locations for bundles, native assets and effects.
    /// 2. The remote server directory is specified without a trailing slash.
    /// @expect
    /// URL preparation preserves each resource host and makes the remote server ready for bundle path concatenation.
    window._CCSettings = {
      assets: {
        bundleBase: 'https://bundles.test/game/',
        server: 'https://remote.test/game',
      },
      preview: {
        resourceUrls: {
          importBase: 'assets/custom/import',
          nativeBase: 'https://native.test/game/',
        },
      },
      rendering: { effectSettingsPath: '//effects.test/effect.bin' },
    };

    await bootEngineReady(ui, config, { debug: true });

    expect(mocks.gameInit).toHaveBeenCalledWith(expect.objectContaining({
      overrideSettings: expect.objectContaining({
        assets: expect.objectContaining({
          importBase: 'https://preview.test/assets/custom/import',
          nativeBase: 'https://native.test/game/',
          bundleBase: 'https://bundles.test/game/',
          server: 'https://remote.test/game/',
        }),
        rendering: { effectSettingsPath: 'https://effects.test/effect.bin' },
      }),
    }));
  });
  it('stops booting when Preview settings were not loaded', async () => {
    /// @case
    /// 1. The Preview settings script fails before defining window._CCSettings.
    /// 2. Super Preview attempts to boot.
    /// @expect
    /// Boot fails explicitly without initializing the engine or loading full resources.
    delete (window as { _CCSettings?: unknown })._CCSettings;

    await expect(bootEngineReady(ui, config, { debug: true })).rejects.toThrow(
      '[Super Preview] Preview settings were not loaded',
    );
    expect(mocks.gameInit).not.toHaveBeenCalled();
    expect(mocks.startLaunchScene).not.toHaveBeenCalled();
  });
});
