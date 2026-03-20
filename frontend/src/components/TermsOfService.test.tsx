import { render, screen, fireEvent } from "@testing-library/react";
import { TermsOfService } from "./TermsOfService";

describe("TermsOfService", () => {
  it("renders heading", () => {
    render(<TermsOfService onBack={vi.fn()} />);
    expect(screen.getByText("Terms of Service", { selector: "h1" })).toBeInTheDocument();
  });

  it("calls onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<TermsOfService onBack={onBack} />);
    fireEvent.click(screen.getByText(/Back/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders all 15 sections", () => {
    render(<TermsOfService onBack={vi.fn()} />);
    expect(screen.getByText("1. Acceptance of Terms")).toBeInTheDocument();
    expect(screen.getByText("15. Contact")).toBeInTheDocument();
  });
});
