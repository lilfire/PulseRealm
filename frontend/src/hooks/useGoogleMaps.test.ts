import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

// Each test dynamically imports the module after resetting module registry,
// so that the module-level singletons (cachedApiKey, keyPromise, loadPromise)
// start fresh.
beforeEach(() => {
  vi.resetModules();

  // Remove any previously injected Google Maps scripts
  document
    .querySelectorAll('script[src*="maps.googleapis.com"]')
    .forEach((el) => el.remove());

  // Ensure google is not defined
  delete (window as unknown as { google?: unknown }).google;

  // Reset import.meta.env key
  (import.meta.env as Record<string, string>).VITE_GOOGLE_MAPS_API_KEY = "";

  vi.restoreAllMocks();
});

// Helper: simulate a script tag firing onload or onerror
function triggerScript(success: boolean) {
  const script = document.querySelector(
    'script[src*="maps.googleapis.com"]'
  ) as HTMLScriptElement | null;
  if (!script) throw new Error("No Google Maps script found in document.head");
  if (success) {
    script.dispatchEvent(new Event("load"));
  } else {
    script.dispatchEvent(new Event("error"));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useGoogleMaps", () => {
  it("returns {loaded: false, error: null} initially when google.maps is not available", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ googleMapsApiKey: "test-key" }) } as Response)
    );

    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    expect(result.current.loaded).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches API key from /api/config", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ googleMapsApiKey: "fetched-key" }),
      } as Response)
    );
    global.fetch = fetchMock;

    const { useGoogleMaps } = await import("./useGoogleMaps");
    renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/config");
    });
  });

  it("sets loaded to true when the google.maps script loads successfully", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ googleMapsApiKey: "valid-key" }),
      } as Response)
    );

    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    // Script element should appear in head after the fetch resolves
    await waitFor(() => {
      expect(
        document.querySelector('script[src*="maps.googleapis.com"]')
      ).not.toBeNull();
    });

    triggerScript(true);

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });

  it("sets error when the API key is empty (no config response and no build-time key)", async () => {
    // Both config endpoint returns empty key and BUILD_TIME_KEY is ""
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ googleMapsApiKey: "" }),
      } as Response)
    );

    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.error).toContain("Google Maps API key not configured");
    expect(result.current.loaded).toBe(false);
  });

  it("sets error when the script fails to load", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ googleMapsApiKey: "some-key" }),
      } as Response)
    );

    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(
        document.querySelector('script[src*="maps.googleapis.com"]')
      ).not.toBeNull();
    });

    triggerScript(false);

    await waitFor(() => {
      expect(result.current.error).toBe("Failed to load Google Maps API");
    });
    expect(result.current.loaded).toBe(false);
  });

  it("falls back to BUILD_TIME_KEY when fetch throws", async () => {
    // Simulate network failure
    global.fetch = vi.fn(() => Promise.reject(new Error("network error")));

    // Set a build-time key via import.meta.env so the fallback is non-empty
    (import.meta.env as Record<string, string>).VITE_GOOGLE_MAPS_API_KEY =
      "build-time-key";

    // The module reads BUILD_TIME_KEY at module-load time from import.meta.env.
    // Because we reset modules, the fresh import will see the updated env value.
    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      const script = document.querySelector(
        'script[src*="maps.googleapis.com"]'
      ) as HTMLScriptElement | null;
      // The script should be appended with the build-time key as fallback
      expect(script).not.toBeNull();
    });

    triggerScript(true);

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });

  it("caches the API key so /api/config is only fetched once across multiple hook instances", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ googleMapsApiKey: "cached-key" }),
      } as Response)
    );
    global.fetch = fetchMock;

    const { useGoogleMaps } = await import("./useGoogleMaps");

    const { result: r1 } = renderHook(() => useGoogleMaps());
    const { result: r2 } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(document.querySelector('script[src*="maps.googleapis.com"]')).not.toBeNull();
    });

    triggerScript(true);

    await waitFor(() => {
      expect(r1.current.loaded).toBe(true);
      expect(r2.current.loaded).toBe(true);
    });

    // fetch should only have been called once despite two hook instances
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns loaded: true immediately when google.maps already exists on window", async () => {
    // Pre-populate window.google.maps before the module is imported
    (window as unknown as { google: { maps: object } }).google = { maps: {} };

    global.fetch = vi.fn();

    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
    // fetch should never be called because we returned early
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("handles non-ok response from /api/config by falling back to BUILD_TIME_KEY", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false } as Response)
    );

    (import.meta.env as Record<string, string>).VITE_GOOGLE_MAPS_API_KEY =
      "env-fallback-key";

    const { useGoogleMaps } = await import("./useGoogleMaps");
    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(
        document.querySelector('script[src*="maps.googleapis.com"]')
      ).not.toBeNull();
    });

    triggerScript(true);

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(result.current.error).toBeNull();

    // The script src should contain the env fallback key
    const script = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    ) as HTMLScriptElement;
    expect(script.src).toContain("env-fallback-key");
  });
});
