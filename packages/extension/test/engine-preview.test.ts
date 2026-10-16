import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';

const messageRequest = vi.fn();
vi.stubGlobal('Editor', {
  Message: { request: messageRequest },
  Profile: { getConfig: async () => undefined },
  Project: { name: 'Engine preview test', path: '' },
});

const { get } = await import('../src/contributions/server/index.js');

describe('Engine preview resources served through Super Preview HTTP routes', () => {
  let workspace: string;
  let server: Server;
  let origin: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'super-preview-engine-'));
    messageRequest.mockReset();
    const app = express();
    for (const route of get) {
      app.get(route.url, route.handle);
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((accept) => server.once('listening', accept));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP listener');
    }
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    Reflect.set(Editor.Project, 'path', '');
    await new Promise<void>((accept, reject) => {
      server.close((error) => error ? reject(error) : accept());
      server.closeAllConnections();
    });
    await rm(workspace, { force: true, recursive: true });
  });

  it.each([
    ['preset', '/super-preview/preset-broken', 'preset-route-error'],
    ['engine', '/super-preview/engine/import-map.json', 'server-route-error'],
  ])('shows the real %s error after the server error prefix and keeps its stack in diagnostics', async (_surface, path, event) => {
    /// @case
    /// 1. An editor request fails while serving a preset or engine resource over HTTP.
    /// @expect
    /// The response is uncached plain text with the server error prefix and real message, while diagnostics retain the complete stack.
    const error = new Error('preview output unavailable: <engine>');
    messageRequest.mockRejectedValue(error);
    Reflect.set(Editor.Project, 'path', workspace);
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(`Super Preview server error: ${error.message}`);
    const logDirectory = join(workspace, 'temp', 'super-preview', 'logs');
    const [logFile] = await readdir(logDirectory);
    const records = (await readFile(join(logDirectory, logFile), 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line) as {
        event: string;
        payload: { error: { message: string; stack: string } };
      });
    expect(records.find((record) => record.event === event)?.payload.error).toMatchObject({
      message: error.message,
      stack: error.stack,
    });
  });

  it.each(['independent', 'other-drive', 'nested', 'same', 'legacy'])(
    'loads the engine import map, bundle and relative resources with %s output',
    async (layout) => {
      /// @case
      /// 1. The editor reports preview output outside, on a different drive from, inside, or at the source root, or omits outputs on older versions.
      /// 2. A browser follows the page's engine script URLs and the import map's relative resource URLs.
      /// @expect
      /// All engine files load from the declared preview directory without source-relative URL traversal.
      const sourceRoot = layout === 'other-drive' ? 'Z:\\source\\engine' : join(workspace, 'vendor', 'engine');
      const previewRoot = layout === 'independent' || layout === 'other-drive'
        ? join(workspace, 'separate build #1', 'preview')
        : layout === 'same' ? sourceRoot : join(sourceRoot, 'bin', '.cache', 'dev', 'preview');
      messageRequest.mockResolvedValue({
        typescript: { path: sourceRoot },
        outputs: layout === 'legacy' ? undefined : { preview: previewRoot },
      });
      const files = {
        'import-map.json': JSON.stringify({ imports: { cc: './chunks/cc.js' } }),
        'bundled/index.js': 'System.register([], function () {});',
        'chunks/cc.js': 'export const engine = true;',
        'assets/engine.wasm': Buffer.from([0, 97, 115, 109]),
        'bundled/index.js.map': '{"version":3}',
      };
      for (const [name, content] of Object.entries(files)) {
        await mkdir(join(previewRoot, name, '..'), { recursive: true });
        await writeFile(join(previewRoot, name), content);
      }

      const page = await fetch(`${origin}/super-preview`);
      expect(page.status).toBe(200);
      const html = await page.text();
      for (const name of ['import-map.json', 'bundled/index.js']) {
        expect(html).toContain(`${origin}/super-preview/engine/${name}`);
      }
      const importMapUrl = `${origin}/super-preview/engine/import-map.json`;
      const importMapResponse = await fetch(importMapUrl);
      expect(importMapResponse.status).toBe(200);
      expect(importMapResponse.headers.get('content-type')).toContain('application/json');
      const importMap = await importMapResponse.json() as { imports: { cc: string } };
      const chunk = await fetch(new URL(importMap.imports.cc, importMapUrl));
      expect(chunk.status).toBe(200);
      expect(chunk.headers.get('content-type')).toMatch(/javascript/u);
      expect(await chunk.text()).toBe(files['chunks/cc.js']);
      for (const name of ['bundled/index.js', 'assets/engine.wasm', 'bundled/index.js.map']) {
        const resource = await fetch(`${origin}/super-preview/engine/${name}`);
        expect(resource.status).toBe(200);
        expect(resource.headers.get('cache-control')).toBe('no-store');
        expect(Buffer.from(await resource.arrayBuffer())).toEqual(Buffer.from(files[name as keyof typeof files]));
      }
    },
  );

  it('renders a preset and serves its declared engine output independently of the source directory', async () => {
    /// @case
    /// 1. A preset request succeeds and the editor reports an independent preview output.
    /// @expect
    /// The preset page and its engine bundle both return 200 through the registered HTTP routes.
    const previewRoot = join(workspace, 'preview');
    await mkdir(join(previewRoot, 'bundled'), { recursive: true });
    await writeFile(join(previewRoot, 'bundled', 'index.js'), 'preset engine');
    messageRequest.mockImplementation((extension: string) => Promise.resolve(
      extension === 'super-preview'
        ? { ok: true, launchParams: {} }
        : { typescript: { path: join(workspace, 'source') }, outputs: { preview: previewRoot } },
    ));
    const page = await fetch(`${origin}/super-preview/preset-example`);
    expect(page.status).toBe(200);
    const bundleUrl = (await page.text()).match(/<script src="([^"]+\/engine\/bundled\/index.js)">/u)?.[1];
    expect(bundleUrl).toBeDefined();
    const bundle = await fetch(bundleUrl!);
    expect(bundle.status).toBe(200);
    expect(await bundle.text()).toBe('preset engine');
  });

  it('uses an explicit preview output without requiring a source path and follows output changes', async () => {
    /// @case
    /// 1. The editor supplies only outputs.preview, then switches to another preview output.
    /// @expect
    /// The same resource URL serves each current output without depending on source metadata or cached roots.
    for (const name of ['first', 'second']) {
      const previewRoot = join(workspace, name);
      await mkdir(previewRoot);
      await writeFile(join(previewRoot, 'import-map.json'), name);
      messageRequest.mockResolvedValue({ outputs: { preview: previewRoot } });
      const response = await fetch(`${origin}/super-preview/engine/import-map.json`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(name);
    }
  });

  it.each([true, false])('loads ImportGuide output with the editor module profile and DEBUG=%s', async (debug) => {
    /// @case
    /// 1. The editor supplies an independent preview output containing import-guide.js instead of a legacy bundle and import map.
    /// 2. The page requests the current HTML5 preview feature profile with the selected debug option.
    /// @expect
    /// The shell embeds the ImportGuide URL and environment without requesting nonexistent legacy artifacts.
    const previewRoot = join(workspace, 'guide-preview');
    await mkdir(previewRoot);
    await writeFile(join(previewRoot, 'import-guide.js'), 'export class ImportGuide {}');
    messageRequest.mockImplementation((_extension: string, message: string) => Promise.resolve(
      message === 'query-engine-info'
        ? { outputs: { preview: previewRoot } }
        : { includeModules: ['base', 'gfx-webgl'] },
    ));
    const page = await fetch(`${origin}/super-preview?--debug=${debug}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).not.toContain('/engine/import-map.json');
    expect(html).not.toContain('/engine/bundled/index.js');
    const embedded = html.match(/<script id="super-preview-config" type="application\/json">([\s\S]*?)<\/script>/u)?.[1];
    expect(JSON.parse(embedded!).boot.engineImportGuide).toEqual({
      url: `${origin}/scripting/engine/import-guide.js`,
      options: { platform: 'HTML5', mode: 'PREVIEW', features: ['base', 'gfx-webgl'], flags: { DEBUG: debug } },
    });
    expect(messageRequest).toHaveBeenCalledWith('engine', 'query-engine-modules-profile', undefined, {
      platform: 'HTML5', mode: 'PREVIEW', flags: { DEBUG: debug },
    });
  });

  it('rejects traversal, absolute paths and symlinks outside preview output and returns 404 for missing files', async () => {
    /// @case
    /// 1. HTTP requests try encoded traversal, Windows separators, absolute paths, and a directory link outside preview output.
    /// 2. A request names a file that does not exist.
    /// @expect
    /// Requests cannot expose files outside outputs.preview; missing resources return 404.
    const previewRoot = join(workspace, 'preview');
    const outsideRoot = join(workspace, 'outside');
    await mkdir(previewRoot);
    await mkdir(outsideRoot);
    await writeFile(join(outsideRoot, 'secret.txt'), 'outside preview');
    await symlink(outsideRoot, join(previewRoot, 'linked'), 'junction');
    messageRequest.mockResolvedValue({ outputs: { preview: previewRoot } });
    for (const path of [
      '..%2foutside%2fsecret.txt',
      '..%5coutside%5csecret.txt',
      '%2foutside%2fsecret.txt',
      'C:%5coutside%5csecret.txt',
      'file.js%00',
      'linked/secret.txt',
    ]) {
      const response = await fetch(`${origin}/super-preview/engine/${path}`);
      expect(response.status, path).toBe(400);
      expect(await response.text()).not.toContain('outside preview');
    }
    const missing = await fetch(`${origin}/super-preview/engine/missing.js`);
    expect(missing.status).toBe(404);
  });
});
