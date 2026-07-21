export interface SuperPreviewBootConfig {
  assetsImportBaseUrl: string;
  assetsNativeBaseUrl: string;
  packResolutionDetailMapUrl: string;
  previewServerUrl: string;
  serverOrigin: string;
}

export function getBootConfig() {
  const config = window.__SUPER_PREVIEW_BOOT_CONFIG__;
  if (!config) {
    throw new Error('Super Preview boot config was not injected');
  }
  return config;
}
