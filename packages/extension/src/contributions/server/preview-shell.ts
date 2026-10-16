import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
} from 'node:path';
import { render as renderEjs } from 'ejs';
import { superPreviewRoutePrefix } from '../../constants.js';
import { createPreviewRequestUrl, type PreviewMetadata } from './preview-metadata.js';
import type { Request, Response } from 'express';

const previewShellPackageName = '@bsgames/cc-extension-super-preview-preview-shell';
const require = createRequire(__filename);

interface BootConfig {
  assetsImportBaseUrl: string;
  assetsNativeBaseUrl: string;
  packResolutionDetailMapUrl: string;
  previewServerUrl: string;
  serverOrigin: string;
}

interface SuperPreviewConfig {
  boot: BootConfig;
  launchParams: PreviewMetadata['launchParams'];
  previewOptions: PreviewMetadata['previewOptions'];
}

interface PreviewShellTemplateLocals {
  baseHref: string;
  bootScriptUrl: string;
  configJson: string;
  engineBundleUrl: string;
  engineImportMapUrl: string;
  globalImportMapUrl: string;
  packImportMapUrl: string;
  packResolutionDetailMapUrlJson: string;
  polyfillsUrl: string;
  projectName: string;
  runtimeImportMapJson: string;
  runtimeSystemImportMapJson: string;
  settingsJsUrl: string;
  styleUrls: string[];
  systemJsUrl: string;
  webAppManifestUrl: string;
}

interface PreviewShellManifestEntry {
  file: string;
  isEntry?: boolean;
}

type PreviewShellManifest = Record<string, PreviewShellManifestEntry>;

class PreviewShellAssetError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'PreviewShellAssetError';
  }
}

export function renderSuperPreviewHtml(metadata: PreviewMetadata) {
  const manifest = readPreviewShellManifest();
  const bootEntry = getManifestEntry(manifest, 'src/boot.ts');
  const runtimeEntry = getManifestEntry(manifest, 'src/runtime.ts');
  const templatePath = getPreviewShellTemplatePath();
  const template = readFileSync(templatePath, 'utf8');
  const config: SuperPreviewConfig = {
    boot: createBootConfig(metadata),
    launchParams: metadata.launchParams,
    previewOptions: metadata.previewOptions,
  };
  const locals: PreviewShellTemplateLocals = {
    baseHref: `${metadata.serverOrigin}/`,
    bootScriptUrl: toPreviewShellAssetUrl(metadata.serverOrigin, bootEntry.file),
    configJson: toScriptJson(config),
    engineBundleUrl: metadata.engineBundleUrl,
    engineImportMapUrl: metadata.engineImportMapUrl,
    globalImportMapUrl: metadata.globalImportMapUrl,
    packImportMapUrl: metadata.packImportMapUrl,
    packResolutionDetailMapUrlJson: toScriptJson(metadata.packResolutionDetailMapUrl),
    polyfillsUrl: metadata.polyfillsUrl,
    projectName: Editor.Project.name,
    runtimeImportMapJson: toScriptJson(
      createRuntimeImportMap(metadata.serverOrigin, runtimeEntry.file),
    ),
    runtimeSystemImportMapJson: toScriptJson(
      createRuntimeImportMap(metadata.serverOrigin, 'assets/runtime.system.js'),
    ),
    settingsJsUrl: metadata.settingsJsUrl,
    styleUrls: [toPreviewShellAssetUrl(metadata.serverOrigin, 'assets/style.css')],
    systemJsUrl: metadata.systemJsUrl,
    webAppManifestUrl: metadata.webAppManifestUrl,
  };

  return renderEjs(template, locals, { filename: templatePath });
}

export function renderSuperPreviewWebAppManifest(request: Request) {
  const requestUrl = createPreviewRequestUrl(request);
  const templatePath = resolvePreviewShellExport('manifest.webmanifest.ejs');
  const template = readFileSync(templatePath, 'utf8');
  return renderEjs(template, {
    projectName: Editor.Project.name,
    startUrl: `${requestUrl.pathname.slice(0, -'/manifest.webmanifest'.length)}${requestUrl.search}`,
    scope: `/${superPreviewRoutePrefix}`,
  }, { filename: templatePath });
}

function createRuntimeImportMap(serverOrigin: string, assetPath: string) {
  return {
    imports: {
      'super-preview': toPreviewShellAssetUrl(serverOrigin, assetPath),
    },
  };
}

export function sendSuperPreviewShellAsset(response: Response, assetPath: string) {
  const filePath = resolvePreviewShellAssetPath(assetPath);
  response
    .status(200)
    .type(getContentType(filePath))
    .set('cache-control', 'no-store')
    .send(readFileSync(filePath));
}

export function getPreviewShellErrorStatusCode(error: unknown) {
  return error instanceof PreviewShellAssetError ? error.statusCode : 500;
}

function createBootConfig(metadata: PreviewMetadata): BootConfig {
  return {
    assetsImportBaseUrl: metadata.assetsImportBaseUrl,
    assetsNativeBaseUrl: metadata.assetsNativeBaseUrl,
    packResolutionDetailMapUrl: metadata.packResolutionDetailMapUrl,
    previewServerUrl: metadata.previewServerUrl,
    serverOrigin: metadata.serverOrigin,
  };
}

function readPreviewShellManifest() {
  const manifestPath = getPreviewShellManifestPath();
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PreviewShellManifest;
}

function getManifestEntry(manifest: PreviewShellManifest, source: string) {
  const entry = manifest[source];
  if (!entry?.file) {
    throw new Error(`Preview shell manifest is missing entry: ${source}`);
  }

  return entry;
}

function resolvePreviewShellAssetPath(assetPath: string) {
  const root = getPreviewShellDistPath();
  const normalizedAssetPath = normalizeAssetPath(assetPath);
  if (!normalizedAssetPath.startsWith('assets/')) {
    throw new PreviewShellAssetError(`preview shell asset is not exported: ${normalizedAssetPath}`, 404);
  }

  const filePath = resolvePreviewShellAssetExport(normalizedAssetPath);
  assertPathInsideRoot(root, filePath);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new PreviewShellAssetError(`preview shell asset not found: ${normalizedAssetPath}`, 404);
  }

  return filePath;
}

function normalizeAssetPath(assetPath: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(assetPath).replaceAll('\\', '/').replace(/^\/+/u, '');
  } catch {
    throw new PreviewShellAssetError(`invalid preview shell asset path: ${assetPath}`, 400);
  }

  if (!decoded || decoded.includes('\0') || decoded.split('/').includes('..')) {
    throw new PreviewShellAssetError(`unsafe preview shell asset path: ${assetPath}`, 400);
  }

  return decoded;
}

function assertPathInsideRoot(rootPath: string, filePath: string) {
  const relativePath = relative(rootPath, filePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new PreviewShellAssetError('preview shell asset path escaped dist root', 400);
  }
}

function getPreviewShellTemplatePath() {
  return resolvePreviewShellExport('index.html.ejs');
}

function getPreviewShellManifestPath() {
  return resolvePreviewShellExport('manifest.json');
}

function getPreviewShellDistPath() {
  return dirname(getPreviewShellTemplatePath());
}

function resolvePreviewShellExport(subpath: string) {
  return require.resolve(`${previewShellPackageName}/${subpath}`);
}

function resolvePreviewShellAssetExport(assetPath: string) {
  try {
    return resolvePreviewShellExport(assetPath);
  } catch {
    throw new PreviewShellAssetError(`preview shell asset not found: ${assetPath}`, 404);
  }
}

function toPreviewShellAssetUrl(serverOrigin: string, assetPath: string) {
  const normalizedAssetPath = assetPath.replace(/^\/+/u, '');
  return `${serverOrigin}/${superPreviewRoutePrefix}/${normalizedAssetPath}?v=${getPreviewShellAssetVersion(normalizedAssetPath)}`;
}

function getPreviewShellAssetVersion(assetPath: string) {
  try {
    const filePath = resolvePreviewShellAssetPath(assetPath);
    const stat = statSync(filePath);
    return `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
  } catch {
    return '0';
  }
}

function getContentType(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
  case '.css':
    return 'text/css; charset=utf-8';
  case '.html':
    return 'text/html; charset=utf-8';
  case '.js':
  case '.mjs':
    return 'application/javascript; charset=utf-8';
  case '.json':
  case '.map':
    return 'application/json; charset=utf-8';
  default:
    return 'application/octet-stream';
  }
}

function toScriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}
