import { getSuperPreviewConfig } from '../config';

let superPreviewDebugLogging: boolean | undefined;

export function logSuperPreviewDebug(message: string, ...args: unknown[]) {
  if (!isSuperPreviewDebugLoggingEnabled()) {
    return;
  }

  console.info(message, ...args);
}

export function isSuperPreviewDebugLoggingEnabled() {
  superPreviewDebugLogging ??= (() => {
    const { superPreviewDebug } = getSuperPreviewConfig().previewOptions;
    if (superPreviewDebug !== undefined) {
      return superPreviewDebug;
    }
    try {
      return window.localStorage?.getItem('super-preview.debug') === '1';
    } catch {
      return false;
    }
  })();
  return superPreviewDebugLogging;
}
