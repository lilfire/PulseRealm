import React from "react";
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

  return (
    <div
      ref={containerRef}
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
        {items.slice(0, visibleCount).map((item, i) => (
          <div key={keyExtractor(item, i)} style={{ height: cardHeight }}>
            {renderCard(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}
