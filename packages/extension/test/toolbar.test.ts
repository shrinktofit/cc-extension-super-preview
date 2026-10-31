// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, type App } from 'vue';
import type { VortexSelectProps } from '@vortex/ui-elements';
import type { PresetSelection, PresetSummary } from '../src/preset-protocol.js';
import type { SceneSelection, SceneSummary } from '../src/scene-protocol.js';
import * as toolbar from '../src/contributions/toolbar/index.js';

// Happy DOM connects slotted custom elements before their parent's Vue instance exists.
// Icon rendering is covered in Chromium; keep the real buttons, selects and QR component here.
vi.mock('@vortex/ui-elements-vue', async (importOriginal) => {
  const components = await importOriginal<typeof import('@vortex/ui-elements-vue')>();
  const { h } = await import('vue');
  return {
    ...components,
    VortexIcon: { props: ['value'], render: () => h('span') },
  };
});

type SelectElement<Option> = HTMLElement & VortexSelectProps<Option>;
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
const request = vi.fn();
const clipboardWrite = vi.fn();
const mounted: { $: { root: HTMLElement }; app?: App }[] = [];
let presets: PresetSummary[];
let scenes: SceneSummary[];
let savedPresetId: string | undefined;
let savedScene: string;
let previewOrigin: string;

// Happy DOM has no popover implementation; real dismissal and positioning are verified in Chromium.
beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: { configurable: true, value() {} },
    hidePopover: { configurable: true, value() {} },
  });
});

vi.stubGlobal('Editor', {
  Clipboard: { write: clipboardWrite },
  Message: {
    request,
    __protected__: {
      addBroadcastListener(name: string, listener: (...args: unknown[]) => void) {
        const callbacks = listeners.get(name) ?? new Set();
        callbacks.add(listener);
        listeners.set(name, callbacks);
      },
      removeBroadcastListener(name: string, listener: (...args: unknown[]) => void) {
        listeners.get(name)?.delete(listener);
      },
    },
  },
});

beforeEach(() => {
  listeners.clear();
  savedPresetId = undefined;
  savedScene = 'current_scene';
  previewOrigin = 'http://192.168.1.10:7456';
  clipboardWrite.mockClear();
  presets = [{ id: 'local', label: '本地联调', description: '连接本地服务' }];
  scenes = [
    { uuid: 'scene-alpha', label: 'Alpha', url: 'db://assets/Alpha.scene' },
    { uuid: 'scene-beta', label: 'Beta', url: 'db://assets/Beta.scene' },
  ];
  request.mockReset().mockImplementation(async (extension, message, value) => {
    expect(extension).toBe('super-preview');
    switch (message) {
    case 'query-presets': return { presets, selectedPresetId: savedPresetId };
    case 'query-scenes': return { scenes, selectedScene: savedScene };
    case 'query-preview-url': return previewOrigin + '/super-preview' + (savedPresetId ? '/presets/' + savedPresetId : '');
    case 'copy-preview-url': return;
    case 'select-preset':
      savedPresetId = value;
      return;
    case 'select-scene':
      savedScene = value;
      return;
    case 'open': return;
    default: throw new Error('Unexpected toolbar request: ' + String(message));
    }
  });
});

afterEach(async () => {
  for (const context of mounted.splice(0)) toolbar.close.call(context);
  document.body.replaceChildren();
  await nextTick();
  vi.restoreAllMocks();
});
afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  vi.unstubAllGlobals();
});

describe('Super Preview toolbar mounted through Vue and VortexSelect', () => {
  it('shares and copies the selected preview URL without launching or evaluating a preset', async () => {
    /// @case Open the QR popup, change the preset and network address, then copy the link.
    /// @expect The code and clipboard contain the latest complete URL; opening the popup has no launch side effects.
    const context = await mountToolbar();
    expect(request).not.toHaveBeenCalledWith('super-preview', 'query-preview-url');
    context.share.click();
    const code = () => context.$.root.querySelector('vortex-qrcode') as HTMLElement & { value: string };
    await vi.waitFor(() => expect(code()?.value).toBe(previewOrigin + '/super-preview'));
    savedPresetId = 'local';
    broadcast('super-preview:presets-changed');
    await vi.waitFor(() => expect(code()?.value).toBe(previewOrigin + '/super-preview/presets/local'));
    previewOrigin = 'https://192.168.1.20:8080';
    broadcast('preview:ip-change');
    await vi.waitFor(() => expect(code()?.value).toBe(previewOrigin + '/super-preview/presets/local'));
    const copy = context.$.root.querySelector('.super-preview-copy-url')?.shadowRoot?.querySelector('button');
    copy!.click();
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(
      'super-preview', 'copy-preview-url', previewOrigin + '/super-preview/presets/local',
    ));
    expect(clipboardWrite).not.toHaveBeenCalled();
    await nextTick();
    expect(context.$.root.textContent).toContain('已复制预览地址');
    expect(request.mock.calls.some(([, message]) => message === 'open' || message === 'evaluate-preset-launch-params')).toBe(false);
  });

  it('discards outdated URL responses and closes when the selected target becomes unavailable', async () => {
    /// @case Network changes trigger overlapping requests; then the selected scene is removed.
    /// @expect Only the latest response is encoded, and an unavailable target disables and closes sharing.
    const context = await mountToolbar();
    context.share.click();
    const code = () => context.$.root.querySelector('vortex-qrcode') as HTMLElement & { value: string };
    await vi.waitFor(() => expect(code()?.value).toBe(previewOrigin + '/super-preview'));
    const older = deferred<string>();
    const newer = deferred<string>();
    request.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    broadcast('preview:ip-change');
    broadcast('preview:port-change');
    newer.resolve('https://new.test:8080/super-preview');
    await vi.waitFor(() => expect(code()?.value).toBe('https://new.test:8080/super-preview'));
    older.resolve('http://old.test/super-preview');
    await older.promise;
    await nextTick();
    expect(code().value).toBe('https://new.test:8080/super-preview');
    savedScene = 'removed';
    broadcast('super-preview:scenes-changed');
    await vi.waitFor(() => expect(context.share.disabled).toBe(true));
    expect(context.$.root.querySelector('.super-preview-qrcode-trigger')?.getAttribute('aria-expanded')).toBe('false');
    request.mockClear();
    context.share.click();
    broadcast('preview:port-change');
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the code visible and allows retrying when copying fails', async () => {
    /// @case The main process rejects copying, then accepts a retry.
    /// @expect Failed copying is reported without discarding the code or claiming success.
    const context = await mountToolbar();
    context.share.click();
    await vi.waitFor(() => expect(context.$.root.querySelector('vortex-qrcode')).not.toBeNull());
    const error = new Error('Clipboard unavailable');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request.mockRejectedValueOnce(error);
    const copy = context.$.root.querySelector('.super-preview-copy-url')!.shadowRoot!.querySelector('button')!;
    copy.click();
    await vi.waitFor(() => expect(context.$.root.textContent).toContain('复制失败，请重试'));
    expect(context.$.root.querySelector('vortex-qrcode')).not.toBeNull();
    expect(logged).toHaveBeenCalledWith('[Super Preview] Failed to copy preview URL', error);
    copy.click();
    await vi.waitFor(() => expect(context.$.root.textContent).toContain('已复制预览地址'));
  });

  it('clears an old code and reports a failed URL refresh', async () => {
    /// @case Refreshing an open QR popup fails after it previously displayed a valid URL.
    /// @expect The old code is removed, the failure is visible, and closing and reopening can retry.
    const context = await mountToolbar();
    context.share.click();
    await vi.waitFor(() => expect(context.$.root.querySelector('vortex-qrcode')).not.toBeNull());
    const error = new Error('Preview server unavailable');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request.mockRejectedValueOnce(error);
    broadcast('preview:port-change');
    await vi.waitFor(() => expect(context.$.root.querySelector('[role="alert"]')?.textContent).toContain('无法获取预览地址'));
    expect(context.$.root.querySelector('vortex-qrcode')).toBeNull();
    expect(logged).toHaveBeenCalledWith('[Super Preview] Failed to query preview URL', error);
    context.share.click();
    context.share.click();
    await vi.waitFor(() => expect(context.$.root.querySelector('vortex-qrcode')).not.toBeNull());
  });

  it('persists a preset without launching and restores it after remounting', async () => {
    /// @case Select a preset, remount the contribution, then play and return to no preset.
    /// @expect Selection persists; only explicit play opens preview and selection never evaluates presets.
    const first = await mountToolbar();
    expect(first.preset.value).toBe('');
    choose(first.preset, 'local');
    await vi.waitFor(() => expect(savedPresetId).toBe('local'));
    await vi.waitFor(() => expect(first.preset.hasAttribute('disabled')).toBe(false));
    expect(first.preset.value).toBe('local');
    expect(request.mock.calls.some(([, message]) => message === 'open' || message === 'evaluate-preset-launch-params')).toBe(false);
    toolbar.close.call(first);

    const second = await mountToolbar();
    expect(second.preset.value).toBe('local');
    second.open.click();
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('super-preview', 'open'));
    await vi.waitFor(() => expect(second.open.hasAttribute('disabled')).toBe(false));
    choose(second.preset, '');
    await vi.waitFor(() => expect(second.preset.value).toBe(''));
    expect(request).toHaveBeenCalledWith('super-preview', 'select-preset', undefined);
  });

  it('retains a missing preset and allows returning to no preset', async () => {
    /// @case The saved preset's contributor is unavailable.
    /// @expect Its unavailable option remains visible and blocks play until the user chooses another.
    savedPresetId = 'removed';
    const context = await mountToolbar();
    expect(context.preset.value).toBe('removed');
    expect(context.preset.options?.find((option) => option.id === 'removed')?.unavailableReason).toContain('预设已不可用');
    expect(context.open.hasAttribute('disabled')).toBe(true);
    context.open.click();
    expect(request.mock.calls.some(([, message]) => message === 'open')).toBe(false);
    choose(context.preset, '');
    await vi.waitFor(() => expect(context.open.hasAttribute('disabled')).toBe(false));
  });

  it('restores the controlled preset value after a save failure', async () => {
    /// @case VortexSelect emits a new value but persisting it fails.
    /// @expect Both the Vue model and rendered select return to the saved value and permit retry.
    const context = await mountToolbar();
    const error = new Error('Cannot save preset');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request.mockRejectedValueOnce(error);
    choose(context.preset, 'local');
    await vi.waitFor(() => expect(context.preset.value).toBe(''));
    expect(context.preset.hasAttribute('disabled')).toBe(false);
    expect(context.preset.shadowRoot?.textContent).toContain('无预设');
    expect(logged).toHaveBeenCalledWith('[Super Preview] Failed to select preset', error);
  });

  it('ignores stale preset responses and removes subscriptions on unmount', async () => {
    /// @case Two preset refreshes finish in reverse order, then the toolbar unmounts.
    /// @expect Only the latest response is displayed and subsequent broadcasts do not query again.
    const context = await mountToolbar();
    const older = deferred<PresetSelection>();
    const newer = deferred<PresetSelection>();
    request.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    broadcast('super-preview:presets-changed');
    broadcast('super-preview:presets-changed');
    newer.resolve({ presets: [], selectedPresetId: 'newer' });
    await vi.waitFor(() => expect(context.preset.value).toBe('newer'));
    older.resolve({ presets: [], selectedPresetId: 'older' });
    await older.promise;
    await nextTick();
    expect(context.preset.value).toBe('newer');
    toolbar.close.call(context);
    request.mockClear();
    broadcast('super-preview:presets-changed');
    expect(request).not.toHaveBeenCalled();
    expect(context.$.root.children).toHaveLength(0);
  });

  it('keeps both choices independently editable and saved across remounts', async () => {
    /// @case Save a scene, begin saving a preset, then remount and choose current scene.
    /// @expect The other picker remains editable; choices never evaluate a preset or launch preview.
    const context = await mountToolbar();
    choose(context.scene, 'scene-beta');
    await vi.waitFor(() => expect(savedScene).toBe('scene-beta'));
    await vi.waitFor(() => expect(context.scene.hasAttribute('disabled')).toBe(false));
    const pending = deferred<void>();
    request.mockImplementationOnce(async (_extension, _message, value) => {
      await pending.promise;
      savedPresetId = value;
    });
    choose(context.preset, 'local');
    await nextTick();
    expect(context.preset.hasAttribute('disabled')).toBe(true);
    expect(context.scene.hasAttribute('disabled')).toBe(false);
    pending.resolve();
    await vi.waitFor(() => expect(context.preset.hasAttribute('disabled')).toBe(false));
    expect(context.scene.value).toBe('scene-beta');
    toolbar.close.call(context);

    const reopened = await mountToolbar();
    expect(reopened.preset.value).toBe('local');
    expect(reopened.scene.value).toBe('scene-beta');
    choose(reopened.scene, 'current_scene');
    await vi.waitFor(() => expect(savedScene).toBe('current_scene'));
    expect(reopened.preset.value).toBe('local');
    expect(request.mock.calls.some(([, message]) => message === 'open' || message === 'evaluate-preset-launch-params')).toBe(false);
  });

  it('renders scene slot content and reacts to renamed and removed assets', async () => {
    /// @case A selected scene is renamed and then removed while the toolbar remains mounted.
    /// @expect The option and path update, a removed choice blocks play, and choosing current scene recovers.
    savedScene = 'scene-beta';
    const context = await mountToolbar();
    expect(context.scene.textContent).toContain('db://assets/Beta.scene');
    scenes = [{ uuid: 'scene-beta', label: 'Renamed', url: 'db://assets/Renamed.scene' }];
    broadcast('asset-db:asset-change', 'scene-beta', { type: 'cc.SceneAsset' });
    await vi.waitFor(() => expect(context.scene.textContent).toContain('db://assets/Renamed.scene'));
    expect(context.scene.options?.find((option) => option.uuid === 'scene-beta')?.label).toBe('Renamed');
    scenes = [];
    broadcast('asset-db:asset-delete', 'scene-beta', { type: 'cc.SceneAsset' });
    await vi.waitFor(() => expect(context.open.hasAttribute('disabled')).toBe(true));
    expect(context.scene.value).toBe('scene-beta');
    expect(context.scene.options?.find((option) => option.uuid === 'scene-beta')?.unavailableReason).toContain('场景已不可用');
    expect(context.scene.hasAttribute('disabled')).toBe(false);
    choose(context.scene, 'current_scene');
    await vi.waitFor(() => expect(context.open.hasAttribute('disabled')).toBe(false));
    toolbar.close.call(context);
    request.mockClear();
    broadcast('asset-db:asset-add', 'scene-new', { type: 'cc.SceneAsset' });
    expect(request).not.toHaveBeenCalled();
  });

  it('restores the scene after a failed save while leaving the preset editable', async () => {
    /// @case Persisting a changed scene rejects.
    /// @expect The last saved scene returns and preset selection remains independent.
    savedScene = 'scene-beta';
    const context = await mountToolbar();
    const error = new Error('Cannot save scene');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request.mockRejectedValueOnce(error);
    choose(context.scene, 'current_scene');
    expect(context.preset.hasAttribute('disabled')).toBe(false);
    await vi.waitFor(() => expect(context.scene.value).toBe('scene-beta'));
    expect(context.scene.hasAttribute('disabled')).toBe(false);
    expect(logged).toHaveBeenCalledWith('[Super Preview] Failed to select scene', error);
  });

  it('refreshes a scene picker without disabling it and ignores stale responses', async () => {
    /// @case Opening the picker and receiving an asset update trigger overlapping queries.
    /// @expect Refresh keeps the picker usable and only the newest response is displayed.
    const context = await mountToolbar();
    const older = deferred<SceneSelection>();
    const newer = deferred<SceneSelection>();
    request.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    context.scene.dispatchEvent(new Event('show'));
    await nextTick();
    expect(context.scene.hasAttribute('disabled')).toBe(false);
    broadcast('super-preview:scenes-changed');
    newer.resolve({ scenes: [], selectedScene: 'newer' });
    await vi.waitFor(() => expect(context.scene.value).toBe('newer'));
    older.resolve({ scenes: [], selectedScene: 'older' });
    await older.promise;
    await nextTick();
    expect(context.scene.value).toBe('newer');
  });

  it('renders the launch control and prevents toolbar double-clicks from reaching the window', async () => {
    /// @case The user double-clicks a rendered toolbar control.
    /// @expect The play icon and SUPER label are present and double-click does not reach the surrounding window.
    const context = await mountToolbar();
    expect(context.open.querySelector('ui-icon')?.getAttribute('value')).toBe('play');
    expect(context.open.nextElementSibling?.textContent).toBe('SUPER');
    const windowDoubleClick = vi.fn();
    context.$.root.addEventListener('dblclick', windowDoubleClick);
    context.open.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(windowDoubleClick).not.toHaveBeenCalled();
  });

  it('launches once while a request is pending and becomes usable after success', async () => {
    /// @case The user clicks play twice before the first request completes, then clicks again afterward.
    /// @expect Only one concurrent launch runs and both pickers are disabled during that launch.
    const context = await mountToolbar();
    const pending = deferred<void>();
    request.mockClear().mockReturnValueOnce(pending.promise);
    context.open.click();
    context.open.click();
    await nextTick();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('super-preview', 'open');
    expect(context.open.hasAttribute('disabled')).toBe(true);
    expect(context.preset.hasAttribute('disabled')).toBe(true);
    expect(context.scene.hasAttribute('disabled')).toBe(true);
    pending.resolve();
    await vi.waitFor(() => expect(context.open.hasAttribute('disabled')).toBe(false));
    context.open.click();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('logs launch errors and restores the controls after failure', async () => {
    /// @case The editor rejects a launch request.
    /// @expect The diagnostic is retained and the user can retry.
    const context = await mountToolbar();
    const error = new Error('Preview unavailable');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request.mockRejectedValueOnce(error);
    context.open.click();
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('[Super Preview] Failed to open preview', error));
    expect(context.open.hasAttribute('disabled')).toBe(false);
  });

  it('does not revive an unmounted toolbar when an outstanding refresh completes', async () => {
    /// @case A scene refresh is in flight when the editor unloads the contribution.
    /// @expect The UI stays unmounted and all editor subscriptions are removed.
    const context = await mountToolbar();
    const pending = deferred<SceneSelection>();
    request.mockReturnValueOnce(pending.promise);
    broadcast('super-preview:scenes-changed');
    toolbar.close.call(context);
    pending.resolve({ scenes: [], selectedScene: 'late' });
    await pending.promise;
    await nextTick();
    expect(context.$.root.children).toHaveLength(0);
    expect([...listeners.values()].every((callbacks) => callbacks.size === 0)).toBe(true);
    request.mockClear();
    broadcast('asset-db:ready');
    broadcast('super-preview:presets-changed');
    expect(request).not.toHaveBeenCalled();
  });
});

async function mountToolbar() {
  const root = document.createElement('div');
  root.id = 'super-preview-root';
  document.body.append(root);
  const context = { $: { root }, app: undefined as App | undefined };
  mounted.push(context);
  toolbar.ready.call(context);
  const preset = root.querySelector<SelectElement<PresetSummary>>('.super-preview-preset')!;
  const scene = root.querySelector<SelectElement<SceneSummary>>('.super-preview-scene')!;
  const open = root.querySelector<HTMLElement>('.super-preview-open')!;
  await vi.waitFor(() => {
    expect(preset.hasAttribute('disabled')).toBe(false);
    expect(scene.hasAttribute('disabled')).toBe(false);
  });
  const share = root.querySelector('.super-preview-qrcode-trigger')!.shadowRoot!.querySelector('button')!;
  return Object.assign(context, { preset, scene, open, share });
}

function choose<Option>(control: SelectElement<Option>, value: string) {
  control.value = value;
  control.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value } }));
}

function broadcast(name: string, ...args: unknown[]) {
  for (const listener of listeners.get(name) ?? []) listener(...args);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
