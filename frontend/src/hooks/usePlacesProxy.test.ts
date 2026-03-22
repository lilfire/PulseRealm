import { renderHook, act, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { usePlacesProxy } from "./usePlacesProxy";

describe("usePlacesProxy", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function flushPromises() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
      vi.advanceTimersByTime(0);
    });
  }

  it("starts with empty suggestions", () => {
    const { result } = renderHook(() => usePlacesProxy());
    expect(result.current.suggestions).toEqual([]);
  });

  describe("fetchSuggestions", () => {
    it("clears suggestions for input shorter than 2 chars", () => {
      const { result } = renderHook(() => usePlacesProxy());

      act(() => {
        result.current.fetchSuggestions("a");
      });

      expect(result.current.suggestions).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("debounces the API call by 300ms", () => {
      const { result } = renderHook(() => usePlacesProxy());

      act(() => {
        result.current.fetchSuggestions("New York");
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        json: () => Promise.resolve({ predictions: [] }),
      });

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
        "/api/maps/places/autocomplete?input=New%20York"
      );
    });

    it("sets suggestions from API response", async () => {
      vi.useRealTimers();
      globalThis.fetch = vi.fn();

      const predictions = [
        { placeId: "p1", description: "Place 1" },
        { placeId: "p2", description: "Place 2" },
      ];

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        json: () => Promise.resolve({ predictions }),
      });

      const { result } = renderHook(() => usePlacesProxy());

      act(() => {
        result.current.fetchSuggestions("test");
      });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual(predictions);
      }, { timeout: 2000 });
    });

    it("sets empty suggestions when no predictions in response", async () => {
      vi.useRealTimers();
      globalThis.fetch = vi.fn();

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => usePlacesProxy());

      act(() => {
        result.current.fetchSuggestions("test");
      });

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      }, { timeout: 2000 });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([]);
      });
    });

    it("ignores network errors silently", async () => {
      vi.useRealTimers();
      globalThis.fetch = vi.fn();

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => usePlacesProxy());

      act(() => {
        result.current.fetchSuggestions("test");
      });

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      }, { timeout: 2000 });

      expect(result.current.suggestions).toEqual([]);
    });
  });

  describe("getDetails", () => {
    beforeEach(() => {
      vi.useRealTimers();
      globalThis.fetch = vi.fn();
    });

    it("returns place details on success", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        json: () => Promise.resolve({ lat: 40.7, lng: -74.0, address: "NYC" }),
      });

      const { result } = renderHook(() => usePlacesProxy());

      let details: unknown;
      await act(async () => {
        details = await result.current.getDetails("place-1");
      });

      expect(details).toEqual({ lat: 40.7, lng: -74.0, address: "NYC" });
    });

    it("uses name as fallback when address is missing", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        json: () => Promise.resolve({ lat: 10, lng: 20, name: "Some Place" }),
      });

      const { result } = renderHook(() => usePlacesProxy());

      let details: unknown;
      await act(async () => {
        details = await result.current.getDetails("place-2");
      });

      expect(details).toEqual({ lat: 10, lng: 20, address: "Some Place" });
    });

    it("returns null when lat/lng missing", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        json: () => Promise.resolve({ name: "No coords" }),
      });

      const { result } = renderHook(() => usePlacesProxy());

      let details: unknown;
      await act(async () => {
        details = await result.current.getDetails("place-3");
      });

      expect(details).toBeNull();
    });

    it("returns null on network error", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fail"));

      const { result } = renderHook(() => usePlacesProxy());

      let details: unknown;
      await act(async () => {
        details = await result.current.getDetails("place-4");
      });

      expect(details).toBeNull();
    });
  });

  describe("clearSuggestions", () => {
    it("resets suggestions to empty array", () => {
      const { result } = renderHook(() => usePlacesProxy());

      act(() => {
        result.current.clearSuggestions();
      });

      expect(result.current.suggestions).toEqual([]);
    });
  });
});
