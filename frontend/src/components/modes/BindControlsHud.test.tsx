import { render, screen, fireEvent } from "@testing-library/react";
import { BindControlsHud } from "./BindControlsHud";

describe("BindControlsHud", () => {
  const CLIENT_ID = "client-1";

  it("returns null when no handlers provided", () => {
    const { container } = render(
      <BindControlsHud boundClientId={CLIENT_ID} />,
    );
    expect(container.innerHTML).toBe("");
  });

  describe("incline controls", () => {
    function setup(incline = 5) {
      const onSetIncline = vi.fn();
      render(
        <BindControlsHud
          boundClientId={CLIENT_ID}
          clientInclines={{ [CLIENT_ID]: incline }}
          onSetIncline={onSetIncline}
        />,
      );
      return { onSetIncline };
    }

    it("renders incline label and value", () => {
      setup(5);
      expect(screen.getByText("Incline")).toBeInTheDocument();
      expect(screen.getByText("5.0%")).toBeInTheDocument();
    });

    it("decrements incline by 0.5", () => {
      const { onSetIncline } = setup(5);
      fireEvent.click(screen.getAllByText("−")[0]);
      expect(onSetIncline).toHaveBeenCalledWith(CLIENT_ID, 4.5);
    });

    it("increments incline by 0.5", () => {
      const { onSetIncline } = setup(5);
      fireEvent.click(screen.getAllByText("+")[0]);
      expect(onSetIncline).toHaveBeenCalledWith(CLIENT_ID, 5.5);
    });

    it("does not go below 0", () => {
      const { onSetIncline } = setup(0);
      fireEvent.click(screen.getAllByText("−")[0]);
      expect(onSetIncline).toHaveBeenCalledWith(CLIENT_ID, 0);
    });

    it("does not go above 15", () => {
      const { onSetIncline } = setup(15);
      fireEvent.click(screen.getAllByText("+")[0]);
      expect(onSetIncline).toHaveBeenCalledWith(CLIENT_ID, 15);
    });

    it("defaults to 0 when no incline data", () => {
      const onSetIncline = vi.fn();
      render(
        <BindControlsHud
          boundClientId={CLIENT_ID}
          onSetIncline={onSetIncline}
        />,
      );
      expect(screen.getByText("0.0%")).toBeInTheDocument();
    });
  });

  describe("speed override controls", () => {
    function setup(speed = 0) {
      const onSetSpeedOverride = vi.fn();
      render(
        <BindControlsHud
          boundClientId={CLIENT_ID}
          clientSpeedOverrides={{ [CLIENT_ID]: speed }}
          onSetSpeedOverride={onSetSpeedOverride}
        />,
      );
      return { onSetSpeedOverride };
    }

    it("shows Auto when no override", () => {
      setup(0);
      expect(screen.getByText("Auto")).toBeInTheDocument();
      expect(screen.getByText("— km/h")).toBeInTheDocument();
    });

    it("shows Manual when override active", () => {
      setup(5);
      expect(screen.getByText("Manual")).toBeInTheDocument();
      expect(screen.getByText("5.0 km/h")).toBeInTheDocument();
    });

    it("toggles from Auto to Manual (sets 5)", () => {
      const { onSetSpeedOverride } = setup(0);
      fireEvent.click(screen.getByText("Auto"));
      expect(onSetSpeedOverride).toHaveBeenCalledWith(CLIENT_ID, 5);
    });

    it("toggles from Manual to Auto (sets 0)", () => {
      const { onSetSpeedOverride } = setup(5);
      fireEvent.click(screen.getByText("Manual"));
      expect(onSetSpeedOverride).toHaveBeenCalledWith(CLIENT_ID, 0);
    });

    it("decrements speed by 0.5 when override active", () => {
      const { onSetSpeedOverride } = setup(5);
      const minusBtns = screen.getAllByText("−");
      fireEvent.click(minusBtns[0]);
      expect(onSetSpeedOverride).toHaveBeenCalledWith(CLIENT_ID, 4.5);
    });

    it("increments speed by 0.5 when override active", () => {
      const { onSetSpeedOverride } = setup(5);
      const plusBtns = screen.getAllByText("+");
      fireEvent.click(plusBtns[0]);
      expect(onSetSpeedOverride).toHaveBeenCalledWith(CLIENT_ID, 5.5);
    });

    it("clamps speed minimum to 0.5", () => {
      const { onSetSpeedOverride } = setup(0.5);
      const minusBtns = screen.getAllByText("−");
      fireEvent.click(minusBtns[0]);
      expect(onSetSpeedOverride).toHaveBeenCalledWith(CLIENT_ID, 0.5);
    });

    it("clamps speed maximum to 30", () => {
      const { onSetSpeedOverride } = setup(30);
      const plusBtns = screen.getAllByText("+");
      fireEvent.click(plusBtns[0]);
      expect(onSetSpeedOverride).toHaveBeenCalledWith(CLIENT_ID, 30);
    });

    it("disables -/+ buttons when no override", () => {
      setup(0);
      const minusBtns = screen.getAllByText("−");
      const plusBtns = screen.getAllByText("+");
      expect(minusBtns[0]).toBeDisabled();
      expect(plusBtns[0]).toBeDisabled();
    });
  });
});
