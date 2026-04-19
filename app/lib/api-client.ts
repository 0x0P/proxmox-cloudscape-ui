"use client";

interface FetchWithRetryOptions extends RequestInit {
  maxRetries?: number;
  baseDelay?: number;
  retryOn5xx?: boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000;

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let sessionExpiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
}

export async function apiFetch(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelay = DEFAULT_BASE_DELAY,
    retryOn5xx = true,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...fetchOptions, cache: "no-store" });

      if (response.status === 401) {
        sessionExpiredHandler?.();
        return response;
      }

      if (!retryOn5xx || !isRetryableStatus(response.status)) {
        return response;
      }

      lastResponse = response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }
    }

    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      await sleep(delay);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError ?? new Error("Request failed after retries");
}

export async function apiJson<T>(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<{ data: T; ok: boolean; status: number }> {
  const response = await apiFetch(url, options);
  const json = await response.json();
  return { data: json.data ?? json, ok: response.ok, status: response.status };
}
