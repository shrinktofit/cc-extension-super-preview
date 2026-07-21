import { superPreviewRoutePrefix } from '../../constants.js';
import { logger } from '../../logger.js';
import {
  formatErrorForDiagnosticLog,
  writeServerDiagnosticLog,
} from './diagnostic-log.js';
import { extnameMap } from './extname-map.js';
import { createPreviewMetadata } from './preview-metadata.js';
import {
  getPreviewShellErrorStatusCode,
  renderSuperPreviewHtml,
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
    handle: renderPreview,
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

async function renderPreview(request: Request, response: Response) {
  try {
    const metadata = await createPreviewMetadata(request);
    writeServerDiagnosticLog('info', 'preview-route-rendered', {
      launchScene: metadata.launchScene,
      requestUrl: request.originalUrl ?? request.url,
      serverOrigin: metadata.serverOrigin,
    });
    response
      .status(200)
      .type('text/html; charset=utf-8')
      .set('cache-control', 'no-store')
      .send(renderSuperPreviewHtml(metadata));
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

function handleServerError(request: Request, response: Response, error: unknown) {
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
