import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { superPreviewRoutePrefix } from '../../constants.js';
import { selfExtensionName } from '../../self-info.js';

type DiagnosticLogLevel = 'debug' | 'error' | 'info' | 'warn';

interface DiagnosticLogRecord {
  event: string;
  level: DiagnosticLogLevel;
  payload?: unknown;
  time: string;
}

const maxDepth = 5;
const maxArrayItems = 30;
const maxObjectKeys = 60;

export function writeServerDiagnosticLog(
  level: DiagnosticLogLevel,
  event: string,
  payload?: unknown,
) {
  const filePath = getServerDiagnosticLogPath();
  if (!filePath) {
    return;
  }

  const record: DiagnosticLogRecord = {
    event,
    level,
    payload: sanitizeLogValue(payload),
    time: new Date().toISOString(),
  };

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    console.warn(`[${selfExtensionName}] failed to write server diagnostic log`, error);
  }
}

export function formatErrorForDiagnosticLog(error: unknown) {
  return sanitizeLogValue(error);
}

function getServerDiagnosticLogPath() {
  const projectPath = Editor.Project.path;
  if (typeof projectPath !== 'string' || !projectPath) {
    return undefined;
  }

  return join(projectPath, 'temp', superPreviewRoutePrefix, 'logs', `${formatDate(new Date())}.log`);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    const cause = 'cause' in value
      ? (value as { cause?: unknown }).cause
      : undefined;
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
      stack: value.stack ? redactSensitiveString(value.stack) : undefined,
      cause: depth < maxDepth ? sanitizeLogValue(cause, depth + 1) : '[truncated]',
    };
  }

  if (depth >= maxDepth) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, maxArrayItems)
      .map((item) => sanitizeLogValue(item, depth + 1));
    if (value.length > maxArrayItems) {
      items.push(`[${value.length - maxArrayItems} more]`);
    }
    return items;
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries.slice(0, maxObjectKeys)) {
      output[key] = isSensitiveKey(key)
        ? '[redacted]'
        : sanitizeLogValue(item, depth + 1);
    }
    if (entries.length > maxObjectKeys) {
      output.__truncatedKeys = entries.length - maxObjectKeys;
    }
    return output;
  }

  return String(value);
}

function isSensitiveKey(key: string) {
  return /token|secret|password|authorization/iu.test(key);
}

function redactSensitiveString(value: string) {
  return value.replace(/(authorization:\s*)(?:bearer\s+)?[^\s,;]+/giu, '$1[redacted]');
}
