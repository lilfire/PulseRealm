import { useEffect, useState } from "react";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if ((window as unknown as { google?: typeof google }).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,geometry,routes`;
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
    if (!API_KEY) {
      setError("Google Maps API key not configured (VITE_GOOGLE_MAPS_API_KEY)");
      return;
    }
    if (loaded) return;

    loadGoogleMaps()
      .then(() => setLoaded(true))
      .catch((e) => setError(e.message));
  }, [loaded]);

  return { loaded, error };
}
