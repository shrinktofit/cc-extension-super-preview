import { DebugMode, Game, game } from 'cc';
import type { PreviewShellUi } from '../shell-ui';
import type { SuperPreviewBootConfig } from '../config';
import { installQueryExtnamePipe } from './query-extname';
import { startLaunchScene } from './scene';

export interface CCPreviewSettings extends Record<string, unknown> {
  assets?: Record<string, unknown>;
  launch?: Record<string, unknown> & { launchScene?: string };
  path?: Record<string, unknown>;
  profiling?: Record<string, unknown>;
  rendering?: Record<string, unknown> & { effectSettingsPath?: string };
  screen?: Record<string, unknown>;
}

type CCOverrideSettings = import('cc').IGameConfig['overrideSettings'] & CCPreviewSettings;

export async function bootEngineReady(
  ui: PreviewShellUi,
  config: SuperPreviewBootConfig,
  launchParams: Readonly<Record<string, string>>,
) {
  installGameInitStageLogger(ui);

  const settings = window._CCSettings ?? {};
  const launchSettings = { ...(settings.launch ?? {}) };
  const launchScene = launchSettings.launchScene
    ?? 'current_scene';
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

  ui.reportBootStage('game:init');
  await game.init({
    debugMode: launchParams.debug === 'false' ? DebugMode.NONE : DebugMode.INFO,
    overrideSettings,
  });

  ui.reportBootStage('game:init:done');

  ui.reportBootStage('game:run');
  game.run(() => {
    ui.reportBootStage('game:run:onStart');
    startLaunchScene(launchScene, config.serverOrigin, ui)
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
  const effectSettingsPath = settings.rendering?.effectSettingsPath;
  const absoluteEffectSettingsPath = effectSettingsPath
    && (/^[a-z][a-z0-9+.-]*:/iu.test(effectSettingsPath) || effectSettingsPath.startsWith('//'));
  const rendering = {
    ...(settings.rendering ?? {}),
    effectSettingsPath: !effectSettingsPath || absoluteEffectSettingsPath
      ? effectSettingsPath
      : effectSettingsPath.startsWith('/')
        ? `${config.serverOrigin}${effectSettingsPath}`
        : `${config.serverOrigin}/${effectSettingsPath.replace(/^(?:\.\/)+/u, '')}`,
  };
  const overrideSettings: CCOverrideSettings = {
    ...settings,
    assets: {
      ...(settings.assets ?? {}),
      importBase: config.assetsImportBaseUrl,
      nativeBase: config.assetsNativeBaseUrl,
      remoteBundles: [],
      subpackages: [],
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
