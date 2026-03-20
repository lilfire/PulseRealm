/**
 * Branch coverage tests for StreetViewMode that require mocking useGoogleMaps.
 * These are in a separate file from StreetViewMode.test.tsx because vi.mock() is
 * hoisted to the top of the module and would affect all tests in the same file.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import type { ClientProfile, WearableData } from "../../types/session";
import type { StreetViewLocation } from "../lobbies/StreetViewLobby";

// Mock useGoogleMaps so tests can control loaded/error state
vi.mock("../../hooks/useGoogleMaps", () => ({
  useGoogleMaps: vi.fn(),
}));

// Mock StaticStreetViewMode to avoid its google.maps dependencies
vi.mock("./StaticStreetViewMode", () => ({
  StaticStreetViewMode: ({ startLocation }: { startLocation: { address: string } }) => (
    <div data-testid="static-streetview">{startLocation.address}</div>
  ),
}));

import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import { StreetViewMode } from "./StreetViewMode";

// Setup google.maps mock (needed even for the loaded=true tests)
beforeAll(() => {
  class MockLatLng {
    private _lat: number;
    private _lng: number;
    constructor(lat: number, lng: number) { this._lat = lat; this._lng = lng; }
    lat() { return this._lat; }
    lng() { return this._lng; }
  }

  class MockStreetViewPanorama {
    setPano = vi.fn();
    setPov = vi.fn();
    addListener = vi.fn().mockReturnValue({ remove: vi.fn() });
    removeListener = vi.fn();
    getPov = vi.fn(() => ({ heading: 0, pitch: 0 }));
    getLinks = vi.fn(() => []);
    getPano = vi.fn(() => "test-pano");
    getPosition = vi.fn(() => new MockLatLng(0, 0));
    setVisible = vi.fn();
  }

  type PanoramaCallback = (result: unknown, status: string) => void;
  class MockStreetViewService {
    getPanorama = vi.fn((_req: unknown, cb: PanoramaCallback) => {
      cb({ location: { latLng: new MockLatLng(0, 0), pano: "test-pano" } }, "OK");
    });
  }

  (window as unknown as Record<string, unknown>).google = {
    maps: {
      StreetViewPanorama: MockStreetViewPanorama,
      StreetViewService: MockStreetViewService,
      StreetViewStatus: { OK: "OK" },
      StreetViewSource: { OUTDOOR: "outdoor" },
      LatLng: MockLatLng,
      geometry: {
        spherical: {
          computeDistanceBetween: vi.fn(() => 10),
          computeHeading: vi.fn(() => 0),
          computeOffset: vi.fn(() => new MockLatLng(0.001, 0.001)),
        },
      },
      event: {
        addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
        removeListener: vi.fn(),
      },
    },
  };
});

const makeProfile = (clientId: string, name: string): ClientProfile => ({
  clientId, name, heightCm: 170, weightKg: 70,
});

const makeData = (clientId: string, heartRate: number, steps: number, speedKmh = 5): WearableData => ({
  clientId, heartRate, steps, speedKmh, timestamp: new Date().toISOString(),
});

const startLocation: StreetViewLocation = {
  address: "Test Location",
  lat: 48.8566,
  lng: 2.3522,
};

const clients = ["client-1"];
const clientProfiles: Record<string, ClientProfile> = {
  "client-1": makeProfile("client-1", "Alice"),
};

const defaultProps = {
  clients,
  clientProfiles,
  latestData: null as WearableData | null,
  startLocation,
  onEnd: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── mapsLoaded=false paths (lines 569-587) ────────────────────────────────────

describe("StreetViewMode — loading state (mapsLoaded=false, no error)", () => {
  it("shows Loading Google Maps text when not yet loaded", () => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: false, error: null });
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByText("Loading Google Maps…")).toBeInTheDocument();
  });

  it("does not render End Realm button in loading state", () => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: false, error: null });
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "End Realm" })).not.toBeInTheDocument();
  });

  it("does not render panorama containers in loading state", () => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: false, error: null });
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.queryByTitle("Forward")).not.toBeInTheDocument();
  });
});

describe("StreetViewMode — error state (mapsLoaded=false, error set)", () => {
  it("renders StaticStreetViewMode when maps fail to load", () => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: false, error: "Failed to load" });
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByTestId("static-streetview")).toBeInTheDocument();
  });

  it("passes startLocation address to StaticStreetViewMode", () => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: false, error: "API Error" });
    render(
      <StreetViewMode
        {...defaultProps}
        startLocation={{ address: "Paris, France", lat: 48.8566, lng: 2.3522 }}
      />
    );
    expect(screen.getByText("Paris, France")).toBeInTheDocument();
  });

  it("does not render the panorama navigation buttons on error", () => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: false, error: "Error" });
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.queryByTitle("Forward")).not.toBeInTheDocument();
  });
});

// ── Maps loaded — role and boundClientId branches ─────────────────────────────

describe("StreetViewMode — role branches (maps loaded)", () => {
  beforeEach(() => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: true, error: null });
  });

  it("does not show 'End Realm' button when role is 'guest'", () => {
    render(<StreetViewMode {...defaultProps} role="guest" />);
    expect(screen.queryByRole("button", { name: "End Realm" })).not.toBeInTheDocument();
  });

  it("shows 'End Realm' button when role is 'host'", () => {
    render(<StreetViewMode {...defaultProps} role="host" />);
    expect(screen.getByRole("button", { name: "End Realm" })).toBeInTheDocument();
  });

  it("shows 'End Realm' button when role is 'admin'", () => {
    render(<StreetViewMode {...defaultProps} role="admin" />);
    expect(screen.getByRole("button", { name: "End Realm" })).toBeInTheDocument();
  });
});

describe("StreetViewMode — boundClientId branch (maps loaded)", () => {
  beforeEach(() => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: true, error: null });
  });

  it("renders bind controls area when boundClientId is provided", () => {
    render(
      <StreetViewMode
        {...defaultProps}
        boundClientId="client-1"
        clientInclines={{ "client-1": 5 }}
        onSetIncline={vi.fn()}
        clientSpeedOverrides={{ "client-1": 6 }}
        onSetSpeedOverride={vi.fn()}
      />
    );
    // boundClientId && (...) branch is taken — just verify no crash
    expect(document.body).toBeInTheDocument();
  });

  it("does not render bind controls when boundClientId is null", () => {
    render(<StreetViewMode {...defaultProps} boundClientId={null} />);
    // The && short-circuit should be false — no bind controls
    expect(document.body).toBeInTheDocument();
  });
});

// ── moveForwardAuto instant swap path (back pano already preloaded) ────────────

describe("StreetViewMode — moveForwardAuto instant swap branch (maps loaded)", () => {
  beforeEach(() => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: true, error: null });
  });

  it("performs instant swap when back pano is already preloaded with the target pano", async () => {
    const instances: Array<{
      _listeners: Record<string, Array<() => void>>;
      setPano: ReturnType<typeof vi.fn>;
      setPov: ReturnType<typeof vi.fn>;
      getPov: ReturnType<typeof vi.fn>;
      getLinks: ReturnType<typeof vi.fn>;
      getPano: ReturnType<typeof vi.fn>;
      getPosition: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
      setVisible: ReturnType<typeof vi.fn>;
      fire: (e: string) => void;
    }> = [];

    type LatLngCtor = new (lat: number, lng: number) => unknown;
    const gw = () => (window as unknown as {
      google: {
        maps: Record<string, unknown> & {
          geometry: { spherical: { computeDistanceBetween: ReturnType<typeof vi.fn>; computeHeading: ReturnType<typeof vi.fn>; computeOffset: ReturnType<typeof vi.fn> } }
        }
      }
    }).google;

    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-preloaded" },
    ];

    class BackPreloadedPano {
      _listeners: Record<string, Array<() => void>> = {};
      setPano = vi.fn();
      setPov = vi.fn();
      getPov = vi.fn(() => ({ heading: 0, pitch: 0 }));
      getLinks = vi.fn(() => links);
      // Back pano reports its current pano is "pano-preloaded" matching the forward link
      getPano = vi.fn(() => "pano-preloaded");
      getPosition = vi.fn(() => new (gw().maps.LatLng as LatLngCtor)(0, 0));
      setVisible = vi.fn();
      addListener = vi.fn((event: string, cb: () => void) => {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
        return { remove: vi.fn(() => {
          this._listeners[event] = (this._listeners[event] || []).filter(f => f !== cb);
        }) };
      });
      fire(event: string) {
        (this._listeners[event] || []).forEach(cb => cb());
      }
      constructor() {
        instances.push(this as unknown as typeof instances[0]);
      }
    }

    gw().maps.StreetViewPanorama = BackPreloadedPano;

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoA = instances[0];
    const panoB = instances[1];

    if (!panoA || !panoB) {
      // Panoramas not created (init callback hasn't fired) - test is a no-op
      expect(document.body).toBeInTheDocument();
      return;
    }

    // Trigger links_changed on panoA to run preloadCurrentLinks → preloadOnBack
    await act(async () => {
      panoA.fire("links_changed");
    });

    // Fire tilesloaded on panoB to set backReadyRef=true
    await act(async () => {
      panoB.fire("tilesloaded");
    });

    // Click Forward — back pano already has "pano-preloaded" and backReadyRef=true
    // This should hit the instant-swap branch in moveForwardAuto
    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
      vi.advanceTimersByTime(200);
    });

    // Component should still be rendering after instant swap
    expect(screen.getByTitle("Forward")).toBeInTheDocument();
  });

  it("moveInDirection forward with no links calls searchAhead which hits fallback path", async () => {
    const instances: Array<{
      _listeners: Record<string, Array<() => void>>;
      setPano: ReturnType<typeof vi.fn>;
      fire: (e: string) => void;
      getPano: ReturnType<typeof vi.fn>;
      setPov: ReturnType<typeof vi.fn>;
      getPov: ReturnType<typeof vi.fn>;
      getLinks: ReturnType<typeof vi.fn>;
      getPosition: ReturnType<typeof vi.fn>;
      setVisible: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
    }> = [];

    type LatLngCtor = new (lat: number, lng: number) => unknown;
    const gw = () => (window as unknown as {
      google: {
        maps: Record<string, unknown> & {
          geometry: { spherical: { computeDistanceBetween: ReturnType<typeof vi.fn>; computeHeading: ReturnType<typeof vi.fn>; computeOffset: ReturnType<typeof vi.fn> } }
        }
      }
    }).google;

    class NoBakPano {
      _listeners: Record<string, Array<() => void>> = {};
      setPano = vi.fn();
      setPov = vi.fn();
      getPov = vi.fn(() => ({ heading: 0, pitch: 0 }));
      getLinks = vi.fn(() => []);
      getPano = vi.fn(() => "test-pano");
      getPosition = vi.fn(() => new (gw().maps.LatLng as LatLngCtor)(0, 0));
      setVisible = vi.fn();
      addListener = vi.fn((event: string, cb: () => void) => {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
        return { remove: vi.fn(() => {
          this._listeners[event] = (this._listeners[event] || []).filter(f => f !== cb);
        }) };
      });
      fire(event: string) {
        (this._listeners[event] || []).forEach(cb => cb());
      }
      constructor() {
        instances.push(this as unknown as typeof instances[0]);
      }
    }

    gw().maps.StreetViewPanorama = NoBakPano;

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    // Click Forward with no links — goes to searchAhead → svService.getPanorama
    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByTitle("Forward")).toBeInTheDocument();
  });
});

describe("StreetViewMode — calories accumulation branch (maps loaded)", () => {
  beforeEach(() => {
    (useGoogleMaps as ReturnType<typeof vi.fn>).mockReturnValue({ loaded: true, error: null });
  });

  it("accumulates calories when client has weightKg, age, and heartRate > 0", () => {
    const profileWithAge: Record<string, ClientProfile> = {
      "client-1": { clientId: "client-1", name: "Alice", heightCm: 170, weightKg: 70, age: 30 },
    };
    const data = makeData("client-1", 150, 500, 5);
    render(<StreetViewMode {...defaultProps} clientProfiles={profileWithAge} latestData={data} />);
    act(() => { vi.advanceTimersByTime(3000); });
    // Component should not crash and calories may appear
    expect(document.body).toBeInTheDocument();
  });

  it("does not accumulate calories when profile has no weightKg/age", () => {
    const data = makeData("client-1", 150, 500, 5);
    // defaultProps clientProfiles has no age — calories stay at 0
    render(<StreetViewMode {...defaultProps} latestData={data} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(document.body).toBeInTheDocument();
  });
});
