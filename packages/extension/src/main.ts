import { URL } from 'node:url';
import { parse } from 'node:path';
import { superPreviewRoutePrefix } from './constants.js';
import { extnameMap } from './contributions/server/extname-map.js';
import { logger } from './logger.js';
import {
  PresetConflictError,
  PresetNotFoundError,
  PresetRegistry,
} from './preset-registry.js';
import {
  PresetLaunchParamsErrorCode,
  type EvaluatePresetLaunchParamsRequest,
  type EvaluatePresetLaunchParamsResult,
  type PresetSelection,
} from './preset-protocol.js';
import { selfExtensionName } from './self-info.js';
import { currentScene, type SceneSelection } from './scene-protocol.js';

const presetRegistry = new PresetRegistry();
const sceneCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const contributions = presetRegistry.contributions;

export const methods = {
  async 'query-presets'(): Promise<PresetSelection> {
    const selectedPresetId = await Editor.Profile.getConfig('super-preview', 'selectedPresetId', 'local') as string | undefined;
    return {
      presets: presetRegistry.getPresets(),
      selectedPresetId: selectedPresetId || undefined,
    };
  },

  async 'select-preset'(presetId?: string) {
    if (presetId) {
      assertPresetAvailable(presetId);
    }
    await Editor.Profile.setConfig('super-preview', 'selectedPresetId', presetId ?? '', 'local');
    Editor.Message.broadcast('super-preview:presets-changed');
  },

  async 'query-scenes'(): Promise<SceneSelection> {
    const [assets, selectedScene] = await Promise.all([
      Editor.Message.request('asset-db', 'query-assets', {
        ccType: 'cc.SceneAsset',
        pattern: '!db://internal/default_file_content/**/*',
      }),
      Editor.Profile.getConfig('super-preview', 'selectedScene', 'local') as Promise<string | undefined>,
    ]);
    return {
      scenes: assets.map((asset) => ({
        uuid: asset.uuid,
        label: parse(asset.name).name,
        url: asset.url,
      })).sort((a, b) => sceneCollator.compare(a.label, b.label) || sceneCollator.compare(a.url, b.url)),
      selectedScene: selectedScene || currentScene,
    };
  },

  async 'select-scene'(scene: string) {
    await assertSceneAvailable(scene);
    await Editor.Profile.setConfig('super-preview', 'selectedScene', scene, 'local');
    Editor.Message.broadcast('super-preview:scenes-changed');
  },

  async 'evaluate-preset-launch-params'(
    request: EvaluatePresetLaunchParamsRequest,
  ): Promise<EvaluatePresetLaunchParamsResult> {
    try {
      const preset = await presetRegistry.evaluatePreset(
        request.presetId,
        {
          projectPath: Editor.Project.path,
          requestUrl: new URL(request.requestUrl),
        },
      );
      return {
        ...preset,
        ok: true,
      };
    } catch (error) {
      if (error instanceof PresetNotFoundError) {
        return {
          code: PresetLaunchParamsErrorCode.notFound,
          message: error.message,
          ok: false,
        };
      }
      if (error instanceof PresetConflictError) {
        return {
          code: PresetLaunchParamsErrorCode.conflict,
          message: error.message,
          ok: false,
        };
      }
      throw error;
    }
  },

  async 'query-preview-url'() {
    const selectedPresetId = await Editor.Profile.getConfig('super-preview', 'selectedPresetId', 'local') as string | undefined;
    if (selectedPresetId) {
      assertPresetAvailable(selectedPresetId);
    }
    const selectedScene = await Editor.Profile.getConfig('super-preview', 'selectedScene', 'local') as string | undefined;
    await assertSceneAvailable(selectedScene || currentScene);
    const previewBaseUrl = await Editor.Message.request('preview', 'query-preview-url');
    if (typeof previewBaseUrl !== 'string' || !previewBaseUrl) {
      throw new Error('preview query-preview-url did not return a URL');
    }

    const previewPath = selectedPresetId
      ? `/${superPreviewRoutePrefix}/presets/${selectedPresetId}`
      : `/${superPreviewRoutePrefix}`;
    const previewUrl = new URL(previewPath, `${previewBaseUrl.replace(/\/+$/u, '')}/`);
    return previewUrl.href;
  },

  async open() {
    Editor.Message.send('program', 'open-url', await methods['query-preview-url']());
  },

  'copy-preview-url'(url: string) {
    Editor.Clipboard.write('text', url);
  },
};

async function assertSceneAvailable(scene: string) {
  if (scene === currentScene) {
    return;
  }
  const asset = await Editor.Message.request('asset-db', 'query-asset-info', scene);
  if (!asset || asset.type !== 'cc.SceneAsset') {
    throw new Error(`场景已不可用：${scene}，请选择其他场景。`);
  }
}

function assertPresetAvailable(presetId: string) {
  const preset = presetRegistry.getPresets().find((entry) => entry.id === presetId);
  if (!preset) {
    throw new PresetNotFoundError(presetId);
  }
  if (preset.unavailableReason) {
    throw new Error(preset.unavailableReason);
  }
}

export function load() {
  logger.info(`${selfExtensionName} loaded`);
}

export function unload() {
  presetRegistry.dispose();
  extnameMap.dispose();
  logger.info(`${selfExtensionName} unloaded`);
}
