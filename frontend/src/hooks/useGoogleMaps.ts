import { useEffect, useState } from "react";

// Build-time fallback for local dev (npm run dev without the server)
const BUILD_TIME_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

let cachedApiKey: string | null = null;
let keyPromise: Promise<string> | null = null;

function getApiKey(): Promise<string> {
  if (cachedApiKey !== null) return Promise.resolve(cachedApiKey);
  if (keyPromise) return keyPromise;

  keyPromise = fetch("/api/config")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const key = data?.googleMapsApiKey || BUILD_TIME_KEY;
      cachedApiKey = key;
      return key;
    })
    .catch(() => {
      // Server not reachable (local dev), fall back to build-time key
      cachedApiKey = BUILD_TIME_KEY;
      return BUILD_TIME_KEY;
    });

  return keyPromise;
}

let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if ((window as unknown as { google?: typeof google }).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,routes`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps API"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useGoogleMaps() {
  const [loaded, setLoaded] = useState(!!(window as unknown as { google?: typeof google }).google?.maps);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;

    getApiKey()
      .then((apiKey) => {
        if (!apiKey) {
          throw new Error("Google Maps API key not configured (GOOGLE_MAPS_API_KEY)");
        }
        return loadGoogleMaps(apiKey);
      })
      .then(() => setLoaded(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [loaded]);

  return { loaded, error };
}
