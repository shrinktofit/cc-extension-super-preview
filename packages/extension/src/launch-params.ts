export type LaunchParams = Readonly<Record<string, string>>;

export interface PreviewOptions {
  debug: boolean;
  scene?: string;
  splashPreview: boolean;
  superPreviewDebug?: boolean;
}

export class PreviewParameterError extends Error {
  constructor(message: string) {
    super(`Super Preview URL parameter error: ${message}`);
    this.name = 'PreviewParameterError';
  }
}

export function parsePreviewRequestParams(url: URL) {
  const previewOptions: PreviewOptions = {
    debug: true,
    splashPreview: false,
  };
  const businessEntries: [string, string][] = [];
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith('--')) {
      businessEntries.push([key, value]);
      continue;
    }

    switch (key) {
    case '--scene':
      previewOptions.scene = value.trim() || undefined;
      break;
    case '--debug':
    case '--splashPreview':
    case '--superPreviewDebug':
      if (value !== 'true' && value !== 'false') {
        throw new PreviewParameterError(`${key} must be "true" or "false"; received ${JSON.stringify(value)}.`);
      }
      if (key === '--debug') {
        previewOptions.debug = value === 'true';
      } else if (key === '--splashPreview') {
        previewOptions.splashPreview = value === 'true';
      } else {
        previewOptions.superPreviewDebug = value === 'true';
      }
      break;
    default:
      throw new PreviewParameterError(`Unknown preview option ${JSON.stringify(key)}. Supported options: --scene, --splashPreview, --debug, --superPreviewDebug.`);
    }
  }
  return {
    launchParams: Object.freeze(Object.fromEntries(businessEntries)) as LaunchParams,
    previewOptions: Object.freeze(previewOptions),
  };
}

export function mergeLaunchParams(
  base: LaunchParams,
  overrides: LaunchParams,
): LaunchParams {
  return Object.freeze({
    ...base,
    ...overrides,
  });
}
