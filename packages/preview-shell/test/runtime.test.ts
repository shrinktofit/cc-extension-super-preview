import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const businessParams = {
  scene: 'lobby', debug: 'false', superPreviewDebug: 'true', empty: '', serverPort: '12500',
};

function installConfigScript() {
  const configScript = document.createElement('script');
  configScript.id = 'super-preview-config';
  configScript.type = 'application/json';
  configScript.textContent = JSON.stringify({
    boot: {},
    launchParams: businessParams,
    previewOptions: { scene: 'preview-scene', debug: true, superPreviewDebug: false, splashPreview: true },
  });
  document.body.replaceChildren(configScript);
}

describe('Super Preview runtime launch parameters', () => {
  beforeEach(() => {
    installConfigScript();
  });

  afterEach(() => {
    delete (window as { System?: unknown }).System;
  });

  it('exports only immutable business strings through native ESM', async () => {
    /// @case
    /// 1. The embedded configuration contains preview options and same-named business parameters.
    /// 2. The game imports the runtime module through native ESM.
    /// @expect
    /// Only launchParams is exported, preserving business strings without leaking preview options.
    const exports = await import('../src/runtime');

    expect(Object.keys(exports)).toEqual(['launchParams']);
    expect(exports.launchParams).toEqual(businessParams);
    expect(Object.isFrozen(exports.launchParams)).toBe(true);
  });

  it('exports only immutable business strings through SystemJS', async () => {
    /// @case
    /// 1. The embedded configuration contains preview options and same-named business parameters.
    /// 2. The game imports the runtime module through the SystemJS runtime script.
    /// @expect
    /// Only launchParams is exported, preserving business strings without leaking preview options.
    const exports: Record<string, unknown> = {};
    window.System = {
      register: (_dependencies: string[], declare: (exportFn: (name: string, value: unknown) => void) => { execute: () => void }) => {
        declare((name: string, value: unknown) => {
          exports[name] = value;
        }).execute();
      },
    } as unknown as typeof window.System;

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/assets/runtime.system.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('runtime.system.js failed to load'));
      document.body.append(script);
    });

    expect(Object.keys(exports)).toEqual(['launchParams']);
    expect(exports.launchParams).toEqual(businessParams);
    expect(Object.isFrozen(exports.launchParams)).toBe(true);
  });
});
