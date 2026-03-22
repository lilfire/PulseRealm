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
      // Server not reachable (local dev), fall back to build-time key.
      // Reset the promise so the next call retries the fetch rather than
      // permanently returning a rejected promise.
      keyPromise = null;
      cachedApiKey = BUILD_TIME_KEY;
      return BUILD_TIME_KEY;
    });

  return keyPromise;
}

let loadPromise: Promise<void> | null = null;

/** Check whether the browser can parse optional chaining (`?.`), which the
 *  Google Maps JS API requires.  Chrome 74 (Wear OS) does not support it. */
function supportsOptionalChaining(): boolean {
  try {
    // eslint-disable-next-line no-new-func
    new Function("var o={}; return o?.x");
    return true;
  } catch {
    return false;
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if ((window as unknown as { google?: typeof google }).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  // Skip loading the JS API on browsers that can't parse it — prevents
  // uncaught SyntaxError noise in the console (falls back to static maps).
  if (!supportsOptionalChaining()) {
    return Promise.reject(
      new Error("Google Maps API requires optional chaining (?.) which this browser does not support"),
    );
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,routes`;
    script.async = true;
    script.onload = () => {
      // The script may load (network success) but fail to execute if the
      // browser doesn't support the syntax used by the Google Maps API
      // (e.g. Chrome 74 can't parse optional chaining).  Verify that the
      // global actually appeared before declaring success.
      const win = window as unknown as { google?: typeof google };
      if (win.google?.maps) {
        resolve();
      } else {
        loadPromise = null;
        reject(new Error("Google Maps API failed to initialize — your browser may be too old"));
      }
    };
    script.onerror = () => {
      // Reset so the next call re-attempts appending the script rather than
      // permanently returning a rejected promise.
      loadPromise = null;
      reject(new Error("Failed to load Google Maps API"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useGoogleMaps() {
  const [loaded, setLoaded] = useState(!!(window as unknown as { google?: typeof google }).google?.maps);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;

    getApiKey()
      .then((key) => {
        if (!key) {
          throw new Error("Google Maps API key not configured (GOOGLE_MAPS_API_KEY)");
        }
        setApiKey(key);
        return loadGoogleMaps(key);
      })
      .then(() => setLoaded(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [loaded]);

  return { loaded, error, apiKey };
}
