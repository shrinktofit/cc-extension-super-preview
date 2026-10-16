import type { CCPreviewSettings } from './engine-ready';

declare global {
  interface SuperPreviewSystemJs {
    constructor: { prototype: SuperPreviewSystemJs };
    resolve(specifier: string, parent?: string): string;
    instantiate(url: string, parent?: string): unknown;
    getRegister(): unknown;
    import: {
      (moduleName: 'cc'): Promise<typeof import('cc')>;
      (moduleName: 'super-preview'): Promise<typeof import('super-preview')>;
    };
    prepareImport?: (processScripts?: boolean) => Promise<void> | void;
  }

  interface Window {
    _CCSettings?: CCPreviewSettings;
    System?: SuperPreviewSystemJs;
  }

  var System: SuperPreviewSystemJs | undefined;
}

export {};
