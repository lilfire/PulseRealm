import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { RealmSummaryScreen } from "./SessionSummaryScreen";
import type { RealmSummary } from "../hooks/useSessionHub";
import type { ClientProfile } from "../types/session";

// ─── Helpers / factories ──────────────────────────────────────────────────────

function makeSummary(overrides: Partial<RealmSummary> = {}): RealmSummary {
  return {
    durationSeconds: 0,
    totalDistanceMeters: 0,
    totalSteps: 0,
    averageHeartRate: 0,
    maxHeartRate: 0,
    averageSpeedKmh: 0,
    avgCadenceSpm: 0,
    caloriesBurned: 0,
    timeInZone: {},
    activePeriodSeconds: 0,
    participantCount: 1,
    ...overrides,
  };
}

function makeProfile(
  clientId: string,
  name: string,
  overrides: Partial<ClientProfile> = {}
): ClientProfile {
  return { clientId, name, heightCm: 170, weightKg: 70, ...overrides };
}

// ─── formatDuration ───────────────────────────────────────────────────────────

describe("formatDuration (via rendered output)", () => {
  it("renders hours, minutes and seconds when >= 1 hour", () => {
    const summary = makeSummary({ durationSeconds: 3661 }); // 1h 1m 1s
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("1h 1m 1s")).toBeInTheDocument();
  });

  it("renders minutes and seconds when < 1 hour", () => {
    const summary = makeSummary({ durationSeconds: 125 }); // 2m 5s
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("2m 5s")).toBeInTheDocument();
  });

  it("renders seconds only when < 60 seconds", () => {
    const summary = makeSummary({ durationSeconds: 45 }); // 45s
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("45s")).toBeInTheDocument();
  });

  it("handles exactly 0 seconds", () => {
    const summary = makeSummary({ durationSeconds: 0 });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    // Both Duration and Active Time are 0s, so multiple matches are expected
    const zeroEls = screen.getAllByText("0s");
    expect(zeroEls.length).toBeGreaterThanOrEqual(1);
  });

  it("handles exactly 3600 seconds (1h 0m 0s)", () => {
    const summary = makeSummary({ durationSeconds: 3600 });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("1h 0m 0s")).toBeInTheDocument();
  });
});

// ─── formatDistance ───────────────────────────────────────────────────────────

describe("formatDistance (via rendered SoloSection)", () => {
  it("shows distance in km when >= 1000 m", () => {
    const summary = makeSummary({ totalDistanceMeters: 2500 });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("2.50 km")).toBeInTheDocument();
  });

  it("shows distance in m when < 1000 m", () => {
    const summary = makeSummary({ totalDistanceMeters: 750 });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("750 m")).toBeInTheDocument();
  });

  it("shows '1.00 km' for exactly 1000 m", () => {
    const summary = makeSummary({ totalDistanceMeters: 1000 });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("1.00 km")).toBeInTheDocument();
  });

  it("rounds sub-1000 m values", () => {
    const summary = makeSummary({ totalDistanceMeters: 123.7 });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("124 m")).toBeInTheDocument();
  });
});

// ─── formatZoneTime ───────────────────────────────────────────────────────────

describe("formatZoneTime (via zone breakdown rendering)", () => {
  it("renders minutes + zero-padded seconds when >= 60 s", () => {
    const summary = makeSummary({
      timeInZone: { "3": 75 }, // 1m 15s
    });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("1m 15s")).toBeInTheDocument();
  });

  it("zero-pads seconds in minute+seconds format", () => {
    const summary = makeSummary({
      timeInZone: { "4": 61 }, // 1m 01s
    });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("1m 01s")).toBeInTheDocument();
  });

  it("renders seconds only when < 60 s", () => {
    const summary = makeSummary({
      timeInZone: { "2": 45 },
    });
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(screen.getByText("45s")).toBeInTheDocument();
  });
});

// ─── Header ───────────────────────────────────────────────────────────────────

describe("header", () => {
  it("renders 'Realm Complete' heading", () => {
    const summary = makeSummary();
    render(
      <RealmSummaryScreen summary={summary} clientProfiles={{}} onClose={() => {}} />
    );
    expect(
      screen.getByRole("heading", { name: /Realm Complete/i })
    ).toBeInTheDocument();
  });

  it("shows client names from clientProfiles", () => {
    const profiles: Record<string, ClientProfile> = {
      "c-1": makeProfile("c-1", "Alice"),
      "c-2": makeProfile("c-2", "Bob"),
    };
    render(
      <RealmSummaryScreen
        summary={makeSummary()}
        clientProfiles={profiles}
        onClose={() => {}}
      />
    );
    const nameEl = screen.getByText(/Alice.*Bob|Bob.*Alice/);
    expect(nameEl).toBeInTheDocument();
  });

  it("does not render the names span when clientProfiles is empty", () => {
    render(
      <RealmSummaryScreen
        summary={makeSummary()}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );
    // Names span should not appear at all
    expect(screen.queryByText(/Alice/)).not.toBeInTheDocument();
  });
});

// ─── Back to Home button ──────────────────────────────────────────────────────

describe("Back to Home button", () => {
  it("calls onClose when clicked", () => {
    const onClose = vi.fn();
    render(
      <RealmSummaryScreen
        summary={makeSummary()}
        clientProfiles={{}}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Back to Home/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Stat cards ───────────────────────────────────────────────────────────────

describe("stat cards", () => {
  it("shows Duration stat card", () => {
    render(
      <RealmSummaryScreen
        summary={makeSummary({ durationSeconds: 60 })}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Duration")).toBeInTheDocument();
  });

  it("shows Active Time stat card", () => {
    render(
      <RealmSummaryScreen
        summary={makeSummary({ activePeriodSeconds: 55 })}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Active Time")).toBeInTheDocument();
  });

  it("shows Participants stat card", () => {
    render(
      <RealmSummaryScreen
        summary={makeSummary({ participantCount: 3 })}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Participants")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

// ─── Individual section ───────────────────────────────────────────────────────

describe("individual section", () => {
  it("renders client cards when not team format and clientSummaries is present", () => {
    const summary = makeSummary({
      isTeamFormat: false,
      clientSummaries: [
        {
          clientId: "c-1",
          name: "Alice",
          steps: 3000,
          distanceMeters: 2400,
          averageHeartRate: 140,
          maxHeartRate: 165,
          avgCadenceSpm: 158,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 6.5,
          peakSpeedKmh: 9.0,
        },
        {
          clientId: "c-2",
          name: "Bob",
          steps: 2800,
          distanceMeters: 2100,
          averageHeartRate: 135,
          maxHeartRate: 160,
          avgCadenceSpm: 152,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 6.0,
          peakSpeedKmh: 8.5,
        },
      ],
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    // Names may appear in both client cards and comparison bars
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Individual")).toBeInTheDocument();
  });

  it("shows '—' for zero heart rate values in client cards", () => {
    const summary = makeSummary({
      isTeamFormat: false,
      clientSummaries: [
        {
          clientId: "c-no-hr",
          name: "NoHR",
          steps: 1000,
          distanceMeters: 800,
          averageHeartRate: 0,
          maxHeartRate: 0,
          avgCadenceSpm: 0,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 0,
          peakSpeedKmh: 0,
        },
      ],
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    // Both Avg HR and Peak HR should show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("shows per-client zone breakdown when timeInZone has data", () => {
    const summary = makeSummary({
      isTeamFormat: false,
      clientSummaries: [
        {
          clientId: "c-zones",
          name: "Zoner",
          steps: 2000,
          distanceMeters: 1600,
          averageHeartRate: 150,
          maxHeartRate: 175,
          avgCadenceSpm: 160,
          caloriesBurned: 0,
          timeInZone: { "3": 120, "4": 60 },
          averageSpeedKmh: 7.0,
          peakSpeedKmh: 10.0,
        },
      ],
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("Zone 3")).toBeInTheDocument();
    expect(screen.getByText("Zone 4")).toBeInTheDocument();
  });
});

// ─── Team section ─────────────────────────────────────────────────────────────

describe("team section", () => {
  it("renders team names and members when isTeamFormat is true", () => {
    const summary = makeSummary({
      isTeamFormat: true,
      clientSummaries: [
        {
          clientId: "c-r1",
          name: "Alice",
          steps: 3000,
          distanceMeters: 2400,
          averageHeartRate: 142,
          maxHeartRate: 168,
          avgCadenceSpm: 158,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 6.5,
          peakSpeedKmh: 9.0,
          teamName: "Red",
          teamColor: "#ef4444",
        },
        {
          clientId: "c-b1",
          name: "Bob",
          steps: 2800,
          distanceMeters: 2200,
          averageHeartRate: 138,
          maxHeartRate: 162,
          avgCadenceSpm: 152,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 6.0,
          peakSpeedKmh: 8.5,
          teamName: "Blue",
          teamColor: "#3b82f6",
        },
      ],
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("does not render the Individual section heading when isTeamFormat is true", () => {
    const summary = makeSummary({
      isTeamFormat: true,
      clientSummaries: [
        {
          clientId: "c-t1",
          name: "Alice",
          steps: 1000,
          distanceMeters: 800,
          averageHeartRate: 140,
          maxHeartRate: 160,
          avgCadenceSpm: 155,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 5.5,
          peakSpeedKmh: 8.0,
          teamName: "Green",
        },
      ],
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText("Individual")).not.toBeInTheDocument();
  });

  it("shows '—' for zero heart rate in team aggregate", () => {
    const summary = makeSummary({
      isTeamFormat: true,
      clientSummaries: [
        {
          clientId: "c-nohr",
          name: "NoHR",
          steps: 500,
          distanceMeters: 400,
          averageHeartRate: 0,
          maxHeartRate: 0,
          avgCadenceSpm: 0,
          caloriesBurned: 0,
          timeInZone: {},
          averageSpeedKmh: 0,
          peakSpeedKmh: 0,
          teamName: "Yellow",
        },
      ],
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Solo section ─────────────────────────────────────────────────────────────

describe("solo section", () => {
  it("renders solo stats when no clientSummaries provided", () => {
    const summary = makeSummary({
      totalDistanceMeters: 5000,
      totalSteps: 7000,
      averageHeartRate: 145,
      maxHeartRate: 172,
      avgCadenceSpm: 162,
      averageSpeedKmh: 7.5,
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("5.00 km")).toBeInTheDocument();
    expect(screen.getByText("7,000")).toBeInTheDocument();
    expect(screen.getByText("145 bpm")).toBeInTheDocument();
    expect(screen.getByText("172 bpm")).toBeInTheDocument();
    expect(screen.getByText("162 spm")).toBeInTheDocument();
    expect(screen.getByText("7.5 km/h")).toBeInTheDocument();
  });

  it("shows '—' for zero heart rate values in solo section", () => {
    const summary = makeSummary({
      averageHeartRate: 0,
      maxHeartRate: 0,
      avgCadenceSpm: 0,
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("does not render zone breakdown when timeInZone is empty", () => {
    const summary = makeSummary({ timeInZone: {} });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText("Zone Breakdown")).not.toBeInTheDocument();
  });

  it("renders zone breakdown when timeInZone data exists", () => {
    const summary = makeSummary({
      timeInZone: { "2": 300, "3": 600, "4": 120 },
    });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("Zone Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Zone 2")).toBeInTheDocument();
    expect(screen.getByText("Zone 3")).toBeInTheDocument();
    expect(screen.getByText("Zone 4")).toBeInTheDocument();
    // Zone 1 and 5 have 0 seconds — should not appear
    expect(screen.queryByText("Zone 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Zone 5")).not.toBeInTheDocument();
  });

  it("shows '0s' for active time when activePeriodSeconds is 0", () => {
    const summary = makeSummary({ activePeriodSeconds: 0 });

    render(
      <RealmSummaryScreen
        summary={summary}
        clientProfiles={{}}
        onClose={() => {}}
      />
    );

    // "0s" will appear at least for both durationSeconds and activePeriodSeconds
    const zeroSec = screen.getAllByText("0s");
    expect(zeroSec.length).toBeGreaterThanOrEqual(2);
  });
});
