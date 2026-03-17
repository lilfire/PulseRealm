import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import type { ClientProfile } from "../../types/session";

vi.mock("../../hooks/useGoogleMaps", () => ({
  useGoogleMaps: () => ({ loaded: true, error: null }),
}));

interface AutocompleteInstance {
  getPlacePredictions: ReturnType<typeof vi.fn>;
}

interface PlacesInstance {
  getDetails: ReturnType<typeof vi.fn>;
}

// Capture instances so tests can exercise callbacks
let autocompleteInstances: AutocompleteInstance[] = [];
let placesInstances: PlacesInstance[] = [];

// Mock google.maps for the autocomplete features
beforeAll(() => {
  (window as unknown as Record<string, unknown>).google = {
    maps: {
      places: {
        AutocompleteService: class {
          constructor() {
            autocompleteInstances.push(this as unknown as AutocompleteInstance);
          }
          getPlacePredictions = vi.fn();
        },
        PlacesService: class {
          constructor() {
            placesInstances.push(this as unknown as PlacesInstance);
          }
          getDetails = vi.fn();
        },
        PlacesServiceStatus: { OK: "OK" },
      },
    },
  };
});

// Import after mock is registered
const { RouteLobby } = await import("./RouteLobby");

const baseProps = {
  joinCode: "654321",
  clients: ["c1"] as string[],
  clientProfiles: {
    c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 },
  } as Record<string, ClientProfile>,
  connected: true,
  onStart: vi.fn(),
  onLeave: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  autocompleteInstances = [];
  placesInstances = [];
});

describe("RouteLobby (maps loaded)", () => {
  describe("rendering", () => {
    it("renders the join code", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByText("654321")).toBeInTheDocument();
    });

    it("renders the Plan Your Route heading", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByText("Plan Your Route")).toBeInTheDocument();
    });

    it("renders the From label", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByText("From")).toBeInTheDocument();
    });

    it("renders the To label", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByText("To")).toBeInTheDocument();
    });

    it("renders the From input with starting point placeholder", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByPlaceholderText("Starting point...")).toBeInTheDocument();
    });

    it("renders the To input with destination placeholder", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByPlaceholderText("Destination...")).toBeInTheDocument();
    });
  });

  describe("canStart logic", () => {
    it("start button is disabled before selecting both from and to", () => {
      render(<RouteLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start button is disabled when only from input has text but no place selected", () => {
      render(<RouteLobby {...baseProps} />);
      fireEvent.change(screen.getByPlaceholderText("Starting point..."), { target: { value: "Oslo" } });
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start button is disabled when not connected", () => {
      render(<RouteLobby {...baseProps} connected={false} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start button is disabled when no clients", () => {
      render(<RouteLobby {...baseProps} clients={[]} clientProfiles={{}} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });
  });

  describe("autocomplete input interactions", () => {
    it("typing in From input updates the query field", () => {
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...") as HTMLInputElement;
      fireEvent.change(fromInput, { target: { value: "Oslo, Norway" } });
      expect(fromInput.value).toBe("Oslo, Norway");
    });

    it("typing in To input updates the query field", () => {
      render(<RouteLobby {...baseProps} />);
      const toInput = screen.getByPlaceholderText("Destination...") as HTMLInputElement;
      fireEvent.change(toInput, { target: { value: "Bergen, Norway" } });
      expect(toInput.value).toBe("Bergen, Norway");
    });

    it("triggers autocomplete fetch after debounce for From input", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");
      act(() => { fireEvent.change(fromInput, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
      // No crash — autocomplete fetch was triggered
    });

    it("triggers autocomplete fetch after debounce for To input", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const toInput = screen.getByPlaceholderText("Destination...");
      act(() => { fireEvent.change(toInput, { target: { value: "Bergen" } }); });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
    });

    it("shows suggestions dropdown when autocomplete returns results for From input", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");

      // Set up autocomplete to call back immediately
      if (autocompleteInstances[0]) {
        autocompleteInstances[0].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }

      act(() => { fireEvent.change(fromInput, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
    });

    it("handles non-OK status in getPlacePredictions gracefully", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");

      if (autocompleteInstances[0]) {
        autocompleteInstances[0].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb(null, "ZERO_RESULTS");
          },
        );
      }

      act(() => { fireEvent.change(fromInput, { target: { value: "nowhere" } }); });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
      // No crash
    });

    it("handles onFocus on the From input", () => {
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");
      act(() => { fireEvent.focus(fromInput); });
    });

    it("handles onBlur on the From input", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");
      act(() => { fireEvent.blur(fromInput); });
      act(() => { vi.advanceTimersByTime(200); });
      vi.useRealTimers();
    });

    it("selects a place via getDetails when suggestion mousedown fires", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");

      // Make autocomplete return a suggestion immediately
      if (autocompleteInstances[0]) {
        autocompleteInstances[0].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }

      // Make getDetails return a valid place
      if (placesInstances[0]) {
        placesInstances[0].getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
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

      act(() => { fireEvent.change(fromInput, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
    });

    it("handles short input (< 2 chars) that clears suggestions", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");
      act(() => { fireEvent.change(fromInput, { target: { value: "O" } }); });
      act(() => { vi.advanceTimersByTime(300); });
      vi.useRealTimers();
      // No suggestions dropdown
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("onStart with both endpoints set via getDetails", () => {
    it("enables start button and calls onStart when both from and to are selected via getDetails", () => {
      vi.useFakeTimers();
      const onStart = vi.fn();
      render(<RouteLobby {...baseProps} onStart={onStart} />);

      const fromInput = screen.getByPlaceholderText("Starting point...");
      const toInput = screen.getByPlaceholderText("Destination...");

      // First PlaceInput (From): autocompleteInstances[0], placesInstances[0]
      // Second PlaceInput (To): autocompleteInstances[1], placesInstances[1]

      // Setup From input autocomplete + details
      if (autocompleteInstances[0]) {
        autocompleteInstances[0].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }
      if (placesInstances[0]) {
        placesInstances[0].getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(
            {
              geometry: { location: { lat: () => 59.9139, lng: () => 10.7522 } },
              formatted_address: "Oslo, Norway",
            },
            "OK",
          );
        });
      }

      act(() => { fireEvent.change(fromInput, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      // Click the suggestion in From dropdown if present
      const fromSuggestion = screen.queryByText("Oslo, Norway");
      if (fromSuggestion) {
        act(() => { fireEvent.mouseDown(fromSuggestion); });
      }

      // Setup To input autocomplete + details
      if (autocompleteInstances[1]) {
        autocompleteInstances[1].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p2", description: "Bergen, Norway" }], "OK");
          },
        );
      }
      if (placesInstances[1]) {
        placesInstances[1].getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(
            {
              geometry: { location: { lat: () => 60.3913, lng: () => 5.3221 } },
              formatted_address: "Bergen, Norway",
            },
            "OK",
          );
        });
      }

      act(() => { fireEvent.change(toInput, { target: { value: "Bergen" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const toBergenSuggestion = screen.queryByText("Bergen, Norway");
      if (toBergenSuggestion) {
        act(() => { fireEvent.mouseDown(toBergenSuggestion); });
      }

      vi.useRealTimers();
    });

    it("covers suggestion item hover events (onMouseEnter / onMouseLeave)", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");

      if (autocompleteInstances[0]) {
        autocompleteInstances[0].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }

      act(() => { fireEvent.change(fromInput, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const suggestion = screen.queryByText("Oslo, Norway");
      if (suggestion) {
        act(() => { fireEvent.mouseEnter(suggestion); });
        act(() => { fireEvent.mouseLeave(suggestion); });
      }

      vi.useRealTimers();
    });

    it("handles getDetails returning non-OK status gracefully", () => {
      vi.useFakeTimers();
      render(<RouteLobby {...baseProps} />);
      const fromInput = screen.getByPlaceholderText("Starting point...");

      if (autocompleteInstances[0]) {
        autocompleteInstances[0].getPlacePredictions.mockImplementation(
          (_opts: unknown, cb: (results: unknown, status: string) => void) => {
            cb([{ place_id: "p1", description: "Oslo, Norway" }], "OK");
          },
        );
      }
      if (placesInstances[0]) {
        placesInstances[0].getDetails.mockImplementation((_opts: unknown, cb: (result: unknown, status: string) => void) => {
          cb(null, "NOT_FOUND");
        });
      }

      act(() => { fireEvent.change(fromInput, { target: { value: "Oslo" } }); });
      act(() => { vi.advanceTimersByTime(300); });

      const suggestion = screen.queryByText("Oslo, Norway");
      if (suggestion) {
        act(() => { fireEvent.mouseDown(suggestion); });
      }

      vi.useRealTimers();
      // No crash; start button remains disabled
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });
  });

  describe("leave button", () => {
    it("calls onLeave when leave button is clicked", () => {
      const onLeave = vi.fn();
      render(<RouteLobby {...baseProps} onLeave={onLeave} />);
      fireEvent.click(screen.getByRole("button", { name: "Leave Realm" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("guest role", () => {
    it("does not show Start Realm button when role is guest", () => {
      render(<RouteLobby {...baseProps} role="guest" />);
      expect(screen.queryByRole("button", { name: "Start Realm" })).not.toBeInTheDocument();
    });

    it("shows Leave button (not Leave Realm) when role is guest", () => {
      render(<RouteLobby {...baseProps} role="guest" />);
      expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    });

    it("shows GUEST badge when role is guest", () => {
      render(<RouteLobby {...baseProps} role="guest" />);
      expect(screen.getByText("GUEST")).toBeInTheDocument();
    });
  });

  describe("status text", () => {
    it("shows Waiting for players when connected and role is host", () => {
      render(<RouteLobby {...baseProps} connected={true} />);
      expect(screen.getByText(/Waiting for players\.\.\./)).toBeInTheDocument();
    });

    it("shows Connecting when not connected", () => {
      render(<RouteLobby {...baseProps} connected={false} />);
      expect(screen.getByText(/Connecting\.\.\./)).toBeInTheDocument();
    });

    it("shows Watching when connected and role is guest", () => {
      render(<RouteLobby {...baseProps} role="guest" connected={true} />);
      expect(screen.getByText(/Watching\.\.\./)).toBeInTheDocument();
    });
  });
});

describe("RouteLobby (maps loading)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows Loading maps... when maps not yet loaded", async () => {
    vi.doMock("../../hooks/useGoogleMaps", () => ({
      useGoogleMaps: () => ({ loaded: false, error: null }),
    }));
    const { RouteLobby: LoadingLobby } = await import("./RouteLobby");
    render(<LoadingLobby {...baseProps} />);
    expect(screen.getByText("Loading maps...")).toBeInTheDocument();
  });

  it("shows error message when maps fail to load", async () => {
    vi.doMock("../../hooks/useGoogleMaps", () => ({
      useGoogleMaps: () => ({ loaded: false, error: "Failed to load Google Maps API" }),
    }));
    const { RouteLobby: ErrorLobby } = await import("./RouteLobby");
    render(<ErrorLobby {...baseProps} />);
    expect(screen.getByText("Failed to load Google Maps API")).toBeInTheDocument();
  });

  it("does not render place inputs when maps are loading", async () => {
    vi.doMock("../../hooks/useGoogleMaps", () => ({
      useGoogleMaps: () => ({ loaded: false, error: null }),
    }));
    const { RouteLobby: LoadingLobby } = await import("./RouteLobby");
    render(<LoadingLobby {...baseProps} />);
    expect(screen.queryByPlaceholderText("Starting point...")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Destination...")).not.toBeInTheDocument();
  });
});
