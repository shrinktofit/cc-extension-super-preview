import { superPreviewRoutePrefix } from '../../constants.js';
import { logger } from '../../logger.js';
import {
  formatErrorForDiagnosticLog,
  writeServerDiagnosticLog,
} from './diagnostic-log.js';
import { extnameMap } from './extname-map.js';
import {
  handleDefaultPresetRequest,
  handlePresetRequest,
} from './preset-route.js';
import {
  getPreviewShellErrorStatusCode,
  renderSuperPreviewWebAppManifest,
  sendSuperPreviewShellAsset,
} from './preview-shell.js';
import type { NextFunction, Request, Response } from 'express';

const genericServerError = 'Super Preview server error. See editor diagnostics log for details.';
const shellAssetRoute = /^\/super-preview\/(assets\/.+)$/u;

interface ServerGetRoute {
  handle: (request: Request, response: Response, next: NextFunction) => Promise<void> | void;
  url: RegExp | string;
}

export const get = [
  {
    url: `/${superPreviewRoutePrefix}`,
    handle: handleDefaultPresetRequest,
  },
  {
    url: /^\/super-preview\/preset-([a-z0-9][a-z0-9-]*)$/u,
    handle: handlePresetRequest,
  },
  {
    url: /^\/super-preview(?:\/preset-[a-z0-9][a-z0-9-]*)?\/manifest\.webmanifest$/u,
    handle: sendWebAppManifest,
  },
  {
    url: `/${superPreviewRoutePrefix}/query-extname-map.json`,
    handle: queryExtnameMap,
  },
  {
    url: shellAssetRoute,
    handle: sendShellAsset,
  },
] satisfies ServerGetRoute[];

function sendWebAppManifest(request: Request, response: Response) {
  try {
    response
      .status(200)
      .type('application/manifest+json; charset=utf-8')
      .set('cache-control', 'no-store')
      .send(renderSuperPreviewWebAppManifest(request));
  } catch (error) {
    handleServerError(request, response, error);
  }
}

async function queryExtnameMap(request: Request, response: Response) {
  try {
    response
      .status(200)
      .type('application/json; charset=utf-8')
      .set('cache-control', 'no-store')
      .json(await extnameMap.getSnapshot());
  } catch (error) {
    handleServerError(request, response, error);
  }
}

function sendShellAsset(request: Request, response: Response) {
  const [assetPath = ''] = request.params as unknown as string[];
  try {
    sendSuperPreviewShellAsset(response, assetPath);
  } catch (error) {
    logger.error('preview shell asset request failed', error);
    writeServerDiagnosticLog('error', 'preview-shell-asset-error', {
      error: formatErrorForDiagnosticLog(error),
      requestUrl: request.originalUrl ?? request.url,
    });
    const statusCode = getPreviewShellErrorStatusCode(error);
    response
      .status(statusCode)
      .type('application/json; charset=utf-8')
      .set('cache-control', 'no-store')
      .json({
        ok: false,
        error: statusCode >= 500
          ? genericServerError
          : error instanceof Error ? error.message : String(error),
      });
  }
}

function handleServerError(
  request: Request,
  response: Response,
  error: unknown,
) {
  logger.error('server request failed', error);
  writeServerDiagnosticLog('error', 'server-route-error', {
    error: formatErrorForDiagnosticLog(error),
    method: request.method,
    requestUrl: request.originalUrl ?? request.url,
  });
  response
    .status(500)
    .type('text/plain; charset=utf-8')
    .set('cache-control', 'no-store')
    .send(genericServerError);
}
