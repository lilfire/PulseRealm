import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import { usePlacesProxy } from "../../hooks/usePlacesProxy";
import { computeDistanceBetween } from "../../utils/staticMaps";
import { LobbyShell } from "./LobbyShell";
import { OptionGrid } from "./OptionGrid";

export interface RouteEndpoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RouteConfig {
  from: RouteEndpoint;
  to: RouteEndpoint;
  thumbnailUrl?: string;
}

export interface CuratedRouteItem {
  fromLat: number;
  fromLng: number;
  fromAddress: string;
  toLat: number;
  toLng: number;
  toAddress: string;
  thumbnailUrl?: string;
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
  curatedRoutes?: CuratedRouteItem[] | null;
  lobbySettings?: Record<string, unknown> | null;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onRequestBind?: (clientId: string) => void;
  onCancelBind?: (clientId: string) => void;
  bindCode?: string | null;
  bindPending?: boolean;
  bindResult?: "approved" | "declined" | null;
  boundClientId?: string | null;
  clientBindings?: Record<string, boolean>;
  serverUrl?: string;
  popularity?: Record<string, number>;
}

interface Suggestion {
  placeId: string;
  description: string;
}

function resolveThumbUrl(url: string | undefined, serverUrl: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("/") && serverUrl ? `${serverUrl}${url}` : url;
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
  useProxyMode,
}: {
  label: string;
  placeholder: string;
  value: RouteEndpoint | null;
  onSelect: (endpoint: RouteEndpoint) => void;
  mapsLoaded: boolean;
  useProxyMode?: boolean;
}) {
  const proxy = usePlacesProxy();
  const [query, setQuery] = useState(value?.address ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const placesDiv = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!mapsLoaded || useProxyMode) return;
    autocompleteService.current = new google.maps.places.AutocompleteService();
    if (placesDiv.current) {
      placesService.current = new google.maps.places.PlacesService(placesDiv.current);
    }
  }, [mapsLoaded, useProxyMode]);

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
      if (useProxyMode) {
        proxy.fetchSuggestions(val);
      } else {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => fetchSuggestions(val), 300);
      }
    },
    [fetchSuggestions, useProxyMode, proxy],
  );

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (useProxyMode) {
        proxy.getDetails(suggestion.placeId).then(function (details) {
          if (details) {
            var endpoint: RouteEndpoint = { lat: details.lat, lng: details.lng, address: details.address };
            onSelect(endpoint);
            setQuery(endpoint.address);
            setSuggestions([]);
            proxy.clearSuggestions();
            setShowSuggestions(false);
          }
        });
        return;
      }
      if (!placesService.current) return;
      placesService.current.getDetails(
        { placeId: suggestion.placeId, fields: ["geometry", "formatted_address", "name"] },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
            var endpoint: RouteEndpoint = {
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
    [onSelect, useProxyMode, proxy],
  );

  var activeSuggestions = useProxyMode ? proxy.suggestions : suggestions;

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
          onFocus={() => activeSuggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          style={{
            padding: "0.6rem 0.75rem",
            fontSize: "1rem",
            borderRadius: "6px",
            border: "2px solid " + (value ? "#33DFFF" : "#555"),
            width: "100%",
            background: "#1a1a1a",
            color: "#fff",
            boxSizing: "border-box",
          }}
        />
        {showSuggestions && activeSuggestions.length > 0 && (
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
            {activeSuggestions.map((s) => (
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

export function RouteLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret, curatedRoutes, lobbySettings, onSettingsChange, onRequestBind, onCancelBind, bindCode, bindPending, bindResult, boundClientId, clientBindings, serverUrl, popularity }: Props) {
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();
  const [from, setFrom] = useState<RouteEndpoint | null>(null);
  const [to, setTo] = useState<RouteEndpoint | null>(null);

  const [sortByPopularity, setSortByPopularity] = useState(false);
  const getRouteKey = (r: RouteConfig) => `route:${r.from.lat.toFixed(4)},${r.from.lng.toFixed(4)}:${r.to.lat.toFixed(4)},${r.to.lng.toFixed(4)}`;
  const rawRoutes: RouteConfig[] = curatedRoutes && curatedRoutes.length > 0
    ? curatedRoutes.map((r) => ({
        from: { lat: r.fromLat, lng: r.fromLng, address: r.fromAddress },
        to: { lat: r.toLat, lng: r.toLng, address: r.toAddress },
        thumbnailUrl: r.thumbnailUrl,
      }))
    : CURATED_ROUTES;
  const routes = sortByPopularity
    ? [...rawRoutes].sort((a, b) => ((popularity?.[getRouteKey(b)] ?? 0) - (popularity?.[getRouteKey(a)] ?? 0)))
    : rawRoutes;

  const isHost = role === "host" || role === "admin";
  const settingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isHost || !onSettingsChange || !from) return;
    if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current);
    settingsDebounceRef.current = setTimeout(() => {
      onSettingsChange({ from, to });
    }, 300);
    return () => { if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current); };
  }, [isHost, onSettingsChange, from, to]);

  useEffect(() => {
    if (role !== "guest" || !lobbySettings) return;
    const f = lobbySettings.from as RouteEndpoint | undefined;
    const t = lobbySettings.to as RouteEndpoint | undefined;
    if (f && typeof f.lat === "number" && typeof f.lng === "number" && typeof f.address === "string")
      setFrom(f);
    if (t && typeof t.lat === "number" && typeof t.lng === "number" && typeof t.address === "string")
      setTo(t);
  }, [role, lobbySettings]);

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
      onRequestBind={onRequestBind}
      onCancelBind={onCancelBind}
      bindCode={bindCode}
      bindPending={bindPending}
      bindResult={bindResult}
      boundClientId={boundClientId}
      clientBindings={clientBindings}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingTop: "1.5rem", textAlign: "left" }}>
        <div style={{ maxWidth: "420px", flexShrink: 0 }}>
          <h3 style={{ marginTop: 0 }}>Plan Your Route</h3>
          {!mapsLoaded && !mapsError ? (
            <p style={{ color: "#888" }}>Loading maps...</p>
          ) : (
            <>
              <PlaceInput
                label="From"
                placeholder="Starting point..."
                value={from}
                onSelect={setFrom}
                mapsLoaded={mapsLoaded}
                useProxyMode={!!mapsError}
              />
              <PlaceInput
                label="To"
                placeholder="Destination..."
                value={to}
                onSelect={setTo}
                mapsLoaded={mapsLoaded}
                useProxyMode={!!mapsError}
              />
              {from && to && (
                <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Route will use walking/hiking directions.
                </p>
              )}
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", margin: "1rem 0 0.5rem" }}>
            <p style={{ color: "#aaa", fontSize: "0.85rem", margin: 0 }}>Or pick a curated route:</p>
            <button
              onClick={() => setSortByPopularity(!sortByPopularity)}
              style={{
                marginLeft: "auto",
                background: sortByPopularity ? "rgba(0,212,255,0.15)" : "transparent",
                border: sortByPopularity ? "1px solid #33DFFF" : "1px solid #555",
                color: sortByPopularity ? "#33DFFF" : "#aaa",
                borderRadius: "4px",
                padding: "0.25rem 0.6rem",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Most popular
            </button>
          </div>
        </div>
        {(mapsLoaded || mapsError) && (
          <OptionGrid
            items={routes}
            cardMinWidth={280}
            cardHeight={90}
            gap={12}
            keyExtractor={(_, i) => String(i)}
            renderCard={(r) => {
              const isSelected = from?.address === r.from.address && to?.address === r.to.address;
              const thumb = resolveThumbUrl(r.thumbnailUrl, serverUrl);
              return (
                <div
                  onClick={() => { setFrom(r.from); setTo(r.to); }}
                  style={{
                    padding: "0.6rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    borderRadius: "6px",
                    border: isSelected ? "2px solid #33DFFF" : "1px solid #333",
                    background: isSelected ? "rgba(0,212,255,0.1)" : "#1a1a1a",
                    height: "100%",
                    boxSizing: "border-box",
                    transition: "background 0.15s, border-color 0.15s",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#2a2a2a"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "#1a1a1a"; }}
                >
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: "80px", height: "60px", borderRadius: "4px", objectFit: "cover", flexShrink: 0, marginRight: "0.75rem" }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.from.address}</div>
                    <div style={{ color: "#888", fontSize: "0.8rem", marginTop: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>to {r.to.address}</div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ color: "#33DFFF", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                        ~{(computeDistanceBetween(r.from, r.to) / 1000).toFixed(1)} km
                      </div>
                      {(popularity?.[getRouteKey(r)] ?? 0) > 0 && (
                        <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem", marginLeft: "0.75rem" }}>{popularity![getRouteKey(r)]}x played</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
    </LobbyShell>
  );
}
