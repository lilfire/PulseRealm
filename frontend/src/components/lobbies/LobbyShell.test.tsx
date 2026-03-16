import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { LobbyShell } from "./LobbyShell";
import type { ClientProfile } from "../../types/session";

const baseProps = {
  joinCode: "123456",
  clients: [] as string[],
  clientProfiles: {} as Record<string, ClientProfile>,
  connected: true,
  canStart: false,
  onStart: vi.fn(),
  onLeave: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LobbyShell", () => {
  describe("join code display", () => {
    it("renders the join code", () => {
      render(<LobbyShell {...baseProps} joinCode="987654" />);
      expect(screen.getByText("987654")).toBeInTheDocument();
    });
  });

  describe("status text", () => {
    it("shows Connecting... when not connected", () => {
      render(<LobbyShell {...baseProps} connected={false} />);
      expect(screen.getByText(/Connecting\.\.\./)).toBeInTheDocument();
    });

    it("shows Waiting for players... when connected and not viewOnly", () => {
      render(<LobbyShell {...baseProps} connected={true} viewOnly={false} />);
      expect(screen.getByText(/Waiting for players\.\.\./)).toBeInTheDocument();
    });

    it("shows Watching... when connected and viewOnly", () => {
      render(<LobbyShell {...baseProps} connected={true} viewOnly={true} />);
      expect(screen.getByText(/Watching\.\.\./)).toBeInTheDocument();
    });
  });

  describe("players list", () => {
    it("shows No players yet. when clients array is empty", () => {
      render(<LobbyShell {...baseProps} clients={[]} />);
      expect(screen.getByText("No players yet.")).toBeInTheDocument();
    });

    it("shows player count heading", () => {
      render(<LobbyShell {...baseProps} clients={["c1", "c2"]} clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 }, c2: { clientId: "c2", name: "Bob", heightCm: 0, weightKg: 0 } }} />);
      expect(screen.getByText("Players (2)")).toBeInTheDocument();
    });

    it("lists player names from clientProfiles", () => {
      const profiles: Record<string, ClientProfile> = {
        "abc": { clientId: "abc", name: "Alice", heightCm: 0, weightKg: 0 },
      };
      render(<LobbyShell {...baseProps} clients={["abc"]} clientProfiles={profiles} />);
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    it("falls back to client id when profile not available", () => {
      render(<LobbyShell {...baseProps} clients={["unknownId"]} clientProfiles={{}} />);
      expect(screen.getByText(/unknownId/)).toBeInTheDocument();
    });

    it("shows height when available in profile", () => {
      const profiles: Record<string, ClientProfile> = {
        "c1": { clientId: "c1", name: "Alice", heightCm: 175, weightKg: 65 },
      };
      render(<LobbyShell {...baseProps} clients={["c1"]} clientProfiles={profiles} />);
      expect(screen.getByText(/175 cm/)).toBeInTheDocument();
    });

    it("does not show height section when heightCm is 0", () => {
      const profiles: Record<string, ClientProfile> = {
        "c1": { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 },
      };
      render(<LobbyShell {...baseProps} clients={["c1"]} clientProfiles={profiles} />);
      expect(screen.queryByText(/cm/)).not.toBeInTheDocument();
    });
  });

  describe("children rendering", () => {
    it("renders children when not viewOnly", () => {
      render(
        <LobbyShell {...baseProps} viewOnly={false}>
          <div data-testid="child-content">Child</div>
        </LobbyShell>
      );
      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });

    it("hides children when viewOnly", () => {
      render(
        <LobbyShell {...baseProps} viewOnly={true}>
          <div data-testid="child-content">Child</div>
        </LobbyShell>
      );
      expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
    });
  });

  describe("Start Realm button", () => {
    it("shows Start Realm button when not viewOnly", () => {
      render(<LobbyShell {...baseProps} viewOnly={false} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeInTheDocument();
    });

    it("hides Start Realm button when viewOnly", () => {
      render(<LobbyShell {...baseProps} viewOnly={true} />);
      expect(screen.queryByRole("button", { name: "Start Realm" })).not.toBeInTheDocument();
    });

    it("disables start button when canStart is false", () => {
      render(<LobbyShell {...baseProps} canStart={false} viewOnly={false} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("enables start button when canStart is true", () => {
      render(<LobbyShell {...baseProps} canStart={true} viewOnly={false} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });

    it("calls onStart when start button is clicked", () => {
      const onStart = vi.fn();
      render(<LobbyShell {...baseProps} canStart={true} onStart={onStart} viewOnly={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });

  describe("leave button", () => {
    it("calls onLeave when leave button is clicked", () => {
      const onLeave = vi.fn();
      render(<LobbyShell {...baseProps} onLeave={onLeave} viewOnly={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Leave Realm" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it("shows Leave text when viewOnly", () => {
      render(<LobbyShell {...baseProps} viewOnly={true} />);
      expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    });

    it("shows Leave Realm text when not viewOnly", () => {
      render(<LobbyShell {...baseProps} viewOnly={false} />);
      expect(screen.getByRole("button", { name: "Leave Realm" })).toBeInTheDocument();
    });

    it("calls onLeave when leave button is clicked in viewOnly mode", () => {
      const onLeave = vi.fn();
      render(<LobbyShell {...baseProps} onLeave={onLeave} viewOnly={true} />);
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("VIEW ONLY badge", () => {
    it("shows VIEW ONLY badge when viewOnly", () => {
      render(<LobbyShell {...baseProps} viewOnly={true} />);
      expect(screen.getByText("VIEW ONLY")).toBeInTheDocument();
    });

    it("hides VIEW ONLY badge when not viewOnly", () => {
      render(<LobbyShell {...baseProps} viewOnly={false} />);
      expect(screen.queryByText("VIEW ONLY")).not.toBeInTheDocument();
    });

    it("hides VIEW ONLY badge when viewOnly is undefined", () => {
      render(<LobbyShell {...baseProps} />);
      expect(screen.queryByText("VIEW ONLY")).not.toBeInTheDocument();
    });
  });

  describe("brand header", () => {
    it("renders the PulseRealm logo", () => {
      render(<LobbyShell {...baseProps} />);
      expect(screen.getByAltText("PulseRealm")).toBeInTheDocument();
    });
  });
});
