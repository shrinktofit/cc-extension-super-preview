import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Preview entry loads Eruda only on phones and tablets', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('eruda');
    vi.doUnmock('../src/boot/index');
    vi.unstubAllGlobals();
  });

  it.each([
    {
      device: 'Windows Chrome',
      mobile: false,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    },
    {
      device: 'Mac Safari',
      mobile: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    },
    {
      device: 'iPhone Safari',
      mobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    {
      device: 'Android phone Chrome',
      mobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    },
    {
      device: 'iPad Safari',
      mobile: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    {
      device: 'Android tablet Chrome',
      mobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    },
  ])('starts preview on $device with mobile=$mobile', async ({ mobile, userAgent }) => {
    /// @case
    /// 1. A desktop browser, phone or tablet opens the actual preview entry.
    /// @expect
    /// Phones and tablets load and initialize Eruda before preview starts.
    /// Desktop browsers start preview without loading or initializing Eruda.
    const callOrder: string[] = [];
    const initEruda = vi.fn(() => callOrder.push('eruda'));
    const loadEruda = vi.fn(() => ({ default: { init: initEruda } }));
    vi.doMock('eruda', loadEruda);
    vi.doMock('../src/boot/index', () => {
      callOrder.push('boot');
      return {};
    });
    vi.stubGlobal('navigator', { userAgent });

    await import('../src/boot');

    expect(loadEruda).toHaveBeenCalledTimes(mobile ? 1 : 0);
    expect(initEruda).toHaveBeenCalledTimes(mobile ? 1 : 0);
    expect(callOrder).toEqual(mobile ? ['eruda', 'boot'] : ['boot']);
  });
});
