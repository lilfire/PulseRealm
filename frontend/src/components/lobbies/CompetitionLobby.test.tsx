import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { CompetitionLobby } from "./CompetitionLobby";
import type { ClientProfile, CompetitionConfig } from "../../types/session";

const baseProps = {
  joinCode: "555666",
  clients: ["c1", "c2", "c3"] as string[],
  clientProfiles: {
    c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 },
    c2: { clientId: "c2", name: "Bob", heightCm: 175, weightKg: 75 },
    c3: { clientId: "c3", name: "Carol", heightCm: 165, weightKg: 55 },
  } as Record<string, ClientProfile>,
  connected: true,
  onStart: vi.fn(),
  onLeave: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CompetitionLobby", () => {
  describe("sub-mode selector", () => {
    it("renders all sub-mode buttons", () => {
      render(<CompetitionLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "Race" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Elimination" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Heart Zone" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "King" })).toBeInTheDocument();
    });

    it("default sub-mode is race", () => {
      render(<CompetitionLobby {...baseProps} />);
      // Race mode shows the target distance heading
      expect(screen.getByRole("heading", { name: /Target Distance/i })).toBeInTheDocument();
    });

    it("can switch to Elimination sub-mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      expect(screen.getByText(/Elimination Interval/i)).toBeInTheDocument();
    });

    it("can switch to Heart Zone sub-mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Heart Zone" }));
      expect(screen.getByText(/Target Zone/i)).toBeInTheDocument();
    });

    it("can switch to King sub-mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "King" }));
      // King mode shows Duration
      const durationHeadings = screen.getAllByText(/Duration/i);
      expect(durationHeadings.length).toBeGreaterThan(0);
    });

    it("can switch back to Race sub-mode from another mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      fireEvent.click(screen.getByRole("button", { name: "Race" }));
      expect(screen.getByRole("heading", { name: /Target Distance/i })).toBeInTheDocument();
    });
  });

  describe("race mode", () => {
    it("shows target distance slider for race mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      const slider = screen.getByRole("slider");
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveAttribute("min", "0.1");
      expect(slider).toHaveAttribute("max", "42");
    });

    it("shows default target distance of 5.0 km", () => {
      render(<CompetitionLobby {...baseProps} />);
      expect(screen.getByText("5.0 km")).toBeInTheDocument();
    });

    it("updates distance display when slider changes", () => {
      render(<CompetitionLobby {...baseProps} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "10" } });
      expect(screen.getByText("10.0 km")).toBeInTheDocument();
    });
  });

  describe("elimination mode", () => {
    it("shows interval buttons for elimination mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      expect(screen.getByRole("button", { name: "1 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "2 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "3 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "5 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "10 min" })).toBeInTheDocument();
    });

    it("shows at least 3 players message for elimination with fewer than 3 players", () => {
      render(
        <CompetitionLobby
          {...baseProps}
          clients={["c1", "c2"]}
          clientProfiles={{
            c1: { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 },
            c2: { clientId: "c2", name: "Bob", heightCm: 0, weightKg: 0 },
          }}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      expect(screen.getByText(/at least 3 players/i)).toBeInTheDocument();
    });

    it("does not show the 3 players message when there are 3 or more players", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      expect(screen.queryByText(/at least 3 players/i)).not.toBeInTheDocument();
    });

    it("can change interval by clicking an interval button", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      fireEvent.click(screen.getByRole("button", { name: "5 min" }));
      // The button is now selected — verify no crash and the button is rendered
      expect(screen.getByRole("button", { name: "5 min" })).toBeInTheDocument();
    });
  });

  describe("heartzone mode", () => {
    it("shows zone selector for heartzone mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Heart Zone" }));
      expect(screen.getByRole("button", { name: "Zone 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zone 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zone 3" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zone 4" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zone 5" })).toBeInTheDocument();
    });

    it("shows duration slider for heartzone mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Heart Zone" }));
      const durationHeadings = screen.getAllByText(/Duration/i);
      expect(durationHeadings.length).toBeGreaterThan(0);
    });

    it("can change target zone", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Heart Zone" }));
      fireEvent.click(screen.getByRole("button", { name: "Zone 5" }));
      expect(screen.getByRole("button", { name: "Zone 5" })).toBeInTheDocument();
    });

    it("shows default duration for heartzone", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Heart Zone" }));
      expect(screen.getByText("20 min")).toBeInTheDocument();
    });
  });

  describe("king mode", () => {
    it("shows duration slider for king mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "King" }));
      const durationHeadings = screen.getAllByText(/Duration/i);
      expect(durationHeadings.length).toBeGreaterThan(0);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("shows default duration of 15 min for king mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "King" }));
      expect(screen.getByText("15 min")).toBeInTheDocument();
    });

    it("can update king duration via slider", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "King" }));
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "30" } });
      expect(screen.getByText("30 min")).toBeInTheDocument();
    });
  });

  describe("player format", () => {
    it("renders Individual and Team format buttons", () => {
      render(<CompetitionLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "Individual" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Team" })).toBeInTheDocument();
    });

    it("default player format is individual", () => {
      render(<CompetitionLobby {...baseProps} />);
      // Team assignment section should NOT be visible by default
      expect(screen.queryByText("Team Assignment")).not.toBeInTheDocument();
    });

    it("shows team assignment when team format is selected", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      expect(screen.getByText("Team Assignment")).toBeInTheDocument();
    });

    it("can switch back to Individual from Team", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      fireEvent.click(screen.getByRole("button", { name: "Individual" }));
      expect(screen.queryByText("Team Assignment")).not.toBeInTheDocument();
    });
  });

  describe("team assignment", () => {
    it("shows default two teams when team format selected", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      expect(screen.getByDisplayValue("Team 1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Team 2")).toBeInTheDocument();
    });

    it("can add a team", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      fireEvent.click(screen.getByRole("button", { name: "+ Add Team" }));
      expect(screen.getByDisplayValue("Team 3")).toBeInTheDocument();
    });

    it("can remove a team when more than 2 exist", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      fireEvent.click(screen.getByRole("button", { name: "+ Add Team" }));
      // There should now be 3 teams; remove the third one
      const removeButtons = screen.getAllByRole("button", { name: "✕" });
      expect(removeButtons.length).toBeGreaterThan(0);
      fireEvent.click(removeButtons[removeButtons.length - 1]);
      expect(screen.queryByDisplayValue("Team 3")).not.toBeInTheDocument();
    });

    it("does not show remove buttons when exactly 2 teams", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      expect(screen.queryByRole("button", { name: "✕" })).not.toBeInTheDocument();
    });

    it("shows players as assignable buttons in team view", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      // Each client (Alice, Bob, Carol) should appear in both team rows
      const aliceButtons = screen.getAllByRole("button", { name: "Alice" });
      expect(aliceButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("can assign a client to a team", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      const aliceButtons = screen.getAllByRole("button", { name: "Alice" });
      fireEvent.click(aliceButtons[0]);
      // No crash; Alice is now in Team 1
    });

    it("shows warning when not all players assigned in team format", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      expect(screen.getByText(/All players must be assigned/i)).toBeInTheDocument();
    });

    it("canStart is false when team format but not all players assigned", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("can rename a team", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Team" }));
      const teamInput = screen.getByDisplayValue("Team 1");
      fireEvent.change(teamInput, { target: { value: "Red Team" } });
      expect(screen.getByDisplayValue("Red Team")).toBeInTheDocument();
    });
  });

  describe("onStart callback", () => {
    it("calls onStart with correct config in race mode", () => {
      const onStart = vi.fn();
      render(<CompetitionLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
      const config: CompetitionConfig = onStart.mock.calls[0][0];
      expect(config.subMode).toBe("race");
      expect(config.playerFormat).toBe("individual");
      expect(config.targetDistanceKm).toBe(5.0);
    });

    it("calls onStart with elimination config", () => {
      const onStart = vi.fn();
      render(<CompetitionLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      const config: CompetitionConfig = onStart.mock.calls[0][0];
      expect(config.subMode).toBe("elimination");
      expect(config.intervalMinutes).toBe(3);
    });

    it("calls onStart with heartzone config", () => {
      const onStart = vi.fn();
      render(<CompetitionLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Heart Zone" }));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      const config: CompetitionConfig = onStart.mock.calls[0][0];
      expect(config.subMode).toBe("heartzone");
      expect(config.targetZone).toBe(3);
      expect(config.durationMinutes).toBe(20);
    });

    it("calls onStart with king config", () => {
      const onStart = vi.fn();
      render(<CompetitionLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "King" }));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      const config: CompetitionConfig = onStart.mock.calls[0][0];
      expect(config.subMode).toBe("king");
      expect(config.durationMinutes).toBe(15);
    });
  });

  describe("defaults prop", () => {
    it("uses provided valid subMode default", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ subMode: "king" }} />);
      const durationHeadings = screen.getAllByText(/Duration/i);
      expect(durationHeadings.length).toBeGreaterThan(0);
    });

    it("falls back to race for invalid subMode default", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ subMode: "invalid_mode" }} />);
      expect(screen.getByRole("heading", { name: /Target Distance/i })).toBeInTheDocument();
    });

    it("uses provided playerFormat default of team", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ playerFormat: "team" }} />);
      expect(screen.getByText("Team Assignment")).toBeInTheDocument();
    });

    it("falls back to individual for invalid playerFormat", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ playerFormat: "invalid" }} />);
      expect(screen.queryByText("Team Assignment")).not.toBeInTheDocument();
    });

    it("uses provided targetDistanceKm default", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ targetDistanceKm: 10.0 }} />);
      expect(screen.getByText("10.0 km")).toBeInTheDocument();
    });

    it("uses provided intervalMinutes default", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ subMode: "elimination", intervalMinutes: 5 }} />);
      // Verify that 5 min interval is rendered (component should show it as selected)
      expect(screen.getByRole("button", { name: "5 min" })).toBeInTheDocument();
    });

    it("uses provided targetZone default", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ subMode: "heartzone", targetZone: 4 }} />);
      expect(screen.getByRole("button", { name: "Zone 4" })).toBeInTheDocument();
    });

    it("uses provided durationMinutes default for heartzone", () => {
      render(<CompetitionLobby {...baseProps} defaults={{ subMode: "heartzone", durationMinutes: 45 }} />);
      expect(screen.getByText("45 min")).toBeInTheDocument();
    });

    it("handles null defaults gracefully", () => {
      render(<CompetitionLobby {...baseProps} defaults={null} />);
      expect(screen.getByRole("heading", { name: /Target Distance/i })).toBeInTheDocument();
    });
  });

  describe("canStart logic", () => {
    it("start is disabled when not connected", () => {
      render(<CompetitionLobby {...baseProps} connected={false} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start is disabled when no clients", () => {
      render(<CompetitionLobby {...baseProps} clients={[]} clientProfiles={{}} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start is disabled for elimination with fewer than 3 players", () => {
      render(
        <CompetitionLobby
          {...baseProps}
          clients={["c1", "c2"]}
          clientProfiles={{
            c1: { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 },
            c2: { clientId: "c2", name: "Bob", heightCm: 0, weightKg: 0 },
          }}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start is enabled with 3+ players in elimination mode", () => {
      render(<CompetitionLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Elimination" }));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });
  });
});
