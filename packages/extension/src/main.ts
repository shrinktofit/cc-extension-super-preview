import { URL } from 'node:url';
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
} from './preset-protocol.js';
import { selfExtensionName } from './self-info.js';

const presetRegistry = new PresetRegistry();

export const contributions = presetRegistry.contributions;

export const methods = {
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

  async open() {
    const previewBaseUrl = await Editor.Message.request('preview', 'query-preview-url');
    if (typeof previewBaseUrl !== 'string' || !previewBaseUrl) {
      throw new Error('preview query-preview-url did not return a URL');
    }

    const previewUrl = new URL(`/${superPreviewRoutePrefix}`, `${previewBaseUrl.replace(/\/+$/u, '')}/`);
    Editor.Message.send('program', 'open-url', previewUrl.href);
  },
};

export function load() {
  logger.info(`${selfExtensionName} loaded`);
}

export function unload() {
  presetRegistry.dispose();
  extnameMap.dispose();
  logger.info(`${selfExtensionName} unloaded`);
}
