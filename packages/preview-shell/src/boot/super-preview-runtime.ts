type SuperPreviewRuntime = typeof import('super-preview');

let runtime: SuperPreviewRuntime;
if (HTMLScriptElement.supports?.('importmap')) {
  runtime = await import('super-preview');
} else {
  const system = globalThis.System;
  if (!system) {
    throw new Error('[Super Preview] SystemJS is not available');
  }
  runtime = await system.import('super-preview');
}

export const launchParams = runtime.launchParams;
