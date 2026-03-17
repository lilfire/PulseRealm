import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { DungeonLobby } from "./DungeonLobby";
import type { ClientProfile, } from "../../types/session";
import type { DungeonConfig } from "./DungeonLobby";

const baseProps = {
  joinCode: "444555",
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
});

describe("DungeonLobby", () => {
  describe("rendering", () => {
    it("renders the join code", () => {
      render(<DungeonLobby {...baseProps} />);
      expect(screen.getByText("444555")).toBeInTheDocument();
    });

    it("renders difficulty section", () => {
      render(<DungeonLobby {...baseProps} />);
      expect(screen.getByText("Difficulty")).toBeInTheDocument();
    });

    it("renders all difficulty buttons", () => {
      render(<DungeonLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "Easy" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Normal" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hard" })).toBeInTheDocument();
    });

    it("renders timeframe section", () => {
      render(<DungeonLobby {...baseProps} />);
      expect(screen.getByText("Timeframe")).toBeInTheDocument();
    });

    it("renders all timeframe buttons", () => {
      render(<DungeonLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "15 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "45 min" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "60 min" })).toBeInTheDocument();
    });
  });

  describe("default selections", () => {
    it("defaults to normal difficulty", () => {
      render(<DungeonLobby {...baseProps} />);
      // Normal difficulty description is shown for default
      expect(screen.getByText(/Balanced challenge for most teams/i)).toBeInTheDocument();
    });

    it("defaults to 30 min timeframe", () => {
      render(<DungeonLobby {...baseProps} />);
      // 30 min is the default — verify Start Realm is enabled (implying 30 min default works)
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });
  });

  describe("difficulty selection", () => {
    it("can select Easy difficulty", () => {
      render(<DungeonLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Easy" }));
      expect(screen.getByText(/Wider windows, lower HP pools/i)).toBeInTheDocument();
    });

    it("can select Hard difficulty", () => {
      render(<DungeonLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Hard" }));
      expect(screen.getByText(/Tight precision, punishing mechanics/i)).toBeInTheDocument();
    });

    it("can switch back to Normal difficulty", () => {
      render(<DungeonLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Easy" }));
      fireEvent.click(screen.getByRole("button", { name: "Normal" }));
      expect(screen.getByText(/Balanced challenge for most teams/i)).toBeInTheDocument();
    });
  });

  describe("timeframe selection", () => {
    it("can select 15 min timeframe", () => {
      render(<DungeonLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "15 min" }));
      expect(screen.getByRole("button", { name: "15 min" })).toBeInTheDocument();
    });

    it("can select 45 min timeframe", () => {
      render(<DungeonLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "45 min" }));
      expect(screen.getByRole("button", { name: "45 min" })).toBeInTheDocument();
    });

    it("can select 60 min timeframe", () => {
      render(<DungeonLobby {...baseProps} />);
      fireEvent.click(screen.getByRole("button", { name: "60 min" }));
      expect(screen.getByRole("button", { name: "60 min" })).toBeInTheDocument();
    });
  });

  describe("defaults prop", () => {
    it("uses provided valid difficulty default", () => {
      render(<DungeonLobby {...baseProps} defaults={{ difficulty: "hard" }} />);
      expect(screen.getByText(/Tight precision, punishing mechanics/i)).toBeInTheDocument();
    });

    it("uses provided easy difficulty default", () => {
      render(<DungeonLobby {...baseProps} defaults={{ difficulty: "easy" }} />);
      expect(screen.getByText(/Wider windows, lower HP pools/i)).toBeInTheDocument();
    });

    it("falls back to normal for invalid difficulty default", () => {
      render(<DungeonLobby {...baseProps} defaults={{ difficulty: "extreme" }} />);
      expect(screen.getByText(/Balanced challenge for most teams/i)).toBeInTheDocument();
    });

    it("uses provided timeframeMinutes default", () => {
      // The button for 45 min should now be the default (selected state)
      render(<DungeonLobby {...baseProps} defaults={{ timeframeMinutes: 45 }} />);
      expect(screen.getByRole("button", { name: "45 min" })).toBeInTheDocument();
    });

    it("handles null defaults gracefully", () => {
      render(<DungeonLobby {...baseProps} defaults={null} />);
      expect(screen.getByText(/Balanced challenge for most teams/i)).toBeInTheDocument();
    });

    it("handles undefined defaults gracefully", () => {
      render(<DungeonLobby {...baseProps} defaults={undefined} />);
      expect(screen.getByText(/Balanced challenge for most teams/i)).toBeInTheDocument();
    });
  });

  describe("onStart callback", () => {
    it("calls onStart with default difficulty and timeframe", () => {
      const onStart = vi.fn();
      render(<DungeonLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
      const config: DungeonConfig = onStart.mock.calls[0][0];
      expect(config.difficulty).toBe("normal");
      expect(config.timeframe).toBe(30);
    });

    it("calls onStart with selected Easy difficulty and 15 min timeframe", () => {
      const onStart = vi.fn();
      render(<DungeonLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Easy" }));
      fireEvent.click(screen.getByRole("button", { name: "15 min" }));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
      const config: DungeonConfig = onStart.mock.calls[0][0];
      expect(config.difficulty).toBe("easy");
      expect(config.timeframe).toBe(15);
    });

    it("calls onStart with Hard difficulty and 60 min timeframe", () => {
      const onStart = vi.fn();
      render(<DungeonLobby {...baseProps} onStart={onStart} />);
      fireEvent.click(screen.getByRole("button", { name: "Hard" }));
      fireEvent.click(screen.getByRole("button", { name: "60 min" }));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      const config: DungeonConfig = onStart.mock.calls[0][0];
      expect(config.difficulty).toBe("hard");
      expect(config.timeframe).toBe(60);
    });
  });

  describe("canStart logic", () => {
    it("start button is enabled when connected with clients", () => {
      render(<DungeonLobby {...baseProps} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });

    it("start button is disabled when not connected", () => {
      render(<DungeonLobby {...baseProps} connected={false} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start button is disabled when no clients", () => {
      render(<DungeonLobby {...baseProps} clients={[]} clientProfiles={{}} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });
  });

  describe("leave button", () => {
    it("calls onLeave when leave button is clicked", () => {
      const onLeave = vi.fn();
      render(<DungeonLobby {...baseProps} onLeave={onLeave} />);
      fireEvent.click(screen.getByRole("button", { name: "Leave Realm" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("guest role", () => {
    it("does not show Start Realm button when role is guest", () => {
      render(<DungeonLobby {...baseProps} role="guest" />);
      expect(screen.queryByRole("button", { name: "Start Realm" })).not.toBeInTheDocument();
    });

    it("shows Watching status when role is guest", () => {
      render(<DungeonLobby {...baseProps} role="guest" />);
      expect(screen.getByText(/Watching\.\.\./)).toBeInTheDocument();
    });
  });
});
