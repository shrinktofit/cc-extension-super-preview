import { getBootConfig } from './config.js';
import { installErrorHandlers } from './error-tools.js';
import { installEsmSystemJsBridge } from './esm-systemjs-bridge.js';
import { PreviewShellUi } from './shell-ui.js';
import { getSuperPreviewConfig } from '../config.js';
import type { PreviewHost } from './preview-host.js';

if (document.readyState === 'loading') {
  window.addEventListener('load', startBoot);
} else {
  setTimeout(startBoot, 0);
}

function startBoot() {
  const host = document.querySelector<HTMLElement>('#super-preview-shell');
  if (!host) {
    throw new Error('Super Preview shell root was not found');
  }

  const shellUi = new PreviewShellUi(host);
  installErrorHandlers(shellUi);
  boot(shellUi).catch((error: unknown) => shellUi.showError(error));
}

async function boot(ui: PreviewShellUi) {
  ui.reportBootStage('boot:start');

  const config = getBootConfig();

  console.info('[Super Preview] Booting preview shell', {
    serverOrigin: config.serverOrigin,
    baseURI: document.baseURI,
    previewServerUrl: config.previewServerUrl,
  });

  ui.reportBootStage('system:bind-web-host');
  await bindWebHost(ui.getPreviewHost());

  ui.reportBootStage('system:setup-systemjs');
  await setupSystemJS();

  ui.reportBootStage('system:engine-ready');
  const { bootEngineReady } = await import('./engine-ready/index.js');
  ui.reportBootStage('system:engine-ready:done');
  await bootEngineReady(ui, config, getSuperPreviewConfig().previewOptions);
}

async function bindWebHost(host: PreviewHost) {
  const { screenAdapter } = await import('pal/screen-adapter/web');
  screenAdapter.bindHost({ container: host.container, frame: host.frame });
}

async function setupSystemJS() {
  const system = window.System;
  if (!system) {
    throw new Error('SystemJS was not loaded');
  }
  await system.prepareImport?.(true);

  // Project scripts keep importing engine modules through SystemJS.
  installEsmSystemJsBridge(system, ['cc', 'cc/env']);
}
