import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';
import { enginePreviewRoutePrefix, superPreviewRoutePrefix } from '../../constants.js';
import type { LaunchParams, PreviewOptions } from '../../launch-params.js';
import { logger } from '../../logger.js';
import { writeServerDiagnosticLog } from './diagnostic-log.js';
import { queryEnginePreviewRoot } from './engine-preview.js';
import type { Request } from 'express';

export interface PreviewMetadata {
  assetsImportBaseUrl: string;
  assetsNativeBaseUrl: string;
  engineBundleUrl: string;
  engineImportMapUrl: string;
  engineImportGuide?: {
    url: string;
    options: {
      platform: string;
      mode: string;
      features: readonly string[];
      flags: Readonly<Record<string, boolean | number>>;
    };
  };
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
  engineBundlePath: string;
  engineImportMapPath: string;
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
  const enginePreviewRoot = await queryEnginePreviewRoot();
  let engineImportGuide: PreviewMetadata['engineImportGuide'];
  if (existsSync(join(enginePreviewRoot, 'import-guide.js'))) {
    const environment = { platform: 'HTML5', mode: 'PREVIEW', flags: { DEBUG: previewOptions.debug } };
    const profile = await Editor.Message.request('engine', 'query-engine-modules-profile', undefined, environment) as {
      includeModules: string[];
    };
    engineImportGuide = {
      // The editor's engine asset loader recognizes this base for engine_external redirects.
      url: `${serverOrigin}/scripting/engine/import-guide.js`,
      options: { ...environment, features: profile.includeModules },
    };
  }
  const previewServerUrl = `${serverOrigin}/${superPreviewRoutePrefix}`;
  const webAppManifestUrl = createPreviewRequestUrl(request);
  webAppManifestUrl.pathname = `${webAppManifestUrl.pathname.replace(/\/$/u, '')}/manifest.webmanifest`;

  logger.debug(
    `preview metadata request: origin=${serverOrigin}, scene=${launchScene}, settings=${resources.settingsJsPath}, engine=${engineImportGuide?.url ?? resources.engineBundlePath}`,
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
    engineImportGuide,
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

async function selectLaunchScene(scene: string | undefined) {
  const requestedScene = scene?.trim();
  const configuredScene = requestedScene
    ? undefined
    : await Editor.Profile.getConfig('preview', 'general.start_scene');
  return requestedScene
    || (typeof configuredScene === 'string' && configuredScene.trim())
    || 'current_scene';
}

function createPreviewServerResources(
  launchScene: string,
  splashPreview: boolean,
): PreviewServerResources {
  const enginePreviewBasePath = `/${enginePreviewRoutePrefix}`;
  return {
    engineBundlePath: `${enginePreviewBasePath}/bundled/index.js`,
    engineImportMapPath: `${enginePreviewBasePath}/import-map.json`,
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
