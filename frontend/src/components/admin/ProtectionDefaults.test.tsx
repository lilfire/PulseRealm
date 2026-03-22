import { render, screen, fireEvent } from "@testing-library/react";
import { ProtectionDefaults } from "./ProtectionDefaults";

describe("ProtectionDefaults", () => {
  function setup(overrides?: { maxWearableMessagesPerSecond?: number; maxConcurrentRealms?: number }) {
    const onChange = vi.fn();
    render(
      <ProtectionDefaults
        maxWearableMessagesPerSecond={overrides?.maxWearableMessagesPerSecond ?? 5}
        maxConcurrentRealms={overrides?.maxConcurrentRealms ?? 10}
        onChange={onChange}
      />,
    );
    return { onChange };
  }

  it("renders rate limit buttons", () => {
    setup();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // "5" and "10" appear in both groups, use getAllByText
    expect(screen.getAllByText("5")).toHaveLength(2);
    expect(screen.getAllByText("10")).toHaveLength(2);
  });

  it("renders realm limit buttons", () => {
    setup();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("renders Unlimited buttons", () => {
    setup();
    const unlimitedBtns = screen.getAllByText("Unlimited");
    expect(unlimitedBtns).toHaveLength(2);
  });

  it("calls onChange with correct args for rate limit buttons", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByText("2"));
    expect(onChange).toHaveBeenCalledWith("maxWearableMessagesPerSecond", 2);
  });

  it("calls onChange with 0 for rate limit Unlimited", () => {
    const { onChange } = setup();
    const unlimitedBtns = screen.getAllByText("Unlimited");
    fireEvent.click(unlimitedBtns[0]);
    expect(onChange).toHaveBeenCalledWith("maxWearableMessagesPerSecond", 0);
  });

  it("calls onChange with correct args for realm limit buttons", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByText("20"));
    expect(onChange).toHaveBeenCalledWith("maxConcurrentRealms", 20);
  });

  it("calls onChange with 0 for realm limit Unlimited", () => {
    const { onChange } = setup();
    const unlimitedBtns = screen.getAllByText("Unlimited");
    fireEvent.click(unlimitedBtns[1]);
    expect(onChange).toHaveBeenCalledWith("maxConcurrentRealms", 0);
  });

  it("applies active class to matching rate limit value", () => {
    setup({ maxWearableMessagesPerSecond: 2 });
    const btn2 = screen.getByText("2");
    expect(btn2.className).toContain("admin-btn-option-active");
    const btn1 = screen.getByText("1");
    expect(btn1.className).not.toContain("admin-btn-option-active");
  });

  it("applies active class to matching realm limit value", () => {
    setup({ maxConcurrentRealms: 20 });
    const btn20 = screen.getByText("20");
    expect(btn20.className).toContain("admin-btn-option-active");
    const btn50 = screen.getByText("50");
    expect(btn50.className).not.toContain("admin-btn-option-active");
  });

  it("applies active class to Unlimited when value is 0", () => {
    setup({ maxWearableMessagesPerSecond: 0, maxConcurrentRealms: 0 });
    const unlimitedBtns = screen.getAllByText("Unlimited");
    expect(unlimitedBtns[0].className).toContain("admin-btn-option-active");
    expect(unlimitedBtns[1].className).toContain("admin-btn-option-active");
  });
});
