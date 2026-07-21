import { assetManager } from 'cc';
import type { AssetManager } from 'cc';
import type { SuperPreviewBootConfig } from '../config';

interface RequestItem {
  uuid: string;
  overrideUuid: string;
  isNative: boolean;
  ext: string;
  url: string;
}

export async function installQueryExtnamePipe(config: SuperPreviewBootConfig) {
  const extensions = await loadQueryExtnameMap(config);
  const pipe = (task: AssetManager.Task, done: (error?: Error | null) => void) => {
    const input = task.input as RequestItem[];
    task.output = input;
    for (const item of input) {
      if (!item.uuid || item.isNative) {
        continue;
      }

      const extension = lookupExtname(extensions, item.overrideUuid || item.uuid);
      if (!extension) {
        continue;
      }

      item.ext = extension;
      item.url = item.url.replace(/\.json$/u, extension);
    }
    done(null);
  };

  assetManager.pipeline.remove(1);
  assetManager.pipeline.insert(pipe, 1);
  assetManager.fetchPipeline.remove(1);
  assetManager.fetchPipeline.insert(pipe, 1);
}

async function loadQueryExtnameMap(config: SuperPreviewBootConfig) {
  const response = await fetch(`${config.previewServerUrl}/query-extname-map.json`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`query-extname map returned ${response.status} ${response.statusText}`);
  }

  const snapshot = await response.json() as { extensions?: unknown; revision?: unknown };
  if (!snapshot.extensions || typeof snapshot.extensions !== 'object') {
    throw new Error('query-extname map has invalid extensions field');
  }

  const extensions = snapshot.extensions as Record<string, string>;
  console.info(
    `[Super Preview] query-extname map loaded revision=${String(snapshot.revision ?? 'unknown')} entries=${Object.keys(extensions).length}`,
  );
  return extensions;
}

function lookupExtname(extensions: Record<string, string>, uuid: string) {
  const exact = extensions[uuid];
  if (typeof exact === 'string') {
    return exact;
  }

  const rootUuid = uuid.split('@', 1)[0];
  const root = extensions[rootUuid];
  return typeof root === 'string' ? root : '';
}
