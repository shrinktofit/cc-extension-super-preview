import {
  mergeLaunchParams,
  parsePreviewRequestParams,
  PreviewParameterError,
  type LaunchParams,
} from '../../launch-params.js';
import { logger } from '../../logger.js';
import {
  PresetLaunchParamsErrorCode,
} from '../../preset-protocol.js';
import {
  formatErrorForDiagnosticLog,
  writeServerDiagnosticLog,
} from './diagnostic-log.js';
import {
  createPreviewMetadata,
  createPreviewRequestUrl,
} from './preview-metadata.js';
import { renderSuperPreviewHtml } from './preview-shell.js';
import type { Request, Response } from 'express';

interface ResolvedPreset {
  id: string;
  launchParams: LaunchParams;
  scene?: string;
}

const builtInPreset: ResolvedPreset = Object.freeze({
  id: 'default',
  launchParams: Object.freeze({}),
});
const genericServerError = 'Super Preview server error. See editor diagnostics log for details.';

export function handleDefaultPresetRequest(request: Request, response: Response) {
  return renderPreset(request, response);
}

export function handlePresetRequest(request: Request, response: Response) {
  const [presetId] = request.params as unknown as string[];
  return renderPreset(request, response, presetId);
}

async function renderPreset(
  request: Request,
  response: Response,
  presetId?: string,
) {
  const requestUrl = createPreviewRequestUrl(request);

  try {
    const { launchParams: urlLaunchParams, previewOptions } = parsePreviewRequestParams(requestUrl);
    let preset = builtInPreset;
    if (presetId) {
      const result = await Editor.Message.request(
        'super-preview',
        'evaluate-preset-launch-params',
        {
          presetId,
          requestUrl: requestUrl.href,
        },
      );
      if (!result.ok) {
        const statusCode = result.code === PresetLaunchParamsErrorCode.notFound
          ? 404
          : result.code === PresetLaunchParamsErrorCode.conflict
            ? 409
            : 500;
        handlePresetError(
          request,
          response,
          new Error(result.message),
          statusCode,
        );
        return;
      }
      preset = {
        id: presetId,
        launchParams: result.launchParams,
        scene: result.scene,
      };
    }
    const launchParams = mergeLaunchParams(
      preset.launchParams,
      urlLaunchParams,
    );
    const scene = previewOptions.scene ?? preset.scene;
    const metadata = await createPreviewMetadata(request, scene, launchParams, previewOptions);
    writeServerDiagnosticLog('info', 'preset-route-rendered', {
      launchScene: metadata.launchScene,
      packageProjectPath: Editor.Project.path,
      presetId: preset.id,
      requestUrl: requestUrl.href,
      serverOrigin: metadata.serverOrigin,
    });
    response
      .status(200)
      .type('text/html; charset=utf-8')
      .set('cache-control', 'no-store')
      .send(renderSuperPreviewHtml(metadata));
  } catch (error) {
    handlePresetError(request, response, error, error instanceof PreviewParameterError ? 400 : 500);
  }
}

function handlePresetError(
  request: Request,
  response: Response,
  error: unknown,
  statusCode: number,
) {
  logger.error('preset request failed', error);
  writeServerDiagnosticLog('error', 'preset-route-error', {
    error: formatErrorForDiagnosticLog(error),
    method: request.method,
    requestUrl: request.originalUrl ?? request.url,
  });
  response
    .status(statusCode)
    .type('text/plain; charset=utf-8')
    .set('cache-control', 'no-store')
    .send(statusCode >= 500
      ? genericServerError
      : error instanceof Error ? error.message : String(error));
}
