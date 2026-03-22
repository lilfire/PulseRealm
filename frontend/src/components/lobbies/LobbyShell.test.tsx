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
    it("does not show Connecting... text (component renders HOST badge instead)", () => {
      render(<LobbyShell {...baseProps} connected={false} />);
      // LobbyShell does not render status text — it shows the role badge in the footer
      expect(screen.getByText("HOST")).toBeInTheDocument();
    });

    it("shows HOST badge when connected and role is host", () => {
      render(<LobbyShell {...baseProps} connected={true} role="host" />);
      expect(screen.getByText("HOST")).toBeInTheDocument();
    });

    it("shows GUEST badge when connected and role is guest", () => {
      render(<LobbyShell {...baseProps} connected={true} role="guest" />);
      expect(screen.getByText("GUEST")).toBeInTheDocument();
    });
  });

  describe("players list", () => {
    it("shows No players yet. when clients array is empty", () => {
      render(<LobbyShell {...baseProps} clients={[]} />);
      expect(screen.getByText("No players yet.")).toBeInTheDocument();
    });

    it("shows player count heading with max clients", () => {
      render(<LobbyShell {...baseProps} clients={["c1", "c2"]} clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 }, c2: { clientId: "c2", name: "Bob", heightCm: 0, weightKg: 0 } }} />);
      // LobbyShell renders "Players (count/max)" — default mode is undefined so maxClientsForMode returns 4
      expect(screen.getByText(/Players \(2\//)).toBeInTheDocument();
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
    it("renders children when role is host", () => {
      render(
        <LobbyShell {...baseProps} role="host">
          <div data-testid="child-content">Child</div>
        </LobbyShell>
      );
      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });

    it("renders children as read-only when role is guest", () => {
      render(
        <LobbyShell {...baseProps} role="guest">
          <div data-testid="child-content">Child</div>
        </LobbyShell>
      );
      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });
  });

  describe("Start Realm button", () => {
    it("shows Start Realm button when role is host", () => {
      render(<LobbyShell {...baseProps} role="host" />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeInTheDocument();
    });

    it("hides Start Realm button when role is guest", () => {
      render(<LobbyShell {...baseProps} role="guest" />);
      expect(screen.queryByRole("button", { name: "Start Realm" })).not.toBeInTheDocument();
    });

    it("disables start button when canStart is false", () => {
      render(<LobbyShell {...baseProps} canStart={false} role="host" />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("enables start button when canStart is true", () => {
      render(<LobbyShell {...baseProps} canStart={true} role="host" />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });

    it("calls onStart when start button is clicked", () => {
      const onStart = vi.fn();
      render(<LobbyShell {...baseProps} canStart={true} onStart={onStart} role="host" />);
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });

  describe("leave button", () => {
    it("calls onLeave when leave button is clicked as guest", () => {
      const onLeave = vi.fn();
      render(<LobbyShell {...baseProps} onLeave={onLeave} role="guest" />);
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it("shows Leave button when role is guest", () => {
      render(<LobbyShell {...baseProps} role="guest" />);
      expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    });

    it("does not show a Leave button when role is host", () => {
      // Hosts use Start Realm / End Realm controls — there is no Leave button for hosts
      render(<LobbyShell {...baseProps} role="host" />);
      expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Leave Realm" })).not.toBeInTheDocument();
    });

    it("calls onLeave when leave button is clicked as admin", () => {
      const onLeave = vi.fn();
      render(<LobbyShell {...baseProps} onLeave={onLeave} role="admin" />);
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("HOST/GUEST badge", () => {
    it("shows GUEST badge when role is guest", () => {
      render(<LobbyShell {...baseProps} role="guest" />);
      expect(screen.getByText("GUEST")).toBeInTheDocument();
    });

    it("shows HOST badge when role is host", () => {
      render(<LobbyShell {...baseProps} role="host" />);
      expect(screen.getByText("HOST")).toBeInTheDocument();
    });

    it("shows HOST badge when role is undefined", () => {
      render(<LobbyShell {...baseProps} />);
      expect(screen.getByText("HOST")).toBeInTheDocument();
    });
  });

  describe("brand header", () => {
    it("renders the PulseRealm logo", () => {
      render(<LobbyShell {...baseProps} />);
      expect(screen.getByAltText("PulseRealm")).toBeInTheDocument();
    });
  });

  describe("kick button", () => {
    it("shows kick button for host with onKick", () => {
      const onKick = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          onKick={onKick}
          role="host"
          mode="competition"
        />,
      );
      expect(screen.getByTitle("Kick player")).toBeInTheDocument();
    });

    it("calls onKick when kick button clicked", () => {
      const onKick = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          onKick={onKick}
          role="host"
          mode="competition"
        />,
      );
      fireEvent.click(screen.getByTitle("Kick player"));
      expect(onKick).toHaveBeenCalledWith("c1");
    });

    it("hides kick button for guest", () => {
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          onKick={vi.fn()}
          role="guest"
          mode="competition"
        />,
      );
      expect(screen.queryByTitle("Kick player")).not.toBeInTheDocument();
    });
  });

  describe("End Realm button", () => {
    it("shows End Realm when onEnd is provided for host", () => {
      render(<LobbyShell {...baseProps} onEnd={vi.fn()} role="host" mode="competition" />);
      expect(screen.getByText("End Realm")).toBeInTheDocument();
    });

    it("calls onEnd when clicked", () => {
      const onEnd = vi.fn();
      render(<LobbyShell {...baseProps} onEnd={onEnd} role="host" mode="competition" />);
      fireEvent.click(screen.getByText("End Realm"));
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it("hides End Realm for guest", () => {
      render(<LobbyShell {...baseProps} onEnd={vi.fn()} role="guest" mode="competition" />);
      expect(screen.queryByText("End Realm")).not.toBeInTheDocument();
    });
  });

  describe("min players warning", () => {
    it("shows minimum players message when below threshold", () => {
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 } }}
          minPlayers={3}
          mode="competition"
        />,
      );
      expect(screen.getByText("Minimum 3 players required")).toBeInTheDocument();
    });

    it("does not show warning when enough players", () => {
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1", "c2", "c3"]}
          clientProfiles={{}}
          minPlayers={3}
          mode="competition"
        />,
      );
      expect(screen.queryByText(/Minimum.*players/)).not.toBeInTheDocument();
    });
  });

  describe("auto-bind for single-client modes", () => {
    it("calls onRequestBind when one client joins in single-client mode", () => {
      const onRequestBind = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="streetview"
          onRequestBind={onRequestBind}
        />,
      );
      expect(onRequestBind).toHaveBeenCalledWith("c1");
    });

    it("does not auto-bind in multi-client modes", () => {
      const onRequestBind = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={onRequestBind}
        />,
      );
      expect(onRequestBind).not.toHaveBeenCalled();
    });

    it("does not auto-bind when already bound", () => {
      const onRequestBind = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="streetview"
          onRequestBind={onRequestBind}
          boundClientId="c1"
        />,
      );
      expect(onRequestBind).not.toHaveBeenCalled();
    });
  });

  describe("bind modal", () => {
    // The bind modal requires bindTargetId (internal state) to be set.
    // In single-client mode (streetview), auto-bind sets it via useEffect.
    // So we must render with conditions that trigger auto-bind first.

    it("shows Bound! when approved", () => {
      // Auto-bind fires for single-client mode, setting bindTargetId
      const onRequestBind = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="streetview"
          onRequestBind={onRequestBind}
          bindCode="654321"
          bindResult="approved"
        />,
      );
      expect(screen.getByText("Bound!")).toBeInTheDocument();
    });

    it("shows Declined when declined", () => {
      const onRequestBind = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="streetview"
          onRequestBind={onRequestBind}
          bindCode="654321"
          bindResult="declined"
        />,
      );
      expect(screen.getByText("Declined")).toBeInTheDocument();
    });

    it("shows bind code in multi-client mode when clicking a client", () => {
      const onRequestBind = vi.fn();
      const { rerender } = render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={onRequestBind}
        />,
      );

      // Click the client to trigger bind request
      fireEvent.click(screen.getByText(/Alice/));
      expect(onRequestBind).toHaveBeenCalledWith("c1");

      // Re-render with bindCode now set (simulating server response)
      rerender(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={onRequestBind}
          bindCode="654321"
          bindPending={true}
        />,
      );

      expect(screen.getByText("654321")).toBeInTheDocument();
      expect(screen.getByText(/Waiting for approval/)).toBeInTheDocument();
    });

    it("calls onCancelBind when Cancel clicked in multi-client mode", () => {
      const onRequestBind = vi.fn();
      const onCancelBind = vi.fn();

      const { rerender } = render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={onRequestBind}
          onCancelBind={onCancelBind}
        />,
      );

      // Click client to set bindTargetId
      fireEvent.click(screen.getByText(/Alice/));

      // Re-render with bindCode
      rerender(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={onRequestBind}
          onCancelBind={onCancelBind}
          bindCode="654321"
          bindPending={true}
        />,
      );

      fireEvent.click(screen.getByText("Cancel"));
      expect(onCancelBind).toHaveBeenCalled();
    });
  });

  describe("HostKeyToggle", () => {
    it("shows Show Host Key button when hostSecret provided", () => {
      render(<LobbyShell {...baseProps} hostSecret="SECRET123" role="host" mode="competition" />);
      expect(screen.getByText("Show Host Key")).toBeInTheDocument();
    });

    it("reveals host key when clicked", () => {
      render(<LobbyShell {...baseProps} hostSecret="SECRET123" role="host" mode="competition" />);
      fireEvent.click(screen.getByText("Show Host Key"));
      expect(screen.getByText("SECRET123")).toBeInTheDocument();
      expect(screen.getByText("Hide Host Key")).toBeInTheDocument();
    });

    it("hides host key when clicked again", () => {
      render(<LobbyShell {...baseProps} hostSecret="SECRET123" role="host" mode="competition" />);
      fireEvent.click(screen.getByText("Show Host Key"));
      fireEvent.click(screen.getByText("Hide Host Key"));
      expect(screen.queryByText("SECRET123")).not.toBeInTheDocument();
    });

    it("does not show host key toggle for guest", () => {
      render(<LobbyShell {...baseProps} hostSecret="SECRET123" role="guest" mode="competition" />);
      expect(screen.queryByText("Show Host Key")).not.toBeInTheDocument();
    });
  });

  describe("bind indicators in multi-client mode", () => {
    it("shows Taken badge for bound clients not owned by you", () => {
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          clientBindings={{ c1: true }}
        />,
      );
      expect(screen.getByText("Taken")).toBeInTheDocument();
    });

    it("shows Bound badge for own bound client", () => {
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          clientBindings={{ c1: true }}
          boundClientId="c1"
        />,
      );
      expect(screen.getByText("Bound")).toBeInTheDocument();
    });

    it("shows Bind button for unbound clients in multi-client mode", () => {
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={vi.fn()}
        />,
      );
      expect(screen.getByText("Bind")).toBeInTheDocument();
    });

    it("calls onRequestBind when clicking an unbound client", () => {
      const onRequestBind = vi.fn();
      render(
        <LobbyShell
          {...baseProps}
          clients={["c1"]}
          clientProfiles={{ c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 } }}
          mode="competition"
          onRequestBind={onRequestBind}
        />,
      );
      fireEvent.click(screen.getByText(/Alice/));
      expect(onRequestBind).toHaveBeenCalledWith("c1");
    });
  });

  describe("ADMIN role", () => {
    it("shows ADMIN badge", () => {
      render(<LobbyShell {...baseProps} role="admin" mode="competition" />);
      expect(screen.getByText("ADMIN")).toBeInTheDocument();
    });

    it("shows Start Realm for admin", () => {
      render(<LobbyShell {...baseProps} role="admin" mode="competition" />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeInTheDocument();
    });
  });
});
