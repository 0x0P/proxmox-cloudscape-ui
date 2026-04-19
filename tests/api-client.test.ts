import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { apiFetch, onSessionExpired } = await import("@/app/lib/api-client");

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns response on success", async () => {
    mockFetch.mockResolvedValueOnce(new Response('{"data":"ok"}', { status: 200 }));

    const res = await apiFetch("/api/test");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("calls sessionExpiredHandler on 401", async () => {
    const handler = vi.fn();
    onSessionExpired(handler);

    mockFetch.mockResolvedValueOnce(new Response('{"error":"unauthorized"}', { status: 401 }));

    const res = await apiFetch("/api/test");
    expect(res.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx errors with exponential backoff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch
      .mockResolvedValueOnce(new Response("error", { status: 503 }))
      .mockResolvedValueOnce(new Response("error", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"data":"ok"}', { status: 200 }));

    const promise = apiFetch("/api/test", { maxRetries: 3, baseDelay: 100 });
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("retries on network errors", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(new Response('{"data":"ok"}', { status: 200 }));

    const promise = apiFetch("/api/test", { maxRetries: 2, baseDelay: 100 });
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws after exhausting retries on network errors", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      apiFetch("/api/test", { maxRetries: 2, baseDelay: 50 }),
    ).rejects.toThrow("Network error");

    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("does not retry on 4xx errors (except 401/429)", async () => {
    mockFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const res = await apiFetch("/api/test");
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 too many requests", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response('{"data":"ok"}', { status: 200 }));

    const promise = apiFetch("/api/test", { maxRetries: 2, baseDelay: 50 });
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
