import { DebugMode, Game, game } from 'cc';
import type { PreviewShellUi } from '../shell-ui';
import type { SuperPreviewBootConfig, SuperPreviewOptions } from '../../config';
import { installQueryExtnamePipe } from './query-extname';
import { startLaunchScene } from './scene';

export interface CCPreviewSettings extends Record<string, unknown> {
  assets?: Record<string, unknown> & {
    bundleBase?: string;
    server?: string;
  };
  launch?: Record<string, unknown> & { launchScene?: string };
  path?: Record<string, unknown>;
  preview?: Record<string, unknown> & {
    resourceUrls?: {
      importBase?: string;
      nativeBase?: string;
      remoteBundles?: readonly string[];
      sceneBase?: string;
      server?: string;
      subpackages?: readonly string[];
    };
  };
  profiling?: Record<string, unknown>;
  rendering?: Record<string, unknown> & { effectSettingsPath?: string };
  screen?: Record<string, unknown>;
}

type CCOverrideSettings = import('cc').IGameConfig['overrideSettings'] & CCPreviewSettings;

export async function bootEngineReady(
  ui: PreviewShellUi,
  config: SuperPreviewBootConfig,
  previewOptions: Pick<SuperPreviewOptions, 'debug'>,
) {
  installGameInitStageLogger(ui);

  const settings = window._CCSettings;
  if (!settings) {
    throw new Error('[Super Preview] Preview settings were not loaded');
  }
  const launchSettings = { ...(settings.launch ?? {}) };
  const launchScene = launchSettings.launchScene
    ?? 'current_scene';
  const sceneBaseUrl = new URL(
    settings.preview?.resourceUrls?.sceneBase ?? '/scene',
    `${config.serverOrigin}/`,
  ).href.replace(/\/+$/u, '');
  const overrideSettings = createOverrideSettings(settings, launchSettings, config);

  console.info('[Super Preview] Effective preview settings', {
    serverOrigin: config.serverOrigin,
    baseURI: document.baseURI,
    effectSettingsPath: overrideSettings.rendering?.effectSettingsPath,
    previewServer: overrideSettings.path?.previewServer,
    importBase: overrideSettings.assets?.importBase,
    nativeBase: overrideSettings.assets?.nativeBase,
    projectBundles: overrideSettings.assets?.projectBundles,
  });

  ui.reportBootStage('query-extname-map:install');
  await installQueryExtnamePipe(config);

  const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;

  ui.reportBootStage('game:init');
  const gameOptions: import('cc').IGameConfig & { canvas: HTMLCanvasElement } = {
    canvas,
    debugMode: previewOptions.debug ? DebugMode.INFO : DebugMode.NONE,
    overrideSettings,
  };
  await game.init(gameOptions);

  ui.reportBootStage('game:init:done');

  ui.reportBootStage('game:run');
  game.run(() => {
    ui.reportBootStage('game:run:onStart');
    startLaunchScene(launchScene, sceneBaseUrl, ui)
      .catch((error: unknown) => ui.showError(error));
  });
}

function installGameInitStageLogger(ui: PreviewShellUi) {
  const eventNames = [
    Game.EVENT_PRE_BASE_INIT,
    Game.EVENT_POST_BASE_INIT,
    Game.EVENT_PRE_INFRASTRUCTURE_INIT,
    Game.EVENT_POST_INFRASTRUCTURE_INIT,
    Game.EVENT_PRE_SUBSYSTEM_INIT,
    Game.EVENT_POST_SUBSYSTEM_INIT,
    Game.EVENT_ENGINE_INITED,
    Game.EVENT_PRE_PROJECT_INIT,
    Game.EVENT_POST_PROJECT_INIT,
    Game.EVENT_GAME_INITED,
  ];
  for (const eventName of eventNames) {
    game.on(eventName, () => {
      ui.reportBootStage(`game:init:event:${eventName}`);
    });
  }
}

function createOverrideSettings(
  settings: CCPreviewSettings,
  launchSettings: CCPreviewSettings['launch'],
  config: SuperPreviewBootConfig,
): CCOverrideSettings {
  const serverRoot = `${config.serverOrigin}/`;
  const resourceUrls = settings.preview?.resourceUrls;
  const server = resourceUrls?.server ?? settings.assets?.server ?? '';
  const effectSettingsPath = settings.rendering?.effectSettingsPath;
  const rendering = {
    ...(settings.rendering ?? {}),
    effectSettingsPath: effectSettingsPath ? new URL(effectSettingsPath, serverRoot).href : effectSettingsPath,
  };
  const overrideSettings: CCOverrideSettings = {
    ...settings,
    assets: {
      ...(settings.assets ?? {}),
      importBase: new URL(resourceUrls?.importBase ?? config.assetsImportBaseUrl, serverRoot).href,
      nativeBase: new URL(resourceUrls?.nativeBase ?? config.assetsNativeBaseUrl, serverRoot).href,
      bundleBase: new URL(settings.assets?.bundleBase || 'assets/', serverRoot).href,
      remoteBundles: [...(resourceUrls?.remoteBundles ?? [])],
      subpackages: [...(resourceUrls?.subpackages ?? [])],
      server: new URL(server.endsWith('/') ? server : `${server}/`, serverRoot).href,
    },
    launch: {
      ...(launchSettings ?? {}),
      launchScene: '',
    },
    path: {
      ...(settings.path ?? {}),
      previewServer: config.previewServerUrl,
    },
    rendering,
  };
  overrideSettings.profiling = { ...(overrideSettings.profiling ?? {}) };
  overrideSettings.screen = { ...(overrideSettings.screen ?? {}) };
  return overrideSettings;
}
