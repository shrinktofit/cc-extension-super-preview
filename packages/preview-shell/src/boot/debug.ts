import { launchParams } from './super-preview-runtime';

let superPreviewDebugLogging: boolean | undefined;

export function logSuperPreviewDebug(message: string, ...args: unknown[]) {
  if (!isSuperPreviewDebugLoggingEnabled()) {
    return;
  }

  console.info(message, ...args);
}

export function isSuperPreviewDebugLoggingEnabled() {
  superPreviewDebugLogging ??= (() => {
    try {
      return Object.hasOwn(launchParams, 'superPreviewDebug')
        || window.localStorage?.getItem('super-preview.debug') === '1';
    } catch {
      return false;
    }
  })();
  return superPreviewDebugLogging;
}
