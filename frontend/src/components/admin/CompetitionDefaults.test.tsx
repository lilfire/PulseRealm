import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CompetitionDefaults } from "./CompetitionDefaults";

const defaultProps = {
  subMode: "race",
  playerFormat: "individual",
  targetDistanceKm: 5.0,
  intervalMinutes: 3,
  targetZone: 3,
  durationMinutes: 20,
  onChange: vi.fn(),
};

function setup(overrides = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const props = { ...defaultProps, onChange, ...overrides };
  render(<CompetitionDefaults {...props} />);
  return { onChange, user };
}

describe("CompetitionDefaults", () => {
  it("renders sub-mode buttons (Race, Elimination, Heartzone, King)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Race" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heartzone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "King" })).toBeInTheDocument();
  });

  it("highlights the current sub-mode with cyan border", () => {
    setup({ subMode: "elimination" });
    const eliminationBtn = screen.getByRole("button", { name: "Elimination" });
    // Selected buttons have 2px border with accent2 color; check the inline style attribute directly
    // because jsdom does not resolve CSS custom properties in toHaveStyle
    expect(eliminationBtn.style.border).toContain("2px solid");
    const raceBtn = screen.getByRole("button", { name: "Race" });
    expect(raceBtn.style.border).toContain("1px solid");
  });

  it("calls onChange('competitionSubMode', value) when sub-mode clicked", async () => {
    const { onChange, user } = setup({ subMode: "race" });
    await user.click(screen.getByRole("button", { name: "Elimination" }));
    expect(onChange).toHaveBeenCalledWith("competitionSubMode", "elimination");
  });

  it("calls onChange for each sub-mode button", async () => {
    const { onChange, user } = setup();
    for (const [label, value] of [
      ["Race", "race"],
      ["Elimination", "elimination"],
      ["Heartzone", "heartzone"],
      ["King", "king"],
    ] as [string, string][]) {
      await user.click(screen.getByRole("button", { name: label }));
      expect(onChange).toHaveBeenCalledWith("competitionSubMode", value);
    }
  });

  it("renders player format buttons (Individual, Team)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Individual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Team" })).toBeInTheDocument();
  });

  it("highlights the current player format", () => {
    setup({ playerFormat: "team" });
    const teamBtn = screen.getByRole("button", { name: "Team" });
    expect(teamBtn.style.border).toContain("2px solid");
    const individualBtn = screen.getByRole("button", { name: "Individual" });
    expect(individualBtn.style.border).toContain("1px solid");
  });

  it("calls onChange('competitionPlayerFormat', value) when format clicked", async () => {
    const { onChange, user } = setup({ playerFormat: "individual" });
    await user.click(screen.getByRole("button", { name: "Team" }));
    expect(onChange).toHaveBeenCalledWith("competitionPlayerFormat", "team");
  });

  it("calls onChange for Individual format button", async () => {
    const { onChange, user } = setup({ playerFormat: "team" });
    await user.click(screen.getByRole("button", { name: "Individual" }));
    expect(onChange).toHaveBeenCalledWith("competitionPlayerFormat", "individual");
  });

  it("shows target distance slider with correct value", () => {
    setup({ targetDistanceKm: 10.0 });
    const sliders = screen.getAllByRole("slider");
    const distanceSlider = sliders[0] as HTMLInputElement;
    expect(distanceSlider.value).toBe("10");
  });

  it("displays target distance in km", () => {
    setup({ targetDistanceKm: 7.5 });
    expect(screen.getByText("7.5 km")).toBeInTheDocument();
  });

  it("calls onChange('competitionTargetDistanceKm', value) on slider change", () => {
    const { onChange } = setup({ targetDistanceKm: 5.0 });
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith("competitionTargetDistanceKm", 12);
  });

  it("shows interval buttons (1, 2, 3, 5, 10 min)", () => {
    setup();
    expect(screen.getByRole("button", { name: "1 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10 min" })).toBeInTheDocument();
  });

  it("highlights the current interval", () => {
    setup({ intervalMinutes: 5 });
    const btn5 = screen.getByRole("button", { name: "5 min" });
    expect(btn5.style.border).toContain("2px solid");
    const btn1 = screen.getByRole("button", { name: "1 min" });
    expect(btn1.style.border).toContain("1px solid");
  });

  it("calls onChange('competitionIntervalMinutes', value) when interval clicked", async () => {
    const { onChange, user } = setup({ intervalMinutes: 3 });
    await user.click(screen.getByRole("button", { name: "10 min" }));
    expect(onChange).toHaveBeenCalledWith("competitionIntervalMinutes", 10);
  });

  it("calls onChange for each interval button", async () => {
    const { onChange, user } = setup();
    for (const value of [1, 2, 3, 5, 10]) {
      await user.click(screen.getByRole("button", { name: `${value} min` }));
      expect(onChange).toHaveBeenCalledWith("competitionIntervalMinutes", value);
    }
  });

  it("shows zone target buttons (1-5)", () => {
    setup();
    for (let z = 1; z <= 5; z++) {
      expect(screen.getByRole("button", { name: `Zone ${z}` })).toBeInTheDocument();
    }
  });

  it("highlights the current target zone", () => {
    setup({ targetZone: 4 });
    const zone4 = screen.getByRole("button", { name: "Zone 4" });
    expect(zone4.style.border).toContain("2px solid");
    const zone1 = screen.getByRole("button", { name: "Zone 1" });
    expect(zone1.style.border).toContain("1px solid");
  });

  it("calls onChange('competitionTargetZone', value) when zone clicked", async () => {
    const { onChange, user } = setup({ targetZone: 3 });
    await user.click(screen.getByRole("button", { name: "Zone 5" }));
    expect(onChange).toHaveBeenCalledWith("competitionTargetZone", 5);
  });

  it("calls onChange for each zone button", async () => {
    const { onChange, user } = setup();
    for (let z = 1; z <= 5; z++) {
      await user.click(screen.getByRole("button", { name: `Zone ${z}` }));
      expect(onChange).toHaveBeenCalledWith("competitionTargetZone", z);
    }
  });

  it("shows duration slider", () => {
    setup({ durationMinutes: 30 });
    const sliders = screen.getAllByRole("slider");
    const durationSlider = sliders[1] as HTMLInputElement;
    expect(durationSlider.value).toBe("30");
  });

  it("displays duration in minutes", () => {
    setup({ durationMinutes: 45 });
    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("calls onChange('competitionDurationMinutes', value) on duration change", () => {
    const { onChange } = setup({ durationMinutes: 20 });
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[1], { target: { value: "35" } });
    expect(onChange).toHaveBeenCalledWith("competitionDurationMinutes", 35);
  });
});
