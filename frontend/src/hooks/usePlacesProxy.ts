import { useCallback, useRef, useState } from "react";

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  address: string;
}

/**
 * Server-side Places API proxy for browsers where the Google Maps JS SDK
 * can't load (e.g. Chrome 74 on Wear OS lacks optional chaining).
 */
export function usePlacesProxy() {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback((input: string) => {
    if (input.length < 2) {
      setSuggestions([]);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(function () {
      if (abortRef.current) abortRef.current.abort();
      var controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/maps/places/autocomplete?input=" + encodeURIComponent(input), {
        signal: controller.signal,
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.predictions) {
            setSuggestions(data.predictions);
          } else {
            setSuggestions([]);
          }
        })
        .catch(function () {
          // Aborted or network error — ignore
        });
    }, 300);
  }, []);

  const getDetails = useCallback(function (placeId: string): Promise<PlaceDetails | null> {
    return fetch("/api/maps/places/details?placeId=" + encodeURIComponent(placeId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.lat != null && data.lng != null) {
          return {
            lat: data.lat,
            lng: data.lng,
            address: data.address || data.name || "",
          } as PlaceDetails;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }, []);

  const clearSuggestions = useCallback(function () {
    setSuggestions([]);
  }, []);

  return { suggestions: suggestions, fetchSuggestions: fetchSuggestions, getDetails: getDetails, clearSuggestions: clearSuggestions };
}
