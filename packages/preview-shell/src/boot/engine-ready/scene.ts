import { assetManager, director, game } from 'cc';
import type { SceneAsset } from 'cc';
import { formatErrorMessage } from '../error-tools';
import type { PreviewShellUi } from '../shell-ui';

type SceneJson = Record<string, unknown> & {
  1?: { _id?: unknown };
};

export async function startLaunchScene(
  launchScene: string,
  sceneBaseUrl: string,
  ui: PreviewShellUi,
) {
  ui.reportBootStage(`scene:start:${launchScene}`);
  ui.showLoading();
  game.pause();

  ui.reportBootStage(`scene:fetch-json:${launchScene}`);
  const sceneJson = await fetchSceneJson(launchScene, sceneBaseUrl);
  const serializedAssetId = sceneJson[1]?._id;
  const assetId = typeof serializedAssetId === 'string'
    ? serializedAssetId
    : launchScene;

  ui.reportBootStage(`scene:loadWithJson:${launchScene}`);
  const sceneAsset = await new Promise<SceneAsset>((resolve, reject) => {
    assetManager.loadWithJson<SceneAsset>(
      sceneJson,
      { assetId },
      (finished, total) => ui.reportLoadProgress(finished, total),
      (loadError, sceneAsset) => {
        if (loadError) {
          ui.reportBootStage(`scene:loadWithJson:error:${formatErrorMessage(loadError)}`);
          reject(loadError);
          return;
        }

        resolve(sceneAsset);
      },
    );
  });

  const scene = sceneAsset.scene;
  if (!scene) {
    const error = new Error(`Loaded scene asset has no scene: ${launchScene}`);
    ui.reportBootStage(`scene:loadWithJson:error:${formatErrorMessage(error)}`);
    throw error;
  }

  scene.name = sceneAsset.name;
  await new Promise<void>((resolve, reject) => {
    director.runSceneImmediate(
      scene,
      () => game.resume(),
      (launchError) => {
        if (launchError) {
          ui.reportBootStage(`scene:launch:error:${formatErrorMessage(launchError)}`);
          reject(launchError);
          return;
        }

        ui.reportBootStage('scene:launch:done');
        ui.hideSplash();
        resolve();
      },
    );
  });
}

async function fetchSceneJson(launchScene: string, sceneBaseUrl: string) {
  // Keep a trailing slash so URL treats the scene base as a directory.
  const sceneJsonUrl = new URL(
    `${encodeURIComponent(launchScene)}.json`,
    `${sceneBaseUrl.replace(/\/+$/u, '')}/`,
  ).href;
  const response = await fetch(sceneJsonUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load scene JSON (${response.status}): ${sceneJsonUrl}`);
  }

  return await response.json() as SceneJson;
}
