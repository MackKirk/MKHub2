function isThenable(x: unknown): x is PromiseLike<unknown> {
  return x != null && typeof (x as PromiseLike<unknown>).then === 'function';
}

/**
 * Wait until the native color UI is dismissed.
 *
 * Do **not** use `blur` for this: Chromium fires blur on the `<input>` while the user is still
 * interacting with the in-page color UI (hue slider, etc.). Treating blur as “closed” ends the
 * caller’s “suppress outside click” session early — the Font Color menu unmounts while the picker
 * stays open.
 *
 * Do **not** use `change` either: Chromium can fire it while the hue slider is still being used.
 * We only release on Escape, a later window focus, or a safety timeout.
 */
function waitForNativeColorDismissal(input: HTMLInputElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();

    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('focus', onFocus, true);
      window.clearTimeout(safetyTimer);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };

    const onFocus = () => {
      // Opening the native picker can bounce focus immediately; only treat later focus as dismissal.
      if (Date.now() - started > 500) finish();
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('focus', onFocus, true);
    const safetyTimer = window.setTimeout(finish, 30000);
  });
}

/**
 * Opens the OS/browser color UI for an `<input type="color">` and resolves when it closes.
 *
 * Callers should ignore outside `mousedown`/`pointerdown` until this promise settles — the native
 * UI is not part of the dropdown DOM subtree.
 */
export async function openNativeColorInputPicker(input: HTMLInputElement | null): Promise<void> {
  if (!input) return;

  try {
    if (typeof input.showPicker === 'function') {
      try {
        const ret = input.showPicker() as unknown;
        if (isThenable(ret)) void (ret as PromiseLike<unknown>).catch(() => undefined);
      } catch {
        input.click();
      }
    } else {
      input.click();
    }
  } catch {
    try {
      input.click();
    } catch {
      return;
    }
  }

  await waitForNativeColorDismissal(input);
}
