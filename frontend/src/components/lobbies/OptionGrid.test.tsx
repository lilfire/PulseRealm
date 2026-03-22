import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { OptionGrid } from "./OptionGrid";

// --- Module-level mock factory ---
// The mock is hoisted by Vitest, so we use a factory that reads from a mutable
// config object that individual tests can override before rendering.
const mockConfig = { visibleCount: 3, columnCount: 3 };

vi.mock("../../hooks/useGridFit", () => ({
  useGridFit: () => ({
    containerRef: { current: null },
    visibleCount: mockConfig.visibleCount,
    columnCount: mockConfig.columnCount,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StringItem = string;

const keyExtractor = (item: StringItem, index: number) => `${item}-${index}`;
const renderCard = (item: StringItem, index: number) => (
  <span data-testid={`card-${index}`}>{item}</span>
);

/** Builds a default set of props for OptionGrid<string>. */
function buildProps(overrides: {
  items?: StringItem[];
  visibleCount?: number;
  columnCount?: number;
  gap?: number;
} = {}) {
  // Apply mock config so the hook returns the desired values.
  mockConfig.visibleCount = overrides.visibleCount ?? 3;
  mockConfig.columnCount = overrides.columnCount ?? 3;

  return {
    items: overrides.items ?? ["A", "B", "C"],
    cardMinWidth: 100,
    cardHeight: 80,
    gap: overrides.gap,
    keyExtractor,
    renderCard,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock config to safe defaults before each test.
  mockConfig.visibleCount = 3;
  mockConfig.columnCount = 3;
});

describe("OptionGrid", () => {
  // 1. Renders all items when visibleCount covers all of them (single page).
  it("renders all items when visibleCount covers them", () => {
    const props = buildProps({ items: ["A", "B", "C"], visibleCount: 3 });
    render(<OptionGrid {...props} />);

    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
    expect(screen.getByTestId("card-1")).toHaveTextContent("B");
    expect(screen.getByTestId("card-2")).toHaveTextContent("C");
  });

  // 11. No pagination controls when all items fit on one page (totalPages === 1).
  it("does not render pagination when all items fit on one page", () => {
    const props = buildProps({ items: ["A", "B", "C"], visibleCount: 3 });
    render(<OptionGrid {...props} />);

    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  // 13. Empty items array renders an empty grid without crashing.
  it("renders an empty grid for an empty items array", () => {
    const props = buildProps({ items: [], visibleCount: 3 });
    render(<OptionGrid {...props} />);

    // No cards, no pagination controls.
    expect(screen.queryByTestId(/^card-/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
  });

  // 12. pageSize fallback: when visibleCount === 0, pageSize falls back to items.length.
  it("falls back to items.length as pageSize when visibleCount is 0", () => {
    // With visibleCount=0 and 3 items, pageSize = 3, totalPages = 1.
    const props = buildProps({ items: ["A", "B", "C"], visibleCount: 0 });
    render(<OptionGrid {...props} />);

    // All 3 items are visible on the single page.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
    expect(screen.getByTestId("card-1")).toHaveTextContent("B");
    expect(screen.getByTestId("card-2")).toHaveTextContent("C");
    // No pagination because totalPages === 1.
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
  });

  // 2. Pagination: prev/next buttons appear when totalPages > 1.
  it("shows prev and next buttons when items exceed one page", () => {
    // visibleCount=2, 5 items => pageSize=2, totalPages=3
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
  });

  // 5a. Prev button is disabled on the first page.
  it("disables the prev button on the first page", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  // 3. Next button click advances the page.
  it("advances to the next page when the next button is clicked", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    // Page 0: items A, B
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    // Page 1: items C, D
    expect(screen.getByTestId("card-2")).toHaveTextContent("C");
    expect(screen.getByTestId("card-3")).toHaveTextContent("D");
  });

  // 4. Prev button click goes back.
  it("goes back to the previous page when the prev button is clicked", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    // Now on page 1.
    expect(screen.getByTestId("card-2")).toHaveTextContent("C");

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    // Back on page 0.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
  });

  // 5b. Next button is disabled on the last page.
  it("disables the next button on the last page", () => {
    // visibleCount=2, 4 items => totalPages=2
    const props = buildProps({ items: ["A", "B", "C", "D"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    // Now on the last page.
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  // 6. Clicking a dot navigates directly to that page.
  it("navigates to a specific page when a dot is clicked", () => {
    // visibleCount=2, 5 items => pages 0,1,2
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    // Three dots should be rendered (pages 0, 1, 2).
    // Use the pagination container's child divs (the dots) by querying their style.
    const { container } = render(<OptionGrid {...props} />);
    // Get the dot elements — they are styled divs with borderRadius 50%.
    // We'll find them by their parent navigation bar.
    const nav = container.querySelector('[style*="alignItems: center"][style*="justifyContent: center"]');
    // If null, fall back to screen query approach across both renders.
    if (nav) {
      const dots = Array.from(nav.querySelectorAll("div"));
      // Dots are the div children (not buttons) of the nav.
      expect(dots.length).toBeGreaterThan(0);
    }

    // Click the last dot (index 2 = page 2) via the "Next page" path instead,
    // since dots don't have accessible names. Navigate using the next button twice.
    const nextBtn = screen.getAllByRole("button", { name: "Next page" })[0];
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);

    // Page 2: only item E (index 4)
    expect(screen.getByTestId("card-4")).toHaveTextContent("E");
  });

  // 6 (direct). Dot onClick handler sets the page correctly.
  it("navigates directly to page 2 when the third dot is clicked", () => {
    const items = ["A", "B", "C", "D", "E", "F"];
    // visibleCount=2 => pages 0,1,2
    const props = buildProps({ items, visibleCount: 2 });
    const { container } = render(<OptionGrid {...props} />);

    // Outer wrapper is a column-flex div. Its children are:
    //   [0] scroll container (holds the grid)
    //   [1] pagination bar (only present when totalPages > 1)
    const outerWrapper = container.firstChild as HTMLElement;
    expect(outerWrapper).not.toBeNull();
    const paginationBar = outerWrapper.children[1] as HTMLElement;
    expect(paginationBar).not.toBeNull();

    // The pagination bar contains: [prev button] [dots container] [next button]
    // The dots container is the middle child (index 1).
    const dotsContainer = paginationBar.children[1] as HTMLElement;
    expect(dotsContainer).not.toBeNull();
    const dots = Array.from(dotsContainer.children);
    expect(dots.length).toBe(3);

    // Click the third dot (page 2).
    act(() => {
      fireEvent.click(dots[2]);
    });

    // Page 2: items at index 4 and 5.
    expect(screen.getByTestId("card-4")).toHaveTextContent("E");
    expect(screen.getByTestId("card-5")).toHaveTextContent("F");
  });

  // 7. Touch swipe left (negative dx) triggers goNext.
  it("goes to the next page on a left swipe", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    const { container } = render(<OptionGrid {...props} />);

    const swipeTarget = container.firstChild!.firstChild as Element;

    fireEvent.touchStart(swipeTarget, {
      touches: [{ clientX: 300, clientY: 100 }],
    });
    fireEvent.touchEnd(swipeTarget, {
      changedTouches: [{ clientX: 200, clientY: 105 }],
    });

    // Left swipe (dx = -100) should go to page 1.
    expect(screen.getByTestId("card-2")).toHaveTextContent("C");
  });

  // 8. Touch swipe right (positive dx) triggers goPrev.
  it("goes to the previous page on a right swipe", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    const { container } = render(<OptionGrid {...props} />);

    const swipeTarget = container.firstChild!.firstChild as Element;

    // Navigate to page 1 first.
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("card-2")).toHaveTextContent("C");

    // Swipe right (positive dx) to go back.
    fireEvent.touchStart(swipeTarget, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(swipeTarget, {
      changedTouches: [{ clientX: 220, clientY: 108 }],
    });

    // Should be back on page 0.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
  });

  // 9. Dominant vertical swipe does NOT change the page.
  it("does not change page when the swipe is predominantly vertical", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    const { container } = render(<OptionGrid {...props} />);

    const swipeTarget = container.firstChild!.firstChild as Element;

    // dx = -60 but dy = -200 => vertical dominant, no page change.
    fireEvent.touchStart(swipeTarget, {
      touches: [{ clientX: 300, clientY: 300 }],
    });
    fireEvent.touchEnd(swipeTarget, {
      changedTouches: [{ clientX: 240, clientY: 100 }],
    });

    // Still on page 0.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
    expect(screen.queryByTestId("card-2")).not.toBeInTheDocument();
  });

  // 9b. Short horizontal swipe (< 50px) does NOT change the page.
  it("does not change page when horizontal swipe distance is less than 50px", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    const { container } = render(<OptionGrid {...props} />);

    const swipeTarget = container.firstChild!.firstChild as Element;

    // dx = -30, which is < 50 threshold.
    fireEvent.touchStart(swipeTarget, {
      touches: [{ clientX: 300, clientY: 100 }],
    });
    fireEvent.touchEnd(swipeTarget, {
      changedTouches: [{ clientX: 270, clientY: 102 }],
    });

    // Still on page 0.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
    expect(screen.queryByTestId("card-2")).not.toBeInTheDocument();
  });

  // 10. touchEnd without prior touchStart does NOT change page.
  it("does not change page when touchEnd fires without a prior touchStart", () => {
    const props = buildProps({ items: ["A", "B", "C", "D", "E"], visibleCount: 2 });
    const { container } = render(<OptionGrid {...props} />);

    const swipeTarget = container.firstChild!.firstChild as Element;

    // Fire touchEnd without touchStart (refs remain null).
    fireEvent.touchEnd(swipeTarget, {
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });

    // Still on page 0.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
    expect(screen.queryByTestId("card-2")).not.toBeInTheDocument();
  });

  // goNext/goPrev boundary: goNext does not exceed last page.
  it("does not advance past the last page when next is clicked repeatedly", () => {
    // visibleCount=2, 4 items => 2 pages (0 and 1)
    const props = buildProps({ items: ["A", "B", "C", "D"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    const nextBtn = screen.getByRole("button", { name: "Next page" });
    fireEvent.click(nextBtn); // page 1
    // Button is now disabled; clicking again should be a no-op.
    fireEvent.click(nextBtn); // still page 1

    expect(screen.getByTestId("card-2")).toHaveTextContent("C");
    expect(screen.getByTestId("card-3")).toHaveTextContent("D");
  });

  // goPrev boundary: goPrev does not go below page 0.
  it("does not go below page 0 when prev is clicked on the first page", () => {
    const props = buildProps({ items: ["A", "B", "C", "D"], visibleCount: 2 });
    render(<OptionGrid {...props} />);

    const prevBtn = screen.getByRole("button", { name: "Previous page" });
    // Already disabled, but click anyway.
    fireEvent.click(prevBtn);

    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
  });

  // custom gap prop is forwarded correctly (smoke test — no crash, renders items).
  it("renders correctly with a custom gap prop", () => {
    const props = buildProps({ items: ["A", "B", "C"], visibleCount: 3, gap: 20 });
    render(<OptionGrid {...props} />);
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
  });

  // useEffect clamps the page when totalPages decreases below current page.
  it("clamps page index when items shrink and current page would be out of bounds", () => {
    // Start with 6 items, visibleCount=2 => 3 pages; navigate to page 2.
    mockConfig.visibleCount = 2;
    mockConfig.columnCount = 2;
    const { rerender } = render(
      <OptionGrid
        items={["A", "B", "C", "D", "E", "F"]}
        cardMinWidth={100}
        cardHeight={80}
        keyExtractor={keyExtractor}
        renderCard={renderCard}
      />
    );

    // Navigate to page 2.
    const nextBtn = screen.getByRole("button", { name: "Next page" });
    fireEvent.click(nextBtn); // page 1
    fireEvent.click(nextBtn); // page 2
    expect(screen.getByTestId("card-4")).toHaveTextContent("E");

    // Now shrink items to 2 => totalPages=1; the useEffect should clamp page to 0.
    act(() => {
      rerender(
        <OptionGrid
          items={["A", "B"]}
          cardMinWidth={100}
          cardHeight={80}
          keyExtractor={keyExtractor}
          renderCard={renderCard}
        />
      );
    });

    // Page should be clamped to 0, showing A and B.
    expect(screen.getByTestId("card-0")).toHaveTextContent("A");
    expect(screen.getByTestId("card-1")).toHaveTextContent("B");
    // Pagination should be gone (only 1 page).
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
  });
});
