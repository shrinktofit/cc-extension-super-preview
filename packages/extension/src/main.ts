import { URL } from 'node:url';
import { superPreviewRoutePrefix } from './constants.js';
import { extnameMap } from './contributions/server/extname-map.js';
import { logger } from './logger.js';
import { selfExtensionName } from './self-info.js';

export const methods = {
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
  extnameMap.dispose();
  logger.info(`${selfExtensionName} unloaded`);
}
