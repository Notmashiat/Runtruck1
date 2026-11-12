import { afterEach, describe, expect, it, vi } from 'vitest';
import { failedFile, loadWithRetry, reloadForNewVersion, stylesMissing } from './lazyPage';

const fail = () => new TypeError('Failed to fetch dynamically imported module: https://x/assets/AppLayout-abc.js');

describe('Downloading a screen right after an update', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('a download that fails once is tried again in place, with no reload', async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const load = vi.fn().mockRejectedValueOnce(fail()).mockResolvedValueOnce({ Page: 'ok' });
    const result = loadWithRetry(load);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toEqual({ Page: 'ok' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('still failing, it reloads up to three times, then shows the error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const load = vi.fn().mockRejectedValue(fail());
    for (let i = 0; i < 3; i++) {
      void loadWithRetry(load);
      await vi.advanceTimersByTimeAsync(1500 + 4000);
    }
    expect(reload).toHaveBeenCalledTimes(3);
    const last = loadWithRetry(load);
    const settled = expect(last).rejects.toThrow(/dynamically imported module/);
    await vi.advanceTimersByTimeAsync(1500);
    await settled;
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it('other errors are not retried', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Something else broke'));
    await expect(loadWithRetry(load)).rejects.toThrow('Something else broke');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('A page opened before its stylesheet arrived', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    document.documentElement.style.removeProperty('--ui-bg');
  });

  it('notices the stylesheet is missing, and not once it has loaded', () => {
    expect(stylesMissing()).toBe(true);
    document.documentElement.style.setProperty('--ui-bg', '#edf0f5');
    expect(stylesMissing()).toBe(false);
  });

  it('reloads at most three times in two minutes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    expect([reloadForNewVersion(), reloadForNewVersion(), reloadForNewVersion(), reloadForNewVersion()]).toEqual([true, true, true, false]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).toHaveBeenCalledTimes(3);
  });
});

describe('A file the browser remembers as missing', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('is asked for again past the browser cache before reloading', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { order.push(`fetch ${url} ${init?.cache}`); return new Response(''); }));
    vi.stubGlobal('location', { ...window.location, reload: vi.fn(() => order.push('reload')) });
    reloadForNewVersion(['https://x/assets/index-abc.css']);
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(['fetch https://x/assets/index-abc.css reload', 'reload']);
  });

  it('finds the file named in a failed download', () => {
    expect(failedFile(new TypeError('Failed to fetch dynamically imported module: https://x.app/assets/AppLayout-B1.js'))).toEqual(['https://x.app/assets/AppLayout-B1.js']);
    expect(failedFile(new Error('Something else'))).toEqual([]);
  });
});
