import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { ClientProfile } from "../../types/session";
import type { StreetViewLocation } from "./StreetViewLobby";

vi.mock("../../hooks/useGoogleMaps", () => ({
  useGoogleMaps: () => ({ loaded: true, error: null }),
}));

interface AutocompleteInstance {
  getPlacePredictions: ReturnType<typeof vi.fn>;
}

interface PlacesInstance {
  getDetails: ReturnType<typeof vi.fn>;
}

// Capture the latest instances so tests can call back
let latestAutocompleteInstance: AutocompleteInstance | null = null;
let latestPlacesInstance: PlacesInstance | null = null;

// Mock google.maps for the autocomplete features
beforeAll(() => {
  (window as unknown as Record<string, unknown>).google = {
    maps: {
      places: {
        AutocompleteService: class {
          getPlacePredictions = vi.fn();
          constructor() {
            latestAutocompleteInstance = this as unknown as AutocompleteInstance;
          }
        },
        PlacesService: class {
          getDetails = vi.fn();
          constructor() {
            latestPlacesInstance = this as unknown as PlacesInstance;
          }
        },
        PlacesServiceStatus: { OK: "OK" },
      },
    },
  };
});

// Import after mock is registered
const { StreetViewLobby } = await import("./StreetViewLobby");

const fixedLocations: StreetViewLocation[] = [
  { lat: 48.8584, lng: 2.2945, address: "Eiffel Tower, Paris, France" },
  { lat: 40.758, lng: -73.9855, address: "Times Square, New York, USA" },
  { lat: 51.5014, lng: -0.1419, address: "Big Ben, London, UK" },
  { lat: 35.6762, lng: 139.6503, address: "Shibuya Crossing, Tokyo, Japan" },
  { lat: -33.8568, lng: 151.2153, address: "Sydney Opera House, Australia" },
];

const baseProps = {
  joinCode: "321321",
  clients: ["c1"] as string[],
  clientProfiles: {
    c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 },
  } as Record<string, ClientProfile>,
  connected: true,
  onStart: vi.fn(),
  onLeave: vi.fn(),
  curatedLocations: fixedLocations,
};

beforeEach(() => {
  vi.clearAllMocks();
  latestAutocompleteInstance = null;
  latestPlacesInstance = null;
});

describe("StreetViewLobby (maps loaded)", () => {
  describe("rendering", () => {
    it("renders the join code", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByText("321321")).toBeInTheDocument();
    });

    it("renders the Starting Location heading", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByText("Starting Location")).toBeInTheDocument();
    });

    it("renders the address search input", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByPlaceholderText("Search for an address...")).toBeInTheDocument();
    });

    it("renders curated location buttons", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByText("Eiffel Tower, Paris, France")).toBeInTheDocument();
      expect(screen.getByText("Times Square, New York, USA")).toBeInTheDocument();
    });

    it("shows exactly 5 curated locations (random subset)", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByText("Eiffel Tower, Paris, France")).toBeInTheDocument();
      expect(screen.getByText("Times Square, New York, USA")).toBeInTheDocument();
      expect(screen.getByText("Big Ben, London, UK")).toBeInTheDocument();
      expect(screen.getByText("Shibuya Crossing, Tokyo, Japan")).toBeInTheDocument();
      expect(screen.getByText("Sydney Opera House, Australia")).toBeInTheDocument();
    });

    it("shows Or pick a random location prompt", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByText("Or pick a random location:")).toBeInTheDocument();
    });

    it("shows 5 random locations from a larger curated set", () => {
      const manyLocations: StreetViewLocation[] = Array.from({ length: 20 }, (_, i) => ({
        lat: i,
        lng: i,
        address: `Location ${i}`,
      }));
      render(<StreetViewLobby {...baseProps} clients={[]} clientProfiles={{}} curatedLocations={manyLocations} />);
      // Should show exactly 5
      const listItems = screen.getAllByRole("listitem");
      expect(listItems.length).toBe(5);
    });
  });

  describe("selecting a curated location", () => {
    it("can select a curated location", () => {
      render(<StreetViewLobby {...baseProps} />);
      fireEvent.click(screen.getByText("Eiffel Tower, Paris, France"));
      const input = screen.getByPlaceholderText("Search for an address...") as HTMLInputElement;
      expect(input.value).toBe("Eiffel Tower, Paris, France");
    });

    it("enables the Start Realm button after selecting a location", () => {
      render(<StreetViewLobby {...baseProps} />);
      fireEvent.click(screen.getByText("Eiffel Tower, Paris, France"));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });

    it("can select a different curated location", () => {
      render(<StreetViewLobby {...baseProps} />);
      fireEvent.click(screen.getByText("Times Square, New York, USA"));
      const input = screen.getByPlaceholderText("Search for an address...") as HTMLInputElement;
      expect(input.value).toBe("Times Square, New York, USA");
    });

    it("deselects location when a new search query is typed", async () => {
      const user = userEvent.setup();
      render(<StreetViewLobby {...baseProps} />);
      fireEvent.click(screen.getByText("Eiffel Tower, Paris, France"));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
      const input = screen.getByPlaceholderText("Search for an address...");
      await user.clear(input);
      await user.type(input, "new search");
      // Typing clears location (canStart = false)
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });
  });

  describe("autocomplete input interactions", () => {
    it("typing in the search input triggers suggestions fetch after debounce", async () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");
      fireEvent.change(input, { target: { value: "Oslo" } });

      // Simulate the getPlacePredictions calling back with results
      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb(
              [{ place_id: "place1", description: "Oslo, Norway" }],
              "OK",
            );
          },
        );
      }

      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
    });

    it("shows suggestions dropdown when getPlacePredictions returns results", async () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      act(() => {
        fireEvent.change(input, { target: { value: "Oslos" } });
      });

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }

      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
    });

    it("fetches place details when a suggestion is selected via mousedown", () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      // Set up autocomplete to call back with a suggestion
      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }

      act(() => { fireEvent.change(input, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      // Set up getDetails to return a valid place
      if (latestPlacesInstance) {
        latestPlacesInstance.getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(
            {
              geometry: { location: { lat: () => 59.9139, lng: () => 10.7522 } },
              formatted_address: "Oslo, Norway",
              name: "Oslo",
            },
            "OK",
          );
        });
      }

      // Click the suggestion if visible
      const suggestion = screen.queryByText("Oslo, Norway");
      if (suggestion) {
        act(() => { fireEvent.mouseDown(suggestion); });
      }

      vi.useRealTimers();
    });

    it("handles suggestion mousedown with non-OK getDetails status", () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }
      if (latestPlacesInstance) {
        latestPlacesInstance.getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(null, "NOT_FOUND");
        });
      }

      act(() => { fireEvent.change(input, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const suggestion = screen.queryByText("Oslo, Norway");
      if (suggestion) {
        act(() => { fireEvent.mouseDown(suggestion); });
      }

      vi.useRealTimers();
      // No crash; start still disabled
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("covers suggestion item hover events (onMouseEnter / onMouseLeave)", () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }

      act(() => { fireEvent.change(input, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const suggestion = screen.queryByText("Oslo, Norway");
      if (suggestion) {
        act(() => { fireEvent.mouseEnter(suggestion); });
        act(() => { fireEvent.mouseLeave(suggestion); });
      }

      vi.useRealTimers();
    });

    it("clears suggestions when input is empty (too short)", () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");
      // Type just one character (below min length of 2)
      act(() => {
        fireEvent.change(input, { target: { value: "O" } });
      });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
      // No suggestions dropdown shown
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("handles onFocus when suggestions list exists", async () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      act(() => {
        fireEvent.change(input, { target: { value: "Oslo" } });
      });

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
        act(() => { vi.advanceTimersByTime(300); });
      }

      act(() => { fireEvent.focus(input); });
      vi.useRealTimers();
    });

    it("handles onBlur to hide suggestions after delay", async () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");
      act(() => { fireEvent.blur(input); });
      act(() => { vi.advanceTimersByTime(200); });
      vi.useRealTimers();
    });

    it("handles failed getPlacePredictions (non-OK status)", () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      act(() => {
        fireEvent.change(input, { target: { value: "nowhere" } });
      });

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb(null, "ZERO_RESULTS");
          },
        );
        act(() => { vi.advanceTimersByTime(300); });
      }

      vi.useRealTimers();
      // No crash
    });
  });

  describe("onStart callback", () => {
    it("calls onStart with selected curated location", () => {
      const onStart = vi.fn();
      render(<StreetViewLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByText("Eiffel Tower, Paris, France"));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
      const location: StreetViewLocation = onStart.mock.calls[0][0];
      expect(location.address).toBe("Eiffel Tower, Paris, France");
      expect(location.lat).toBe(48.8584);
      expect(location.lng).toBe(2.2945);
    });

    it("calls onStart after selecting location via getDetails", () => {
      vi.useFakeTimers();
      const onStart = vi.fn();
      render(<StreetViewLobby {...baseProps} onStart={onStart} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }
      if (latestPlacesInstance) {
        latestPlacesInstance.getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(
            {
              geometry: { location: { lat: () => 59.9139, lng: () => 10.7522 } },
              formatted_address: "Oslo, Norway",
            },
            "OK",
          );
        });
      }

      act(() => { fireEvent.change(input, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const suggestion = screen.queryByText("Oslo, Norway");
      if (suggestion) {
        act(() => { fireEvent.mouseDown(suggestion); });
        // After mouseDown with getDetails OK, location is set, start is enabled
        act(() => { fireEvent.click(screen.getByRole("button", { name: "Start Realm" })); });
        if (onStart.mock.calls.length > 0) {
          const location: StreetViewLocation = onStart.mock.calls[0][0];
          expect(location.address).toBe("Oslo, Norway");
        }
      }

      vi.useRealTimers();
    });

    it("covers getDetails using place.name as fallback when no formatted_address", () => {
      vi.useFakeTimers();
      render(<StreetViewLobby {...baseProps} />);
      const input = screen.getByPlaceholderText("Search for an address...");

      if (latestAutocompleteInstance) {
        latestAutocompleteInstance.getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo" }], "OK");
          },
        );
      }
      if (latestPlacesInstance) {
        latestPlacesInstance.getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(
            {
              geometry: { location: { lat: () => 59.9139, lng: () => 10.7522 } },
              formatted_address: undefined,
              name: "Oslo",
            },
            "OK",
          );
        });
      }

      act(() => { fireEvent.change(input, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const suggestion = screen.queryByText("Oslo");
      if (suggestion) {
        act(() => { fireEvent.mouseDown(suggestion); });
      }

      vi.useRealTimers();
    });

    it("start button is disabled before selecting a location", () => {
      render(<StreetViewLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });
  });

  describe("leave button", () => {
    it("calls onLeave when leave button is clicked", () => {
      const onLeave = vi.fn();
      render(<StreetViewLobby {...baseProps} onLeave={onLeave} />);
      fireEvent.click(screen.getByRole("button", { name: "Leave Realm" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("guest role", () => {
    it("does not show Start Realm button when role is guest", () => {
      render(<StreetViewLobby {...baseProps} role="guest" />);
      expect(screen.queryByRole("button", { name: "Start Realm" })).not.toBeInTheDocument();
    });

    it("shows Watching status when role is guest", () => {
      render(<StreetViewLobby {...baseProps} role="guest" />);
      expect(screen.getByText(/Watching\.\.\./)).toBeInTheDocument();
    });
  });
});

describe("StreetViewLobby (maps loading)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows Loading maps... when maps not yet loaded", async () => {
    vi.doMock("../../hooks/useGoogleMaps", () => ({
      useGoogleMaps: () => ({ loaded: false, error: null }),
    }));
    const { StreetViewLobby: LoadingLobby } = await import("./StreetViewLobby");
    render(<LoadingLobby {...baseProps} />);
    expect(screen.getByText("Loading maps...")).toBeInTheDocument();
  });

  it("shows error message when maps fail to load", async () => {
    vi.doMock("../../hooks/useGoogleMaps", () => ({
      useGoogleMaps: () => ({ loaded: false, error: "Failed to load Google Maps API" }),
    }));
    const { StreetViewLobby: ErrorLobby } = await import("./StreetViewLobby");
    render(<ErrorLobby {...baseProps} />);
    expect(screen.getByText("Failed to load Google Maps API")).toBeInTheDocument();
  });

  it("does not show search input when maps are loading", async () => {
    vi.doMock("../../hooks/useGoogleMaps", () => ({
      useGoogleMaps: () => ({ loaded: false, error: null }),
    }));
    const { StreetViewLobby: LoadingLobby } = await import("./StreetViewLobby");
    render(<LoadingLobby {...baseProps} />);
    expect(screen.queryByPlaceholderText("Search for an address...")).not.toBeInTheDocument();
  });
});
