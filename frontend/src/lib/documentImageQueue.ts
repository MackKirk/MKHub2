/**
 * Caps how many document photos hit /files/.../thumbnail at once.
 * The pages strip does not use this — it draws a placeholder instead of fetching.
 */
const MAX_CONCURRENT = 3;

export type DocumentImageLoadResult = 'ok' | 'error';

type Job = {
  url: string;
  subscribers: number;
  started: boolean;
  promise: Promise<DocumentImageLoadResult>;
  settle: (result: DocumentImageLoadResult) => void;
};

const ready = new Map<string, DocumentImageLoadResult>();
const jobs = new Map<string, Job>();
const pending: string[] = [];
let active = 0;
let pumping = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Test hook. Drops queued work without settling promises that were never started. */
export function resetDocumentImageQueueForTests() {
  ready.clear();
  jobs.clear();
  pending.length = 0;
  active = 0;
  pumping = false;
  listeners.clear();
}

export function subscribeDocumentImageLoads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function documentImageResult(url: string): DocumentImageLoadResult | null {
  return ready.get(url) ?? null;
}

export function isDocumentImagePending(urls: readonly string[]): boolean {
  return urls.some((url) => !!url && !ready.has(url));
}

function dropPending(url: string) {
  const index = pending.indexOf(url);
  if (index >= 0) pending.splice(index, 1);
}

function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (active < MAX_CONCURRENT) {
      const url = pending.find((candidate) => {
        const job = jobs.get(candidate);
        return !!job && !job.started && job.subscribers > 0;
      });
      if (!url) return;
      const job = jobs.get(url);
      if (!job) {
        dropPending(url);
        continue;
      }
      job.started = true;
      dropPending(url);
      active += 1;
      const img = new Image();
      let settled = false;
      const finish = (result: DocumentImageLoadResult) => {
        if (settled) return;
        settled = true;
        ready.set(url, result);
        jobs.delete(url);
        active -= 1;
        job.settle(result);
        notify();
        pump();
      };
      img.onload = () => finish('ok');
      img.onerror = () => finish('error');
      img.src = url;
    }
  } finally {
    pumping = false;
  }
}

/** Start (or join) a thumbnail load. Cancel before it starts to free the slot. */
export function watchDocumentImage(url: string): {
  promise: Promise<DocumentImageLoadResult>;
  cancel: () => void;
} {
  const cached = ready.get(url);
  if (cached) {
    return { promise: Promise.resolve(cached), cancel: () => {} };
  }

  let job = jobs.get(url);
  if (!job) {
    let settle!: (result: DocumentImageLoadResult) => void;
    const promise = new Promise<DocumentImageLoadResult>((resolve) => {
      settle = resolve;
    });
    job = { url, subscribers: 0, started: false, promise, settle };
    jobs.set(url, job);
    pending.push(url);
  }
  job.subscribers += 1;
  pump();

  let cancelled = false;
  return {
    promise: job.promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      const current = jobs.get(url);
      if (!current || current.started) return;
      current.subscribers -= 1;
      if (current.subscribers <= 0) {
        jobs.delete(url);
        dropPending(url);
      }
    },
  };
}
