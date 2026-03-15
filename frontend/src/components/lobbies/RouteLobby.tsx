import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile } from "../../types/session";
import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import { LobbyShell } from "./LobbyShell";

export interface RouteEndpoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RouteConfig {
  from: RouteEndpoint;
  to: RouteEndpoint;
}

interface Props {
  joinCode: string;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (route: RouteConfig) => void;
  onLeave: () => void;
  viewOnly?: boolean;
}

interface Suggestion {
  placeId: string;
  description: string;
}

function PlaceInput({
  label,
  placeholder,
  value,
  onSelect,
  mapsLoaded,
}: {
  label: string;
  placeholder: string;
  value: RouteEndpoint | null;
  onSelect: (endpoint: RouteEndpoint) => void;
  mapsLoaded: boolean;
}) {
  const [query, setQuery] = useState(value?.address ?? "");
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
    autocompleteService.current.getPlacePredictions({ input }, (predictions, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
        setSuggestions(predictions.map((p) => ({ placeId: p.place_id, description: p.description })));
      } else {
        setSuggestions([]);
      }
    });
  }, []);

  const onInputChange = useCallback(
    (val: string) => {
      setQuery(val);
      setShowSuggestions(true);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => fetchSuggestions(val), 300);
    },
    [fetchSuggestions],
  );

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (!placesService.current) return;
      placesService.current.getDetails(
        { placeId: suggestion.placeId, fields: ["geometry", "formatted_address", "name"] },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
            const endpoint: RouteEndpoint = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              address: place.formatted_address || place.name || suggestion.description,
            };
            onSelect(endpoint);
            setQuery(endpoint.address);
            setSuggestions([]);
            setShowSuggestions(false);
          }
        },
      );
    },
    [onSelect],
  );

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", marginBottom: "0.3rem", fontWeight: 600, fontSize: "0.9rem", color: "#ccc" }}>
        {label}
      </label>
      <div style={{ position: "relative", width: "100%" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          style={{
            padding: "0.6rem 0.75rem",
            fontSize: "1rem",
            borderRadius: "6px",
            border: `2px solid ${value ? "#00D4FF" : "#555"}`,
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
        <div ref={placesDiv} style={{ display: "none" }} />
      </div>
    </div>
  );
}

export function RouteLobby({ joinCode, clients, clientProfiles, connected, onStart, onLeave, viewOnly }: Props) {
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();
  const [from, setFrom] = useState<RouteEndpoint | null>(null);
  const [to, setTo] = useState<RouteEndpoint | null>(null);

  return (
    <LobbyShell
      joinCode={joinCode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0 && from !== null && to !== null}
      onStart={() => from && to && onStart({ from, to })}
      onLeave={onLeave}
      viewOnly={viewOnly}
    >
      <div style={{ margin: "1.5rem 0", maxWidth: "420px", display: "inline-block", width: "100%", textAlign: "left" }}>
        <h3>Plan Your Route</h3>
        {mapsError ? (
          <p style={{ color: "#f87171" }}>{mapsError}</p>
        ) : !mapsLoaded ? (
          <p style={{ color: "#888" }}>Loading maps...</p>
        ) : (
          <>
            <PlaceInput
              label="From"
              placeholder="Starting point..."
              value={from}
              onSelect={setFrom}
              mapsLoaded={mapsLoaded}
            />
            <PlaceInput
              label="To"
              placeholder="Destination..."
              value={to}
              onSelect={setTo}
              mapsLoaded={mapsLoaded}
            />
            {from && to && (
              <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Route will use walking/hiking directions.
              </p>
            )}
          </>
        )}
      </div>
    </LobbyShell>
  );
}
