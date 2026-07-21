import { getBootConfig } from './config';
import { installErrorHandlers } from './error-tools';
import { PreviewShellUi } from './shell-ui';

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

  ui.reportBootStage('system:import-cc');
  await import('./cc');
  ui.reportBootStage('system:import-cc:done');

  const { bootEngineReady } = await import('./engine-ready');
  await bootEngineReady(ui, config);
}
