import type { CCPreviewSettings } from './engine-ready';

declare global {
  interface SuperPreviewSystemJs {
    constructor: { prototype: SuperPreviewSystemJs };
    resolve(specifier: string, parent?: string): string;
    instantiate(url: string, parent?: string): unknown;
    getRegister(): unknown;
    register(deps: string[], declare: (exportFn: (module: object, value?: unknown) => unknown) => unknown): void;
    import: {
      (moduleName: 'cc'): Promise<typeof import('cc')>;
      (moduleName: 'pal/screen-adapter/web'): Promise<{
        screenAdapter: {
          bindHost(host: { frame: HTMLDivElement; container: HTMLDivElement }): void;
        };
      }>;
      (moduleName: 'super-preview'): Promise<typeof import('super-preview')>;
    };
    prepareImport?: (processScripts?: boolean) => Promise<void> | void;
    set(name: string, module: unknown): void;
  }

  interface Window {
    _CCSettings?: CCPreviewSettings;
    System?: SuperPreviewSystemJs;
  }

  var System: SuperPreviewSystemJs | undefined;
}

export {};
