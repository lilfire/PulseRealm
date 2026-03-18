import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientProfile, RealmMode, RealmRole } from "../../types/session";
import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import { usePlacesProxy } from "../../hooks/usePlacesProxy";
import { LobbyShell } from "./LobbyShell";

export interface StreetViewLocation {
  lat: number;
  lng: number;
  address: string;
}

interface Props {
  joinCode: string;
  mode: RealmMode;
  clients: string[];
  clientProfiles: Record<string, ClientProfile>;
  connected: boolean;
  onStart: (location: StreetViewLocation) => void;
  onLeave: () => void;
  onEnd?: () => void;
  onKick?: (clientId: string) => void;
  role?: RealmRole;
  hostSecret?: string;
  curatedLocations?: StreetViewLocation[] | null;
}

interface Suggestion {
  placeId: string;
  description: string;
}

const CURATED_LOCATIONS: StreetViewLocation[] = [
  { lat: 48.8584, lng: 2.2945, address: "Eiffel Tower, Paris, France" },
  { lat: 40.7580, lng: -73.9855, address: "Times Square, New York, USA" },
  { lat: 51.5014, lng: -0.1419, address: "Big Ben, London, UK" },
  { lat: 35.6762, lng: 139.6503, address: "Shibuya Crossing, Tokyo, Japan" },
  { lat: -33.8568, lng: 151.2153, address: "Sydney Opera House, Australia" },
  { lat: 41.8902, lng: 12.4922, address: "Colosseum, Rome, Italy" },
  { lat: 37.8199, lng: -122.4783, address: "Golden Gate Bridge, San Francisco, USA" },
  { lat: 52.5163, lng: 13.3777, address: "Brandenburg Gate, Berlin, Germany" },
  { lat: 55.7558, lng: 37.6173, address: "Red Square, Moscow, Russia" },
  { lat: -22.9519, lng: -43.2105, address: "Copacabana Beach, Rio de Janeiro, Brazil" },
  { lat: 1.2816, lng: 103.8636, address: "Marina Bay Sands, Singapore" },
  { lat: 59.9139, lng: 10.7522, address: "Karl Johans gate, Oslo, Norway" },
  { lat: 64.1466, lng: -21.9426, address: "Hallgrímskirkja, Reykjavik, Iceland" },
  { lat: 34.0522, lng: -118.2437, address: "Hollywood Blvd, Los Angeles, USA" },
  { lat: 41.0082, lng: 28.9784, address: "Hagia Sophia, Istanbul, Turkey" },
  { lat: 48.2082, lng: 16.3738, address: "St. Stephen's Cathedral, Vienna, Austria" },
  { lat: -13.1631, lng: -72.5450, address: "Machu Picchu, Peru" },
  { lat: 25.1972, lng: 55.2744, address: "Burj Khalifa, Dubai, UAE" },
  { lat: 37.9715, lng: 23.7267, address: "Acropolis, Athens, Greece" },
  { lat: 43.7230, lng: 10.3966, address: "Leaning Tower of Pisa, Italy" },
  { lat: 59.3293, lng: 18.0686, address: "Gamla Stan, Stockholm, Sweden" },
  { lat: 50.0755, lng: 14.4378, address: "Charles Bridge, Prague, Czech Republic" },
  { lat: 47.4979, lng: 19.0402, address: "Hungarian Parliament, Budapest, Hungary" },
  { lat: 35.0116, lng: 135.7681, address: "Fushimi Inari Shrine, Kyoto, Japan" },
  { lat: 40.4168, lng: -3.7038, address: "Puerta del Sol, Madrid, Spain" },
  { lat: 59.4025, lng: 9.4204, address: "Narefjell, Norway" },
  { lat: 58.9864, lng: 6.1904, address: "Preikestolen, Norway" },
  { lat: 60.1242, lng: 6.7400, address: "Trolltunga, Norway" },
  { lat: 59.0343, lng: 6.5890, address: "Kjeragbolten, Norway" },
  { lat: 61.4953, lng: 8.0819, address: "Besseggen, Jotunheimen, Norway" },
  { lat: 62.4566, lng: 7.6708, address: "Romsdalseggen, Norway" },
  { lat: 62.4552, lng: 7.6703, address: "Trollstigen, Norway" },
  { lat: 67.9331, lng: 13.0848, address: "Reinebringen, Lofoten, Norway" },
  { lat: 63.0176, lng: 7.3585, address: "Atlanterhavsveien, Norway" },
  { lat: 59.9619, lng: 10.7004, address: "Vettakollen, Oslo, Norway" },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function StreetViewLobby({ joinCode, mode, clients, clientProfiles, connected, onStart, onLeave, onEnd, onKick, role, hostSecret, curatedLocations }: Props) {
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps();
  const proxy = usePlacesProxy();
  const [location, setLocation] = useState<StreetViewLocation | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const locations = curatedLocations && curatedLocations.length > 0 ? curatedLocations : CURATED_LOCATIONS;
  const [randomLocations] = useState(() => pickRandom(locations, 5));

  // Use server proxy when Maps JS SDK is unavailable (Chrome 74)
  const useProxy = !!mapsError;

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

      if (useProxy) {
        proxy.fetchSuggestions(value);
      } else {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => fetchSuggestions(value), 300);
      }
    },
    [fetchSuggestions, useProxy, proxy],
  );

  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    if (useProxy) {
      proxy.getDetails(suggestion.placeId).then(function (details) {
        if (details) {
          setLocation({ lat: details.lat, lng: details.lng, address: details.address });
          setQuery(details.address);
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
  }, [useProxy, proxy]);

  return (
    <LobbyShell
      joinCode={joinCode}
      mode={mode}
      clients={clients}
      clientProfiles={clientProfiles}
      connected={connected}
      canStart={connected && clients.length > 0 && location !== null}
      onStart={() => location && onStart(location)}
      onLeave={onLeave}
      onEnd={onEnd}
      onKick={onKick}
      role={role}
      hostSecret={hostSecret}
    >
      <div style={{ margin: "1.5rem 0" }}>
        <h3>Starting Location</h3>
        {!mapsLoaded && !mapsError ? (
          <p style={{ color: "#888" }}>Loading maps...</p>
        ) : (
          <div style={{ position: "relative", display: "inline-block", width: "100%", maxWidth: "420px" }}>
            <input
              type="text"
              value={query}
              onChange={(e) => onInputChange(e.target.value)}
              onFocus={() => (useProxy ? proxy.suggestions : suggestions).length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search for an address..."
              style={{
                padding: "0.6rem 0.75rem",
                fontSize: "1rem",
                borderRadius: "6px",
                border: "2px solid " + (location ? "#00D4FF" : "#555"),
                width: "100%",
                background: "#1a1a1a",
                color: "#fff",
                boxSizing: "border-box",
              }}
            />
            {showSuggestions && (useProxy ? proxy.suggestions : suggestions).length > 0 && (
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
                {(useProxy ? proxy.suggestions : suggestions).map((s) => (
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
            {/* Hidden div for PlacesService */}
            <div ref={placesDiv} style={{ display: "none" }} />
          </div>
        )}

        <div style={{ marginTop: "1rem", textAlign: "left", maxWidth: "420px", display: "inline-block", width: "100%" }}>
          <p style={{ color: "#aaa", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>Or pick a random location:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {randomLocations.map((loc) => (
              <li
                key={loc.address}
                onClick={() => {
                  setLocation(loc);
                  setQuery(loc.address);
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  borderRadius: "4px",
                  border: location?.address === loc.address ? "1px solid #00D4FF" : "1px solid #333",
                  marginBottom: "0.4rem",
                  background: location?.address === loc.address ? "rgba(0,212,255,0.1)" : "#1a1a1a",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (location?.address !== loc.address) e.currentTarget.style.background = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  if (location?.address !== loc.address) e.currentTarget.style.background = "#1a1a1a";
                }}
              >
                {loc.address}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </LobbyShell>
  );
}
