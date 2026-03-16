import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AdminLogin } from "./AdminLogin";

const API_URL = "http://localhost:5062";

function setup() {
  const onSuccess = vi.fn();
  const onBack = vi.fn();
  const user = userEvent.setup();
  render(<AdminLogin apiUrl={API_URL} onSuccess={onSuccess} onBack={onBack} />);
  return { onSuccess, onBack, user };
}

describe("AdminLogin", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders login form with username and password inputs", () => {
    setup();
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("submit button is disabled when fields are empty", () => {
    setup();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("submit button is disabled when only username is filled", async () => {
    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("submit button is disabled when only password is filled", async () => {
    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("submit button is enabled when both fields have values", async () => {
    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("calls fetch with correct URL and credentials on submit", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "tok123" }),
    } as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${API_URL}/api/admin/login`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password: "secret" }),
        })
      );
    });
  });

  it("calls onSuccess with token on successful login", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "tok123" }),
    } as Response);

    const { user, onSuccess } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("tok123");
    });
  });

  it("shows error message on failed login (non-ok response)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid credentials" }),
    } as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("shows error from response body when available", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Account locked" }),
    } as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Account locked")).toBeInTheDocument();
    });
  });

  it("shows 'Login failed' when response body has no error field", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "something else" }),
    } as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Login failed")).toBeInTheDocument();
    });
  });

  it("shows 'Login failed' when response body cannot be parsed", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new Error("bad json"); },
    } as unknown as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Login failed")).toBeInTheDocument();
    });
  });

  it("shows 'Could not connect to server' on network error", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network failure"));

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Could not connect to server")).toBeInTheDocument();
    });
  });

  it("shows 'Signing in...' text while loading", async () => {
    let resolveJson!: (v: unknown) => void;
    const jsonPromise = new Promise((res) => { resolveJson = res; });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => jsonPromise,
    } as unknown as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Signing in...")).toBeInTheDocument();

    resolveJson({ token: "tok" });
  });

  it("disables submit while loading", async () => {
    let resolveJson!: (v: unknown) => void;
    const jsonPromise = new Promise((res) => { resolveJson = res; });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => jsonPromise,
    } as unknown as Response);

    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("button", { name: /signing in/i })).toBeDisabled();

    resolveJson({ token: "tok" });
  });

  it("calls onBack when back button clicked", async () => {
    const { user, onBack } = setup();
    await user.click(screen.getByRole("button", { name: /back to home/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
