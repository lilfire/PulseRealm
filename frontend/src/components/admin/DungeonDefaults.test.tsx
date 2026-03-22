import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { DungeonDefaults } from "./DungeonDefaults";

function setup(overrides: Partial<Parameters<typeof DungeonDefaults>[0]> = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const props = {
    difficulty: "normal",
    timeframeMinutes: 30,
    onChange,
    ...overrides,
  };
  render(<DungeonDefaults {...props} />);
  return { onChange, user };
}

describe("DungeonDefaults", () => {
  it("renders difficulty buttons (Easy, Normal, Hard)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Easy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Normal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hard" })).toBeInTheDocument();
  });

  it("highlights current difficulty with active class", () => {
    setup({ difficulty: "hard" });
    const hardBtn = screen.getByRole("button", { name: "Hard" });
    expect(hardBtn.className).toContain("admin-btn-option-active");
    const easyBtn = screen.getByRole("button", { name: "Easy" });
    expect(easyBtn.className).not.toContain("admin-btn-option-active");
  });

  it("highlights 'Normal' when difficulty is normal", () => {
    setup({ difficulty: "normal" });
    const normalBtn = screen.getByRole("button", { name: "Normal" });
    expect(normalBtn.className).toContain("admin-btn-option-active");
  });

  it("calls onChange('dungeonDifficulty', 'easy') when Easy clicked", async () => {
    const { onChange, user } = setup({ difficulty: "normal" });
    await user.click(screen.getByRole("button", { name: "Easy" }));
    expect(onChange).toHaveBeenCalledWith("dungeonDifficulty", "easy");
  });

  it("calls onChange('dungeonDifficulty', 'normal') when Normal clicked", async () => {
    const { onChange, user } = setup({ difficulty: "easy" });
    await user.click(screen.getByRole("button", { name: "Normal" }));
    expect(onChange).toHaveBeenCalledWith("dungeonDifficulty", "normal");
  });

  it("calls onChange('dungeonDifficulty', 'hard') when Hard clicked", async () => {
    const { onChange, user } = setup({ difficulty: "normal" });
    await user.click(screen.getByRole("button", { name: "Hard" }));
    expect(onChange).toHaveBeenCalledWith("dungeonDifficulty", "hard");
  });

  it("renders timeframe buttons (15, 30, 45, 60)", () => {
    setup();
    expect(screen.getByRole("button", { name: "15 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "60 min" })).toBeInTheDocument();
  });

  it("highlights the current timeframe", () => {
    setup({ timeframeMinutes: 45 });
    const btn45 = screen.getByRole("button", { name: "45 min" });
    expect(btn45.className).toContain("admin-btn-option-active");
    const btn15 = screen.getByRole("button", { name: "15 min" });
    expect(btn15.className).not.toContain("admin-btn-option-active");
  });

  it("calls onChange('dungeonTimeframeMinutes', 15) when 15 min clicked", async () => {
    const { onChange, user } = setup({ timeframeMinutes: 30 });
    await user.click(screen.getByRole("button", { name: "15 min" }));
    expect(onChange).toHaveBeenCalledWith("dungeonTimeframeMinutes", 15);
  });

  it("calls onChange('dungeonTimeframeMinutes', 30) when 30 min clicked", async () => {
    const { onChange, user } = setup({ timeframeMinutes: 15 });
    await user.click(screen.getByRole("button", { name: "30 min" }));
    expect(onChange).toHaveBeenCalledWith("dungeonTimeframeMinutes", 30);
  });

  it("calls onChange('dungeonTimeframeMinutes', 45) when 45 min clicked", async () => {
    const { onChange, user } = setup({ timeframeMinutes: 30 });
    await user.click(screen.getByRole("button", { name: "45 min" }));
    expect(onChange).toHaveBeenCalledWith("dungeonTimeframeMinutes", 45);
  });

  it("calls onChange('dungeonTimeframeMinutes', 60) when 60 min clicked", async () => {
    const { onChange, user } = setup({ timeframeMinutes: 30 });
    await user.click(screen.getByRole("button", { name: "60 min" }));
    expect(onChange).toHaveBeenCalledWith("dungeonTimeframeMinutes", 60);
  });

  it("renders section labels", () => {
    setup();
    expect(screen.getByText(/default difficulty/i)).toBeInTheDocument();
    expect(screen.getByText(/default timeframe/i)).toBeInTheDocument();
  });
});
