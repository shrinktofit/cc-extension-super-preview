import { createApp } from 'vue';
import PreviewShell from '../preview-shell.vue';
import { toErrorInfo } from './error-tools';
import type { ErrorInfo } from './error-tools';

interface PreviewShellComponent {
  hideSplash: () => void;
  reportBootStage: (stage: string) => void;
  reportLoadProgress: (finished: number, total: number) => void;
  showError: (info: ErrorInfo) => void;
  showLoading: () => void;
}

export class PreviewShellUi {
  constructor(host: HTMLElement) {
    this._component = createApp(PreviewShell).mount(host) as unknown as PreviewShellComponent;
  }

  hideSplash() {
    this._component.hideSplash();
  }

  reportBootStage(stage: string) {
    this._component.reportBootStage(stage);
  }

  reportLoadProgress(finished: number, total: number) {
    this._component.reportLoadProgress(finished, total);
  }

  showError(error: unknown) {
    const info = toErrorInfo(error);
    console.error('[Super Preview]', info.message, info.stack || '');
    this._component.showError(info);
    return info;
  }

  showLoading() {
    this._component.showLoading();
  }

  private readonly _component: PreviewShellComponent;
}
