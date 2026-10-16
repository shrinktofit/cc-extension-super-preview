import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { enginePreviewRoutePrefix, superPreviewRoutePrefix } from '../../constants.js';
import { logger } from '../../logger.js';
import {
  formatErrorForDiagnosticLog,
  writeServerDiagnosticLog,
} from './diagnostic-log.js';
import { extnameMap } from './extname-map.js';
import { queryEnginePreviewRoot } from './engine-preview.js';
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

const serverErrorPrefix = 'Super Preview server error';
const shellAssetRoute = /^\/super-preview\/(assets\/.+)$/u;
const engineResourceRoute = new RegExp(`^/${enginePreviewRoutePrefix}/(.+)$`, 'u');

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
    url: engineResourceRoute,
    handle: sendEngineResource,
  },
  {
    url: shellAssetRoute,
    handle: sendShellAsset,
  },
] satisfies ServerGetRoute[];

async function sendEngineResource(request: Request, response: Response) {
  // Express has already decoded the route parameter, including encoded separators.
  const assetPath = request.params[0] ?? '';
  const normalizedPath = assetPath.replaceAll('\\', '/');
  if (!normalizedPath || isAbsolute(normalizedPath) || normalizedPath.includes(':')
    || normalizedPath.includes('\0') || normalizedPath.split('/').includes('..')) {
    response.status(400).send('Unsafe engine preview resource path');
    return;
  }

  try {
    const root = await realpath(await queryEnginePreviewRoot());
    const filePath = await realpath(join(root, normalizedPath));
    const relativePath = relative(root, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      response.status(400).send('Engine preview resource escaped preview output');
      return;
    }

    response.set('cache-control', 'no-store').sendFile(filePath, { dotfiles: 'allow', cacheControl: false });
  } catch (error) {
    if (error instanceof Error && 'code' in error
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      response.status(404).send('Engine preview resource not found');
      return;
    }
    handleServerError(request, response, error);
  }
}

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
  const assetPath = request.params[0] ?? '';
  try {
    sendSuperPreviewShellAsset(response, assetPath);
  } catch (error) {
    logger.error('preview shell asset request failed', error);
    writeServerDiagnosticLog('error', 'preview-shell-asset-error', {
      error: formatErrorForDiagnosticLog(error),
      requestUrl: request.originalUrl ?? request.url,
    });
    const statusCode = getPreviewShellErrorStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);
    response
      .status(statusCode)
      .type('application/json; charset=utf-8')
      .set('cache-control', 'no-store')
      .json({
        ok: false,
        error: statusCode >= 500
          ? `${serverErrorPrefix}: ${message}`
          : message,
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
    .send(`${serverErrorPrefix}: ${error instanceof Error ? error.message : String(error)}`);
}
