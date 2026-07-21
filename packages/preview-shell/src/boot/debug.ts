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
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.has('superPreviewDebug')
        || window.localStorage?.getItem('super-preview.debug') === '1';
    } catch {
      return false;
    }
  })();
  return superPreviewDebugLogging;
}
