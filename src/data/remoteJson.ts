export const REMOTE_DATA_UNAVAILABLE_MESSAGE =
  "Увы, GitHub опять прилёг. Ошибка не у нас: хранилище данных временно не отвечает. Попробуйте ещё раз позже — всё должно починиться.";

const REMOTE_DATA_TIMEOUT_MS = 12_000;

export class RemoteDataUnavailableError extends Error {
  constructor() {
    super(REMOTE_DATA_UNAVAILABLE_MESSAGE);
    this.name = "RemoteDataUnavailableError";
  }
}

export async function fetchRemoteJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REMOTE_DATA_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500) {
        throw new RemoteDataUnavailableError();
      }
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as unknown;
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (error instanceof RemoteDataUnavailableError) throw error;
    if (timedOut || error instanceof TypeError) throw new RemoteDataUnavailableError();
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
