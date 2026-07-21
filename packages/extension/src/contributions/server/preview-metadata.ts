import {
  join,
  relative,
} from 'node:path';
import { URL } from 'node:url';
import { superPreviewRoutePrefix } from '../../constants.js';
import { logger } from '../../logger.js';
import { writeServerDiagnosticLog } from './diagnostic-log.js';
import type { Request } from 'express';

export interface PreviewMetadata {
  assetsImportBaseUrl: string;
  assetsNativeBaseUrl: string;
  engineBundleUrl: string;
  engineImportMapUrl: string;
  globalImportMapUrl: string;
  launchScene: string;
  packImportMapUrl: string;
  packResolutionDetailMapUrl: string;
  polyfillsUrl: string;
  previewServerUrl: string;
  routePrefix: string;
  serverOrigin: string;
  settingsJsUrl: string;
  systemJsUrl: string;
}

interface PreviewServerResources {
  engineBundlePath: string;
  engineImportMapPath: string;
  globalImportMapPath: string;
  packImportMapPath: string;
  packResolutionDetailMapPath: string;
  settingsJsPath: string;
}

export async function createPreviewMetadata(request: Request): Promise<PreviewMetadata> {
  const serverOrigin = inferServerOrigin(request);
  const launchScene = await resolveLaunchScene(request);
  const splashPreview = getRequestSearchParam(request, 'splashPreview') === 'true';
  const resources = await resolvePreviewServerResources(launchScene, splashPreview);
  const previewServerUrl = `${serverOrigin}/${superPreviewRoutePrefix}`;

  logger.debug(
    `preview metadata request: origin=${serverOrigin}, scene=${launchScene}, settings=${resources.settingsJsPath}, engine=${resources.engineBundlePath}`,
  );
  writeServerDiagnosticLog('info', 'preview-metadata-resolved', {
    launchScene,
    previewServerUrl,
    requestUrl: request.originalUrl ?? request.url,
    serverOrigin,
    settingsJsPath: resources.settingsJsPath,
    splashPreview,
  });

  return {
    assetsImportBaseUrl: `${serverOrigin}/assets/general/import`,
    assetsNativeBaseUrl: `${serverOrigin}/assets/general/native`,
    engineBundleUrl: toServerUrl(resources.engineBundlePath, serverOrigin),
    engineImportMapUrl: toServerUrl(resources.engineImportMapPath, serverOrigin),
    globalImportMapUrl: toServerUrl(resources.globalImportMapPath, serverOrigin),
    launchScene,
    packImportMapUrl: toServerUrl(resources.packImportMapPath, serverOrigin),
    packResolutionDetailMapUrl: toServerUrl(resources.packResolutionDetailMapPath, serverOrigin),
    polyfillsUrl: `${serverOrigin}/scripting/polyfills/bundle.js`,
    previewServerUrl,
    routePrefix: superPreviewRoutePrefix,
    serverOrigin,
    settingsJsUrl: toServerUrl(resources.settingsJsPath, serverOrigin),
    systemJsUrl: `${serverOrigin}/scripting/systemjs/system.js`,
  };
}

async function resolveLaunchScene(request: Request) {
  const requestedScene = getRequestSearchParam(request, 'scene')?.trim();
  const configuredScene = requestedScene
    ? undefined
    : await Editor.Profile.getConfig('preview', 'general.start_scene');
  return requestedScene
    || (typeof configuredScene === 'string' && configuredScene.trim())
    || 'current_scene';
}

async function resolvePreviewServerResources(
  launchScene: string,
  splashPreview: boolean,
): Promise<PreviewServerResources> {
  const enginePreviewBasePath = await queryEnginePreviewBasePath();
  return {
    engineBundlePath: `${enginePreviewBasePath}/bundled/index.js`,
    engineImportMapPath: `${enginePreviewBasePath}/import-map.json`,
    globalImportMapPath: '/scripting/import-map-global',
    packImportMapPath: '/scripting/x/import-map.json',
    packResolutionDetailMapPath: '/scripting/x/resolution-detail-map.json',
    settingsJsPath: createSettingsJsPath(launchScene, splashPreview),
  };
}

async function queryEnginePreviewBasePath() {
  const engineInfo = await Editor.Message.request('engine', 'query-engine-info') as unknown;
  if (!isRecord(engineInfo)) {
    throw new Error('engine query-engine-info did not return an object');
  }

  const typescriptInfo = engineInfo.typescript;
  if (!isRecord(typescriptInfo)) {
    throw new Error('engine query-engine-info did not include typescript info');
  }

  const engineRoot = typescriptInfo.path;
  if (typeof engineRoot !== 'string' || !engineRoot) {
    throw new Error('engine query-engine-info did not include typescript.path');
  }

  const outputs = engineInfo.outputs;
  const previewRoot = isRecord(outputs) ? outputs.preview : undefined;
  const engineDistRoot = typeof previewRoot === 'string' && previewRoot
    ? previewRoot
    : join(engineRoot, 'bin', '.cache', 'dev', 'preview');
  const relativeEngineDistRoot = relative(engineRoot, engineDistRoot).replace(/\\/gu, '/');

  if (!relativeEngineDistRoot || relativeEngineDistRoot.startsWith('../')) {
    throw new Error(`engine preview output must stay under engine root: ${engineDistRoot}`);
  }

  return `/scripting/engine/${relativeEngineDistRoot}`;
}

function createSettingsJsPath(launchScene: string, splashPreview: boolean) {
  const searchParams = new URLSearchParams({ scene: launchScene });
  if (splashPreview) {
    searchParams.set('splashPreview', 'true');
  }
  return `/settings.js?${searchParams.toString()}`;
}

function inferServerOrigin(request: Request) {
  const protocol = firstHeaderValue(request, 'x-forwarded-proto')
    ?? request.protocol;
  const host = firstHeaderValue(request, 'x-forwarded-host')
    ?? firstHeaderValue(request, 'host');

  if (!protocol || !host) {
    throw new Error('preview request did not include a protocol and host');
  }

  return `${protocol.replace(/:$/u, '')}://${host}`.replace(/\/+$/u, '');
}

function getRequestSearchParam(request: Request, name: string) {
  const queryValue = firstQueryStringValue(request.query?.[name]);
  if (queryValue !== undefined) {
    return queryValue;
  }

  const rawUrl = request.originalUrl ?? request.url;
  if (!rawUrl) {
    return undefined;
  }

  return new URL(rawUrl, 'http://super-preview.local').searchParams.get(name) ?? undefined;
}

function firstQueryStringValue(value: unknown) {
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return typeof normalizedValue === 'string'
    ? normalizedValue
    : undefined;
}

function firstHeaderValue(request: Request, name: string): string | undefined {
  const value = request.header?.(name)
    ?? request.get?.(name)
    ?? request.headers?.[name]
    ?? request.headers?.[name.toLowerCase()];

  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized?.split(',', 1)[0]?.trim() || undefined;
}

function toServerUrl(value: string, serverOrigin: string) {
  return new URL(value, `${serverOrigin}/`).href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
