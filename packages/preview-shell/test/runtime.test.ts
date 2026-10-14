import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Super Preview runtime launch parameters', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['native ESM', 'SystemJS'])('exports only immutable business strings through %s', async (runtime) => {
    /// @case
    /// 1. The embedded configuration contains preview options and same-named business parameters.
    /// 2. The game imports the runtime module through either supported module system.
    /// @expect
    /// Only launchParams is exported, preserving business strings without leaking preview options.
    const businessParams = {
      scene: 'lobby', debug: 'false', superPreviewDebug: 'true', empty: '', serverPort: '12500',
    };
    const document = {
      querySelector: () => ({ textContent: JSON.stringify({
        boot: {},
        launchParams: businessParams,
        previewOptions: { scene: 'preview-scene', debug: true, superPreviewDebug: false, splashPreview: true },
      }) }),
    };
    vi.stubGlobal('document', document);

    let exports: Record<string, unknown>;
    if (runtime === 'native ESM') {
      exports = await import('../src/runtime');
    } else {
      exports = {};
      runInNewContext(readFileSync(new URL('../public/assets/runtime.system.js', import.meta.url), 'utf8'), {
        document,
        System: {
          register: (_dependencies: string[], declare: (exportValue: (name: string, value: unknown) => void) => { execute: () => void }) => {
            declare((name, value) => {
              exports[name] = value;
            }).execute();
          },
        },
      });
    }
    expect(Object.keys(exports)).toEqual(['launchParams']);
    expect(exports.launchParams).toEqual(businessParams);
    expect(Object.isFrozen(exports.launchParams)).toBe(true);
  });
});
