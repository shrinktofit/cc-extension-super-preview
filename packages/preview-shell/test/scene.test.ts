import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewShellUi } from '../src/boot/shell-ui';

const mocks = vi.hoisted(() => ({
  gamePause: vi.fn(),
  gameResume: vi.fn(),
  loadWithJson: vi.fn(),
  runSceneImmediate: vi.fn(),
}));

vi.mock('cc', () => ({
  assetManager: {
    loadWithJson: mocks.loadWithJson,
  },
  director: {
    runSceneImmediate: mocks.runSceneImmediate,
  },
  game: {
    pause: mocks.gamePause,
    resume: mocks.gameResume,
  },
}));

const { startLaunchScene } = await import('../src/boot/engine-ready/scene');

const ui = {
  hideSplash: vi.fn(),
  reportBootStage: vi.fn(),
  reportLoadProgress: vi.fn(),
  showError: vi.fn(),
  showLoading: vi.fn(),
} as unknown as PreviewShellUi;

describe('Preview Shell scene loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWithJson.mockImplementation((
      _json: unknown,
      _options: unknown,
      _progress: unknown,
      complete: (error: undefined, sceneAsset: unknown) => void,
    ) => complete(undefined, {
      name: 'Projected Scene',
      scene: { name: '' },
    }));
    mocks.runSceneImmediate.mockImplementation((
      _scene: unknown,
      beforeLoad: () => void,
      launched: (error?: Error) => void,
    ) => {
      beforeLoad();
      launched();
    });
  });

  it('loads scene JSON from the configured Preview scene base', async () => {
    /// @case
    /// 1. A Preview settings hook selects a client-only scene namespace.
    /// 2. Super Preview launches the current scene.
    /// @expect
    /// The scene JSON request stays inside that namespace and never uses /scene.
    const fetchMock = vi.fn(async () => ({
      json: async () => [{}, { _id: 'projected-scene' }],
      ok: true,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await startLaunchScene(
      'current_scene',
      'https://preview.test/oh-my-headless/client/browser/scene',
      ui,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://preview.test/oh-my-headless/client/browser/scene/current_scene.json',
      { cache: 'no-store' },
    );
  });
});
