import { format as prettyFormat } from 'pretty-format';
import type { PreviewShellUi } from './shell-ui';

export interface ErrorInfo {
  message: string;
  stack: string;
}

export function installErrorHandlers(ui: PreviewShellUi) {
  window.addEventListener('error', (error) => {
    if (error.message?.includes('debug-evaluate')) {
      return;
    }
    ui.showError(error);
  }, true);

  window.addEventListener('unhandledrejection', (error) => {
    ui.showError(error);
  }, true);
}

export function formatErrorMessage(error: unknown) {
  if (!error) {
    return '';
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    return typeof record.message === 'string' ? record.message : prettyFormatErrorObject(error);
  }

  return String(error);
}

export function toErrorInfo(error: unknown): ErrorInfo {
  const value = typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent && error.error
    ? error.error
    : typeof PromiseRejectionEvent !== 'undefined' && error instanceof PromiseRejectionEvent
      ? error.reason
      : error;

  if (value instanceof Event) {
    const target = value.target;
    let source = '';
    if (target && typeof target === 'object') {
      source = 'src' in target && typeof target.src === 'string' ? target.src : '';
      source ||= 'href' in target && typeof target.href === 'string' ? target.href : '';
    }
    if (source) {
      return { message: `Get ${source} failed!`, stack: '' };
    }
  }

  if (value instanceof Error) {
    return { message: value.message, stack: value.stack ?? '' };
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const message = typeof record.message === 'string'
      ? record.message
      : prettyFormatErrorObject(value);
    const stack = typeof record.stack === 'string' ? record.stack : '';
    return { message, stack };
  }

  return { message: String(value), stack: '' };
}

function prettyFormatErrorObject(value: object) {
  return prettyFormat(value, {
    callToJSON: false,
    maxDepth: 2,
    maxWidth: 20,
    printFunctionName: true,
  });
}
