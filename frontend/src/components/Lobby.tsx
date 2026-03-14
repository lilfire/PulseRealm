import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, SessionMode } from "../types/session";
import { useGoogleMaps } from "../hooks/useGoogleMaps";

export interface StreetViewLocation {
  lat: number;
  lng: number;
  address: string;
}

interface Props {
  joinCode: string;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  mode: SessionMode;
  onStart: (location?: StreetViewLocation) => void;
}

interface Suggestion {
  placeId: string;
  description: string;
}

export function Lobby({ joinCode, clients, clientProfiles, connected, mode, onStart }: Props) {
  const isStreetView = mode === "streetview";
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();
  const [location, setLocation] = useState<StreetViewLocation | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const placesDiv = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!mapsLoaded) return;
    autocompleteService.current = new google.maps.places.AutocompleteService();
    if (placesDiv.current) {
      placesService.current = new google.maps.places.PlacesService(placesDiv.current);
    }
  }, [mapsLoaded]);

  const fetchSuggestions = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 2) {
      setSuggestions([]);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      { input },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(
            predictions.map((p) => ({ placeId: p.place_id, description: p.description })),
          );
        } else {
          setSuggestions([]);
        }
      },
    );
  }, []);

  const onInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setLocation(null);
      setShowSuggestions(true);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => fetchSuggestions(value), 300);
    },
    [fetchSuggestions],
  );

  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    if (!placesService.current) return;

    placesService.current.getDetails(
      { placeId: suggestion.placeId, fields: ["geometry", "formatted_address", "name"] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          setLocation({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            address: place.formatted_address || place.name || suggestion.description,
          });
          setQuery(place.formatted_address || place.name || suggestion.description);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      },
    );
  }, []);

  const canStart =
    connected &&
    clients.length > 0 &&
    (!isStreetView || location !== null);

  return (
    <div className="app">
      <h1>PulseRealm</h1>
      <p>
        Join Code: <strong style={{ fontSize: "2rem", letterSpacing: "0.15em" }}>{joinCode}</strong>
      </p>
      <p>Status: {connected ? "Waiting for players..." : "Connecting..."}</p>

      <div style={{ margin: "1.5rem 0" }}>
        <h3>Players ({clients.length})</h3>
        {clients.length === 0 ? (
          <p style={{ color: "#888" }}>No players yet. Share the join code to get started.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {clients.map((id) => {
              const profile = clientProfiles[id];
              return (
                <li key={id} style={{ padding: "0.4rem 0" }}>
                  {profile?.name || id}
                  {profile?.heightCm ? ` — ${profile.heightCm} cm` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isStreetView && (
        <div style={{ margin: "1.5rem 0" }}>
          <h3>Starting Location</h3>
          {mapsError ? (
            <p style={{ color: "#f87171" }}>{mapsError}</p>
          ) : !mapsLoaded ? (
            <p style={{ color: "#888" }}>Loading maps...</p>
          ) : (
            <div style={{ position: "relative", display: "inline-block", width: "100%", maxWidth: "420px" }}>
              <input
                type="text"
                value={query}
                onChange={(e) => onInputChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Search for an address..."
                style={{
                  padding: "0.6rem 0.75rem",
                  fontSize: "1rem",
                  borderRadius: "6px",
                  border: `2px solid ${location ? "#86efac" : "#555"}`,
                  width: "100%",
                  background: "#1a1a1a",
                  color: "#fff",
                  boxSizing: "border-box",
                }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    background: "#222",
                    border: "1px solid #555",
                    borderRadius: "0 0 6px 6px",
                    zIndex: 1000,
                    maxHeight: "200px",
                    overflowY: "auto",
                    textAlign: "left",
                  }}
                >
                  {suggestions.map((s) => (
                    <li
                      key={s.placeId}
                      onMouseDown={() => selectSuggestion(s)}
                      style={{
                        padding: "0.5rem 0.75rem",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        borderBottom: "1px solid #333",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#333")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {s.description}
                    </li>
                  ))}
                </ul>
              )}
              {/* Hidden div for PlacesService */}
              <div ref={placesDiv} style={{ display: "none" }} />
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => onStart(location ?? undefined)}
        disabled={!canStart}
        style={{ fontSize: "1.2rem", padding: "0.6rem 2rem" }}
      >
        Start Session
      </button>
    </div>
  );
}
