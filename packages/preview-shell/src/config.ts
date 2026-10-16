export interface SuperPreviewBootConfig {
  assetsImportBaseUrl: string;
  assetsNativeBaseUrl: string;
  packResolutionDetailMapUrl: string;
  previewServerUrl: string;
  serverOrigin: string;
  engineImportGuide?: {
    url: string;
    options: {
      platform: string;
      mode: string;
      features: readonly string[];
      flags: Readonly<Record<string, boolean | number>>;
    };
  };
}

export interface SuperPreviewOptions {
  debug: boolean;
  scene?: string;
  splashPreview: boolean;
  superPreviewDebug?: boolean;
}

interface SuperPreviewConfig {
  boot: SuperPreviewBootConfig;
  launchParams: Readonly<Record<string, string>>;
  previewOptions: Readonly<SuperPreviewOptions>;
}

let config: SuperPreviewConfig | undefined;

export function getSuperPreviewConfig() {
  if (config) {
    return config;
  }

  const element = document.querySelector<HTMLScriptElement>('#super-preview-config');
  if (!element?.textContent) {
    throw new Error('[Super Preview] Config was not embedded');
  }

  try {
    config = JSON.parse(element.textContent) as SuperPreviewConfig;
  } catch (error) {
    throw new Error('[Super Preview] Embedded config is invalid', {
      cause: error,
    });
  }
  return config;
}
