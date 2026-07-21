import type { SuperPreviewBootConfig } from './config';
import type { CCPreviewSettings } from './engine-ready';

declare global {
  interface Window {
    __SUPER_PREVIEW_BOOT_CONFIG__?: SuperPreviewBootConfig;
    _CCSettings?: CCPreviewSettings;
    System?: {
      import: (moduleName: 'cc') => Promise<typeof import('cc')>;
      prepareImport?: (processScripts?: boolean) => Promise<void> | void;
    };
  }
}

export {};
