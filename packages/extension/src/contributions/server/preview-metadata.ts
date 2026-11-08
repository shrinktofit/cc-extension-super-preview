import { URL } from 'node:url';
import { superPreviewRoutePrefix } from '../../constants.js';
import type { LaunchParams, PreviewOptions } from '../../launch-params.js';
import { logger } from '../../logger.js';
import { writeServerDiagnosticLog } from './diagnostic-log.js';
import { currentScene } from '../../scene-protocol.js';
import type { Request } from 'express';

export interface EngineImportMap {
  imports: Record<string, string | null>;
}

export interface EngineSessionInfo {
  importMapURL: string;
}

export interface PreviewMetadata {
  assetsImportBaseUrl: string;
  assetsNativeBaseUrl: string;
  engineImportMap: EngineImportMap;
  engineSession: EngineSessionInfo;
  globalImportMapUrl: string;
  launchParams: LaunchParams;
  launchScene: string;
  packImportMapUrl: string;
  packResolutionDetailMapUrl: string;
  polyfillsUrl: string;
  previewServerUrl: string;
  previewOptions: Readonly<PreviewOptions>;
  routePrefix: string;
  serverOrigin: string;
  settingsJsUrl: string;
  systemJsUrl: string;
  webAppManifestUrl: string;
}

interface PreviewServerResources {
  globalImportMapPath: string;
  packImportMapPath: string;
  packResolutionDetailMapPath: string;
  settingsJsPath: string;
}

export async function createPreviewMetadata(
  request: Request,
  requestedScene: string | undefined,
  launchParams: LaunchParams,
  previewOptions: Readonly<PreviewOptions>,
): Promise<PreviewMetadata> {
  const serverOrigin = inferServerOrigin(request);
  const launchScene = await selectLaunchScene(requestedScene);
  const { splashPreview } = previewOptions;
  const resources = createPreviewServerResources(launchScene, splashPreview);
  const { importMap: engineImportMap, session: engineSession } = await queryEngineSession(serverOrigin, previewOptions.debug);
  const previewServerUrl = `${serverOrigin}/${superPreviewRoutePrefix}`;
  const webAppManifestUrl = createPreviewRequestUrl(request);
  webAppManifestUrl.pathname = `${webAppManifestUrl.pathname.replace(/\/$/u, '')}/manifest.webmanifest`;

  logger.debug(
    `preview metadata request: origin=${serverOrigin}, scene=${launchScene}, settings=${resources.settingsJsPath}, engine=${engineSession.importMapURL}`,
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
    engineImportMap,
    engineSession,
    globalImportMapUrl: toServerUrl(resources.globalImportMapPath, serverOrigin),
    launchParams,
    launchScene,
    packImportMapUrl: toServerUrl(resources.packImportMapPath, serverOrigin),
    packResolutionDetailMapUrl: toServerUrl(resources.packResolutionDetailMapPath, serverOrigin),
    polyfillsUrl: `${serverOrigin}/scripting/polyfills/bundle.js`,
    previewServerUrl,
    previewOptions,
    routePrefix: superPreviewRoutePrefix,
    serverOrigin,
    settingsJsUrl: toServerUrl(resources.settingsJsPath, serverOrigin),
    systemJsUrl: `${serverOrigin}/scripting/systemjs/system.js`,
    webAppManifestUrl: webAppManifestUrl.href,
  };
}

async function queryEngineSession(
  serverOrigin: string,
  debug: boolean,
): Promise<{ importMap: EngineImportMap; session: EngineSessionInfo }> {
  const searchParams = new URLSearchParams({
    flags: `DEBUG:${debug}`,
    mode: 'PREVIEW',
    platform: 'HTML5',
  });
  const sessionUrl = `${serverOrigin}/scripting/engine/development/session?${searchParams}`;
  try {
    const session = await fetchJson(sessionUrl) as EngineSessionInfo;
    const importMapURL = new URL(session.importMapURL, `${serverOrigin}/`).href;
    const importMap = await fetchJson(importMapURL) as EngineImportMap;
    return { importMap, session: { importMapURL } };
  } catch (error) {
    throw new Error(
      `Super Preview requires an engine with a universal ESM output: ${String(error)}`,
    );
  }
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  return response.json();
}


async function selectLaunchScene(scene: string | undefined) {
  const requestedScene = scene?.trim();
  const configuredScene = requestedScene
    ? undefined
    : await Editor.Profile.getConfig('super-preview', 'selectedScene', 'local');
  return requestedScene
    || (typeof configuredScene === 'string' && configuredScene.trim())
    || currentScene;
}

function createPreviewServerResources(
  launchScene: string,
  splashPreview: boolean,
): PreviewServerResources {
  return {
    globalImportMapPath: '/scripting/import-map-global',
    packImportMapPath: '/scripting/x/import-map.json',
    packResolutionDetailMapPath: '/scripting/x/resolution-detail-map.json',
    settingsJsPath: createSettingsJsPath(launchScene, splashPreview),
  };
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

function firstHeaderValue(request: Request, name: string): string | undefined {
  const value = request.header?.(name)
    ?? request.get?.(name)
    ?? request.headers?.[name]
    ?? request.headers?.[name.toLowerCase()];

  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized?.split(',', 1)[0]?.trim() || undefined;
}

export function createPreviewRequestUrl(request: Request) {
  const serverOrigin = inferServerOrigin(request);
  return new URL(request.originalUrl ?? request.url, `${serverOrigin}/`);
}

function toServerUrl(value: string, serverOrigin: string) {
  return new URL(value, `${serverOrigin}/`).href;
}
