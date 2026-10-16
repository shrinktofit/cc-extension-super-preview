import { join } from 'node:path';

export async function queryEnginePreviewRoot(): Promise<string> {
  const engineInfo = await Editor.Message.request('engine', 'query-engine-info') as {
    outputs?: { preview?: unknown };
    typescript?: { path?: unknown };
  } | undefined;
  const previewRoot = engineInfo?.outputs?.preview;
  if (typeof previewRoot === 'string' && previewRoot) {
    return previewRoot;
  }
  const sourceRoot = engineInfo?.typescript?.path;
  if (typeof sourceRoot !== 'string' || !sourceRoot) {
    throw new Error('engine query-engine-info did not include outputs.preview or typescript.path');
  }
  return join(sourceRoot, 'bin', '.cache', 'dev', 'preview');
}
