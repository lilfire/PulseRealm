import { useState, useEffect, useRef } from "react";

interface GridFitOptions {
  cardMinWidth: number;
  cardHeight: number;
  gap: number;
  totalItems: number;
}

interface GridFitResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  visibleCount: number;
  columnCount: number;
}

export function useGridFit({ cardMinWidth, cardHeight, gap, totalItems }: GridFitOptions): GridFitResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(totalItems);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const width = el.clientWidth;
      const height = el.clientHeight;

      const cols = Math.max(1, Math.floor((width + gap) / (cardMinWidth + gap)));
      const rows = Math.max(1, Math.floor((height + gap) / (cardHeight + gap)));
      const count = Math.min(rows * cols, totalItems);

      setColumnCount(cols);
      setVisibleCount(count);
    }

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(el);
    measure();

    return () => {
      observer.disconnect();
    };
  }, [cardMinWidth, cardHeight, gap, totalItems]);

  return { containerRef, visibleCount, columnCount };
}
