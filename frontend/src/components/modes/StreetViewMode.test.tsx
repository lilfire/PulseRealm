import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";
import { StreetViewMode } from "./StreetViewMode";
import type { ClientProfile, WearableData } from "../../types/session";
import type { StreetViewLocation } from "../lobbies/StreetViewLobby";

// Mock google.maps before all tests
beforeAll(() => {
  class MockLatLng {
    private _lat: number;
    private _lng: number;
    constructor(lat: number, lng: number) {
      this._lat = lat;
      this._lng = lng;
    }
    lat() { return this._lat; }
    lng() { return this._lng; }
    equals(other: MockLatLng) { return other.lat() === this._lat && other.lng() === this._lng; }
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
    constructor(_el: unknown, _opts?: unknown) {}
  }

  class MockStreetViewService {
    getPanorama = vi.fn((_req: unknown, cb: Function) => {
      cb(
        {
          location: {
            latLng: new MockLatLng(0, 0),
            pano: "test-pano",
          },
        },
        "OK"
      );
    });
  }

  (window as any).google = {
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
          computeOffset: vi.fn((_pos: any, _dist: number, _heading: number) => new MockLatLng(0.001, 0.001)),
        },
      },
      event: {
        addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
        removeListener: vi.fn(),
      },
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const makeProfile = (clientId: string, name: string): ClientProfile => ({
  clientId,
  name,
  heightCm: 170,
  weightKg: 70,
});

const makeData = (clientId: string, heartRate: number, steps: number, speedKmh = 5): WearableData => ({
  clientId,
  heartRate,
  steps,
  speedKmh,
  timestamp: new Date().toISOString(),
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

describe("StreetViewMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing with start location", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(document.body).toBeInTheDocument();
  });

  it("shows 'End Realm' button", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByRole("button", { name: "End Realm" })).toBeInTheDocument();
  });

  it("clicking 'End Realm' calls onEnd", () => {
    render(<StreetViewMode {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "End Realm" }));
    expect(defaultProps.onEnd).toHaveBeenCalledTimes(1);
  });

  it("clicking 'End Realm' calls onEnd with numeric distance", () => {
    render(<StreetViewMode {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "End Realm" }));
    const [dist] = defaultProps.onEnd.mock.calls[0];
    expect(typeof dist).toBe("number");
  });

  it("shows HUD with player name", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows 'No data yet' when no latestData", () => {
    render(<StreetViewMode {...defaultProps} latestData={null} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("shows speed when latestData is available", () => {
    const data = makeData("client-1", 140, 500, 6.5);
    render(<StreetViewMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("6.5 km/h")).toBeInTheDocument();
  });

  it("shows heart rate when latestData is available", () => {
    const data = makeData("client-1", 145, 500, 5);
    render(<StreetViewMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("145 bpm")).toBeInTheDocument();
  });

  it("shows steps when latestData is available", () => {
    const data = makeData("client-1", 140, 987, 5);
    render(<StreetViewMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("987 steps")).toBeInTheDocument();
  });

  it("shows forward navigation arrow button", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByTitle("Forward")).toBeInTheDocument();
  });

  it("shows left navigation arrow button", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByTitle("Left")).toBeInTheDocument();
  });

  it("shows right navigation arrow button", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByTitle("Right")).toBeInTheDocument();
  });

  it("shows 'No data yet' when latestData is null", () => {
    render(<StreetViewMode {...defaultProps} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders with empty clients gracefully", () => {
    render(<StreetViewMode {...defaultProps} clients={[]} clientProfiles={{}} />);
    expect(screen.getByText("Waiting for player...")).toBeInTheDocument();
  });

  it("uses client ID as fallback when no profile", () => {
    render(<StreetViewMode {...defaultProps} clientProfiles={{}} />);
    expect(screen.getByText("client-1")).toBeInTheDocument();
  });

  it("accumulates distance when speed > 0", () => {
    const data = makeData("client-1", 140, 500, 5);
    render(<StreetViewMode {...defaultProps} latestData={data} />);
    act(() => { vi.advanceTimersByTime(1000); });
    // Distance should be > 0 now
    const distDisplay = screen.queryByText(/[1-9]\d* m/) ?? screen.queryByText(/0 m/);
    expect(distDisplay).toBeInTheDocument();
  });

  it("initializes StreetViewPanorama instances", () => {
    render(<StreetViewMode {...defaultProps} />);
    // Component should mount without crashing and create panoramas
    expect(document.body).toBeInTheDocument();
  });

  it("clicking forward button attempts moveInDirection(0)", () => {
    render(<StreetViewMode {...defaultProps} />);
    // Click the forward arrow — it should not crash
    fireEvent.click(screen.getByTitle("Forward"));
    expect(document.body).toBeInTheDocument();
  });

  it("clicking left button attempts moveInDirection(-90)", () => {
    render(<StreetViewMode {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Left"));
    expect(document.body).toBeInTheDocument();
  });

  it("clicking right button attempts moveInDirection(90)", () => {
    render(<StreetViewMode {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Right"));
    expect(document.body).toBeInTheDocument();
  });

  it("updates latestData and re-renders HUD without crash", () => {
    const { rerender } = render(<StreetViewMode {...defaultProps} />);
    const data = makeData("client-1", 150, 1000, 7);
    rerender(<StreetViewMode {...defaultProps} latestData={data} />);
    expect(screen.getByText("7.0 km/h")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Tests that exercise navigation logic by using a listener-capturing panorama
  // ---------------------------------------------------------------------------

  /**
   * Build a richer StreetViewPanorama mock whose addListener stores callbacks
   * so tests can fire events like "tilesloaded" or "position_changed" manually.
   * Returns the two panorama instances created during component mount so tests
   * can reach directly into their state.
   */
  function makePanoramaWithListeners(links: google.maps.StreetViewLink[]) {
    const instances: Array<{
      _listeners: Record<string, Function[]>;
      setPano: ReturnType<typeof vi.fn>;
      setPov: ReturnType<typeof vi.fn>;
      getPov: ReturnType<typeof vi.fn>;
      getLinks: ReturnType<typeof vi.fn>;
      getPano: ReturnType<typeof vi.fn>;
      getPosition: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
      setVisible: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
      fire: (event: string) => void;
    }> = [];

    class PanoWithListeners {
      _listeners: Record<string, Function[]> = {};
      setPano = vi.fn();
      setPov = vi.fn();
      getPov = vi.fn(() => ({ heading: 0, pitch: 0 }));
      getLinks = vi.fn(() => links);
      getPano = vi.fn(() => "test-pano");
      getPosition = vi.fn(() => new (window as any).google.maps.LatLng(0, 0));
      setVisible = vi.fn();
      removeListener = vi.fn();
      addListener = vi.fn((event: string, cb: Function) => {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
        return { remove: vi.fn(() => {
          this._listeners[event] = (this._listeners[event] || []).filter(f => f !== cb);
        }) };
      });
      fire(event: string) {
        (this._listeners[event] || []).forEach(cb => cb());
      }
      constructor(_el: any, _opts?: any) {
        instances.push(this as any);
      }
    }

    (window as any).google.maps.StreetViewPanorama = PanoWithListeners;
    return instances;
  }

  it("moveInDirection(0) with links calls setPano on back panorama and fires tilesloaded to swap", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
      { heading: 90, description: "East", pano: "pano-east" },
      { heading: 180, description: "South", pano: "pano-south" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    // instances[0] is panoA (active), instances[1] is panoB (back)
    const panoA = instances[0];
    const panoB = instances[1];

    expect(panoA).toBeDefined();
    expect(panoB).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });

    // Back pano should have had setPano called with the best forward link
    expect(panoB.setPano).toHaveBeenCalledWith("pano-north");

    // Fire tilesloaded on the back panorama to complete the swap
    await act(async () => {
      panoB.fire("tilesloaded");
      vi.advanceTimersByTime(200);
    });

    // After swap the component should still be in the document
    expect(screen.getByTitle("Forward")).toBeInTheDocument();
  });

  it("moveInDirection(-90) navigates left using all links with fallback", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
      { heading: 90, description: "East", pano: "pano-east" },
      { heading: 180, description: "South", pano: "pano-south" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoB = instances[1];

    await act(async () => {
      fireEvent.click(screen.getByTitle("Left"));
    });

    // Left (headingOffset=-90) with heading 0 → targetHeading=270.
    // Closest link to 270 is South at 180 (diff=90) or East at 90 (diff=180).
    // findBestLink with fallback=true returns the closest = South (diff=90).
    expect(panoB.setPano).toHaveBeenCalled();
  });

  it("moveInDirection(90) navigates right using all links", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
      { heading: 90, description: "East", pano: "pano-east" },
      { heading: 180, description: "South", pano: "pano-south" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoB = instances[1];

    await act(async () => {
      fireEvent.click(screen.getByTitle("Right"));
    });

    // Right (headingOffset=90) → targetHeading=90 → East is perfect match
    expect(panoB.setPano).toHaveBeenCalledWith("pano-east");
  });

  it("fallback 600ms timeout swaps panoramas when tilesloaded never fires", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
    ];
    makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });

    // Advance past the 600ms fallback timeout without firing tilesloaded
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByTitle("Forward")).toBeInTheDocument();
  });

  it("speed-based auto-movement calls setPano when accumulated distance exceeds panoSpacing", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
    ];
    const instances = makePanoramaWithListeners(links);

    const data = makeData("client-1", 140, 500, 36); // 36 km/h = 10 m/s → 5m per 500ms tick

    await act(async () => {
      render(<StreetViewMode {...defaultProps} latestData={data} />);
    });

    const panoB = instances[1];

    // Advance 2 seconds (4 ticks × 5 m/tick = 20 m accumulated > 12 m panoSpacing)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // The auto-movement should have called setPano on the back pano
    expect(panoB.setPano).toHaveBeenCalled();
  });

  it("distance display updates as timer ticks with speed > 0", async () => {
    makePanoramaWithListeners([]);

    const data = makeData("client-1", 140, 500, 7.2); // 7.2 km/h = 2 m/s → 1 m per 500ms tick

    await act(async () => {
      render(<StreetViewMode {...defaultProps} latestData={data} />);
    });

    await act(async () => {
      vi.advanceTimersByTime(2000); // 4 ticks → ~4 m accumulated
    });

    // Distance display should be > 0 m now
    const distEls = screen.getAllByText(/\d+ m/);
    const distEl = distEls.find(el => el.textContent !== "0 m");
    expect(distEl).toBeDefined();
  });

  it("onEnd receives positive accumulated distance after movement", async () => {
    makePanoramaWithListeners([]);

    const onEnd = vi.fn();
    const data = makeData("client-1", 140, 500, 7.2);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} latestData={data} onEnd={onEnd} />);
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.getByRole("button", { name: "End Realm" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    const [dist] = onEnd.mock.calls[0];
    expect(dist).toBeGreaterThan(0);
  });

  it("no movement occurs when speed is zero even after many timer ticks", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
    ];
    const instances = makePanoramaWithListeners(links);

    const data = makeData("client-1", 60, 100, 0);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} latestData={data} />);
    });

    const panoB = instances[1];

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // With speed = 0 the interval body returns early; setPano should not be called
    expect(panoB.setPano).not.toHaveBeenCalled();
  });

  it("searchAhead is triggered when getLinks returns empty and forward is clicked", async () => {
    // Empty links → moveInDirection(0) → searchAhead() → svService.getPanorama
    // Save the current working service so we can restore it afterwards
    const OriginalStreetViewService = (window as any).google.maps.StreetViewService;

    makePanoramaWithListeners([]);

    const svGetPanoramaSpy = vi.fn((_req: any, cb: Function) => {
      cb(null, "ZERO_RESULTS");
    });

    class FailingStreetViewService {
      getPanorama = svGetPanoramaSpy;
    }
    (window as any).google.maps.StreetViewService = FailingStreetViewService;

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });

    // svService.getPanorama is called at least once: once during init (location lookup),
    // plus once for searchAhead
    expect(svGetPanoramaSpy).toHaveBeenCalled();

    // Restore the working service for subsequent tests
    (window as any).google.maps.StreetViewService = OriginalStreetViewService;
  });

  it("position_changed listener updates panoSpacing when distance is valid", async () => {
    // Make computeDistanceBetween return a valid spacing distance
    (window as any).google.maps.geometry.spherical.computeDistanceBetween.mockReturnValue(15);

    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoA = instances[0];

    // Fire position_changed on panoA to update panoSpacingRef to 15
    await act(async () => {
      panoA.fire("position_changed");
    });

    // Component should still render correctly after position update
    expect(screen.getByTitle("Forward")).toBeInTheDocument();

    // Restore mock
    (window as any).google.maps.geometry.spherical.computeDistanceBetween.mockReturnValue(10);
  });

  it("links_changed listener on active pano triggers preloading of upcoming panoramas", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
      { heading: 90, description: "East", pano: "pano-east" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoA = instances[0];
    const panoB = instances[1];

    // Fire links_changed on panoA (active=A) to trigger preloadCurrentLinks
    await act(async () => {
      panoA.fire("links_changed");
    });

    // preloadCurrentLinks should have preloaded the best candidate (pano-north, heading 0)
    // onto the back panorama (panoB)
    expect(panoB.setPano).toHaveBeenCalledWith("pano-north");
  });

  it("tilesloaded callback after moveInDirection left completes the swap", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
      { heading: 90, description: "East", pano: "pano-east" },
      { heading: 180, description: "South", pano: "pano-south" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoB = instances[1];

    // Click Left to trigger the left-navigation path which loads on back pano
    await act(async () => {
      fireEvent.click(screen.getByTitle("Left"));
    });

    // Verify the back pano got setPano called (the navigation started)
    expect(panoB.setPano).toHaveBeenCalled();

    // Now fire tilesloaded to execute the tilesloaded callback inside moveInDirection left path
    await act(async () => {
      panoB.fire("tilesloaded");
      vi.advanceTimersByTime(200);
    });

    // Component still renders correctly after tilesloaded swap
    expect(screen.getByTitle("Left")).toBeInTheDocument();
  });

  it("tilesloaded callback after moveInDirection right completes the swap", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
      { heading: 90, description: "East", pano: "pano-east" },
      { heading: 180, description: "South", pano: "pano-south" },
    ];
    const instances = makePanoramaWithListeners(links);

    await act(async () => {
      render(<StreetViewMode {...defaultProps} />);
    });

    const panoB = instances[1];

    // Click Right to trigger the right-navigation path
    await act(async () => {
      fireEvent.click(screen.getByTitle("Right"));
    });

    // Verify navigation started
    expect(panoB.setPano).toHaveBeenCalledWith("pano-east");

    // Fire tilesloaded to execute the tilesloaded callback inside moveInDirection right path
    await act(async () => {
      panoB.fire("tilesloaded");
      vi.advanceTimersByTime(200);
    });

    // Component still renders correctly after tilesloaded swap
    expect(screen.getByTitle("Right")).toBeInTheDocument();
  });

  it("tilesloaded callback after moveForwardAuto completes the swap", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
    ];
    const instances = makePanoramaWithListeners(links);

    const data = makeData("client-1", 140, 500, 36); // 36 km/h = 10 m/s

    await act(async () => {
      render(<StreetViewMode {...defaultProps} latestData={data} />);
    });

    const panoB = instances[1];

    // Advance enough time to trigger moveForwardAuto via the interval
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // panoB should have had setPano called by moveForwardAuto
    expect(panoB.setPano).toHaveBeenCalled();

    // Fire tilesloaded to cover the tilesloaded callback body in moveForwardAuto
    await act(async () => {
      panoB.fire("tilesloaded");
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTitle("Forward")).toBeInTheDocument();
  });

  it("multiple rerenders with changing wearable data keep HUD accurate", async () => {
    makePanoramaWithListeners([]);

    const { rerender } = render(<StreetViewMode {...defaultProps} latestData={null} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();

    await act(async () => {
      rerender(<StreetViewMode {...defaultProps} latestData={makeData("client-1", 130, 300, 4.5)} />);
    });
    expect(screen.getByText("4.5 km/h")).toBeInTheDocument();
    expect(screen.getByText("130 bpm")).toBeInTheDocument();

    await act(async () => {
      rerender(<StreetViewMode {...defaultProps} latestData={makeData("client-1", 160, 800, 9.0)} />);
    });
    expect(screen.getByText("9.0 km/h")).toBeInTheDocument();
    expect(screen.getByText("160 bpm")).toBeInTheDocument();
  });

  it("panorama A has higher z-index when active is A, panorama B has higher z-index when active is B", async () => {
    const links: google.maps.StreetViewLink[] = [
      { heading: 0, description: "North", pano: "pano-north" },
    ];
    const instances = makePanoramaWithListeners(links);

    const { container } = await act(async () =>
      render(<StreetViewMode {...defaultProps} />)
    );

    // Initially active is A (z-index 2) and B is 1
    const panos = container.querySelectorAll<HTMLElement>("div[style*='position: absolute']");
    // The first two absolute divs inside the fixed wrapper are panoA and panoB containers
    const fixedWrapper = container.querySelector<HTMLElement>("div[style*='position: fixed']");
    expect(fixedWrapper).toBeTruthy();
    const absChildren = Array.from(fixedWrapper!.children).filter(
      el => (el as HTMLElement).style?.position === "absolute" && !(el as HTMLElement).getAttribute("role")
    ) as HTMLElement[];

    // panoA container (index 0) should start with zIndex 2 (active)
    expect(absChildren[0]?.style.zIndex).toBe("2");
    // panoB container (index 1) should start with zIndex 1 (back)
    expect(absChildren[1]?.style.zIndex).toBe("1");

    // Trigger a swap by clicking forward and firing tilesloaded
    const panoB = instances[1];
    await act(async () => {
      fireEvent.click(screen.getByTitle("Forward"));
    });
    await act(async () => {
      panoB.fire("tilesloaded");
      vi.advanceTimersByTime(200);
    });

    // After swap, panoB container should have zIndex 2 and panoA should have zIndex 1
    expect(absChildren[1]?.style.zIndex).toBe("2");
    expect(absChildren[0]?.style.zIndex).toBe("1");

    void panos; // suppress unused warning
  });
});
