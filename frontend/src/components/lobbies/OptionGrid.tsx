import React, { useState, useRef, useCallback, useEffect } from "react";
import { useGridFit } from "../../hooks/useGridFit";

interface OptionGridProps<T> {
  items: T[];
  cardMinWidth: number;
  cardHeight: number;
  gap?: number;
  keyExtractor: (item: T, index: number) => string;
  renderCard: (item: T, index: number) => React.ReactNode;
}

export function OptionGrid<T>({
  items,
  cardMinWidth,
  cardHeight,
  gap = 12,
  keyExtractor,
  renderCard,
}: OptionGridProps<T>) {
  const { containerRef, visibleCount, columnCount } = useGridFit({
    cardMinWidth,
    cardHeight,
    gap,
    totalItems: items.length,
  });

  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const pageSize = visibleCount > 0 ? visibleCount : items.length;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Clamp page when items/pageSize changes
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const goNext = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 0));
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Only trigger if horizontal swipe is dominant and > 50px
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  const startIdx = page * pageSize;
  const pageItems = items.slice(startIdx, startIdx + pageSize);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            gap: `${gap}px`,
            maxWidth: "100%",
          }}
        >
          {pageItems.map((item, i) => (
            <div key={keyExtractor(item, startIdx + i)} style={{ height: cardHeight }}>
              {renderCard(item, startIdx + i)}
            </div>
          ))}
        </div>
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: "0.5rem", flexShrink: 0 }}>
          <button
            onClick={goPrev}
            disabled={page === 0}
            style={{
              background: "transparent",
              border: "none",
              color: page === 0 ? "#444" : "#aaa",
              fontSize: "1.2rem",
              cursor: page === 0 ? "default" : "pointer",
              padding: "0.25rem 0.5rem",
              lineHeight: 1,
            }}
            aria-label="Previous page"
          >
            ‹
          </button>
          <div style={{ display: "flex", margin: "0 0.5rem" }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <div
                key={i}
                onClick={() => setPage(i)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i === page ? "#33DFFF" : "#555",
                  margin: "0 3px",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              />
            ))}
          </div>
          <button
            onClick={goNext}
            disabled={page === totalPages - 1}
            style={{
              background: "transparent",
              border: "none",
              color: page === totalPages - 1 ? "#444" : "#aaa",
              fontSize: "1.2rem",
              cursor: page === totalPages - 1 ? "default" : "pointer",
              padding: "0.25rem 0.5rem",
              lineHeight: 1,
            }}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
