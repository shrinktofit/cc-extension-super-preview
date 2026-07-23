import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const config: SuperPreviewBootConfig = {
  assetsImportBaseUrl: 'https://preview.test/assets/general/import',
  assetsNativeBaseUrl: 'https://preview.test/assets/general/native',
  packResolutionDetailMapUrl: 'https://preview.test/scripting/x/resolution-detail-map.json',
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
    vi.stubGlobal('document', {
      baseURI: 'https://preview.test/super-preview',
    });
  });

  it('launches the scene selected by preview settings instead of launch params', async () => {
    vi.stubGlobal('window', {
      _CCSettings: {
        launch: {
          launchScene: 'settings-scene',
        },
      },
    });

    await bootEngineReady(ui, config, {
      scene: 'game-scene-param',
    });

    expect(mocks.startLaunchScene).toHaveBeenCalledWith(
      'settings-scene',
      config.serverOrigin,
      ui,
    );
  });

  it('uses the current-scene marker when settings omit a scene', async () => {
    vi.stubGlobal('window', {
      _CCSettings: {},
    });

    await bootEngineReady(ui, config, {
      scene: 'game-scene-param',
    });

    expect(mocks.startLaunchScene).toHaveBeenCalledWith(
      'current_scene',
      config.serverOrigin,
      ui,
    );
  });
});
