import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { DefaultLobby } from "./DefaultLobby";
import type { ClientProfile } from "../../types/session";

const baseProps = {
  joinCode: "111222",
  clients: [] as string[],
  clientProfiles: {} as Record<string, ClientProfile>,
  connected: true,
  onStart: vi.fn(),
  onLeave: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DefaultLobby", () => {
  it("renders with join code", () => {
    render(<DefaultLobby {...baseProps} joinCode="111222" />);
    expect(screen.getByText("111222")).toBeInTheDocument();
  });

  it("can start when connected and has clients", () => {
    const clients = ["c1"];
    const profiles: Record<string, ClientProfile> = {
      c1: { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 },
    };
    render(<DefaultLobby {...baseProps} connected={true} clients={clients} clientProfiles={profiles} />);
    expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
  });

  it("cannot start when no clients even if connected", () => {
    render(<DefaultLobby {...baseProps} connected={true} clients={[]} />);
    expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
  });

  it("cannot start when not connected even with clients", () => {
    const clients = ["c1"];
    const profiles: Record<string, ClientProfile> = {
      c1: { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 },
    };
    render(<DefaultLobby {...baseProps} connected={false} clients={clients} clientProfiles={profiles} />);
    expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
  });

  it("calls onStart when start button is clicked and canStart is true", () => {
    const onStart = vi.fn();
    const clients = ["c1"];
    const profiles: Record<string, ClientProfile> = {
      c1: { clientId: "c1", name: "Alice", heightCm: 0, weightKg: 0 },
    };
    render(<DefaultLobby {...baseProps} connected={true} clients={clients} clientProfiles={profiles} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("calls onLeave when leave button is clicked", () => {
    const onLeave = vi.fn();
    render(<DefaultLobby {...baseProps} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: "Leave Realm" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("does not show Start Realm button in viewOnly mode", () => {
    render(<DefaultLobby {...baseProps} viewOnly={true} />);
    expect(screen.queryByRole("button", { name: "Start Realm" })).not.toBeInTheDocument();
  });

  it("shows Waiting for players when connected and not viewOnly", () => {
    render(<DefaultLobby {...baseProps} connected={true} viewOnly={false} />);
    expect(screen.getByText(/Waiting for players\.\.\./)).toBeInTheDocument();
  });

  it("shows Connecting when not connected", () => {
    render(<DefaultLobby {...baseProps} connected={false} />);
    expect(screen.getByText(/Connecting\.\.\./)).toBeInTheDocument();
  });
});
