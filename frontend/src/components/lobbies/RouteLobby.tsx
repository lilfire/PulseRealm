import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
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
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (route: RouteConfig) => void;
  onLeave: () => void;
  onEnd?: () => void;
  onKick?: (clientId: string) => void;
  role?: RealmRole;
  hostSecret?: string;
}

interface Suggestion {
  placeId: string;
  description: string;
}

const CURATED_ROUTES: RouteConfig[] = [
  { from: { lat: 48.8584, lng: 2.2945, address: "Eiffel Tower, Paris" }, to: { lat: 48.8606, lng: 2.3376, address: "Louvre Museum, Paris" } },
  { from: { lat: 40.7484, lng: -73.9857, address: "Empire State Building, NYC" }, to: { lat: 40.7580, lng: -73.9855, address: "Times Square, NYC" } },
  { from: { lat: 51.5014, lng: -0.1419, address: "Big Ben, London" }, to: { lat: 51.5081, lng: -0.0759, address: "Tower of London" } },
  { from: { lat: 41.8902, lng: 12.4922, address: "Colosseum, Rome" }, to: { lat: 41.9029, lng: 12.4534, address: "Vatican City, Rome" } },
  { from: { lat: 35.6762, lng: 139.6503, address: "Shibuya, Tokyo" }, to: { lat: 35.6586, lng: 139.7454, address: "Tokyo Tower" } },
  { from: { lat: 37.8199, lng: -122.4783, address: "Golden Gate Bridge, SF" }, to: { lat: 37.8083, lng: -122.4156, address: "Fisherman's Wharf, SF" } },
  { from: { lat: 52.5163, lng: 13.3777, address: "Brandenburg Gate, Berlin" }, to: { lat: 52.5209, lng: 13.4094, address: "Alexanderplatz, Berlin" } },
  { from: { lat: 59.9139, lng: 10.7522, address: "Karl Johans gate, Oslo" }, to: { lat: 59.9050, lng: 10.7505, address: "Aker Brygge, Oslo" } },
  { from: { lat: -33.8568, lng: 151.2153, address: "Sydney Opera House" }, to: { lat: -33.8523, lng: 151.2108, address: "Sydney Harbour Bridge" } },
  { from: { lat: 50.0755, lng: 14.4378, address: "Charles Bridge, Prague" }, to: { lat: 50.0865, lng: 14.4200, address: "Prague Castle" } },
];

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
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!mapsLoaded) return;
    autocompleteService.current = new google.maps.places.AutocompleteService();
    if (placesDiv.current) {
      placesService.current = new google.maps.places.PlacesService(placesDiv.current);
    }
  }, [mapsLoaded]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

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
            role="listbox"
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
                role="option"
                aria-selected={false}
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

export function RouteLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret }: Props) {
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();
  const [from, setFrom] = useState<RouteEndpoint | null>(null);
  const [to, setTo] = useState<RouteEndpoint | null>(null);

  return (
    <LobbyShell
      joinCode={joinCode}
      mode={mode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0 && from !== null && to !== null}
      onStart={() => from && to && onStart({ from, to })}
      onLeave={onLeave}
      onEnd={onEnd}
      onKick={onKick}
      role={role}
      hostSecret={hostSecret}
    >
      <div style={{ margin: "1.5rem 0", maxWidth: "420px", width: "100%", textAlign: "left" }}>
        <h3>Plan Your Route</h3>
        {mapsError ? (
          <>
            <p style={{ color: "#f59e0b", fontSize: "0.85rem" }}>Place search unavailable (limited browser). Pick a curated route:</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0", maxHeight: "400px", overflowY: "auto" }}>
              {CURATED_ROUTES.map((r, i) => {
                const isSelected = from?.address === r.from.address && to?.address === r.to.address;
                return (
                  <li
                    key={i}
                    onClick={() => { setFrom(r.from); setTo(r.to); }}
                    style={{
                      padding: "0.6rem 0.75rem",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      borderRadius: "4px",
                      border: isSelected ? "1px solid #00D4FF" : "1px solid #333",
                      marginBottom: "0.4rem",
                      background: isSelected ? "rgba(0,212,255,0.1)" : "#1a1a1a",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#2a2a2a"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "#1a1a1a"; }}
                  >
                    <div>{r.from.address}</div>
                    <div style={{ color: "#888", fontSize: "0.8rem" }}>to {r.to.address}</div>
                  </li>
                );
              })}
            </ul>
          </>
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
