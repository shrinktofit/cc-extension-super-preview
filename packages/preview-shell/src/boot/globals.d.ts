import type { CCPreviewSettings } from './engine-ready';

declare global {
  interface SuperPreviewSystemJs {
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
