import "@testing-library/jest-dom";

// Polyfill ResizeObserver for jsdom
global.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // Trigger the callback once so useGridFit computes layout
    this.callback(
      [{ target, contentRect: { width: 1200, height: 800 } } as unknown as ResizeObserverEntry],
      this
    );
  }
  unobserve() {}
  disconnect() {}
};

// Provide default element dimensions for jsdom (used by useGridFit)
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 1200; } });
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 800; } });

// Mock import.meta.env
Object.defineProperty(import.meta, "env", {
  value: {
    VITE_GOOGLE_MAPS_API_KEY: "",
    VITE_API_URL: "",
    VITE_HUB_URL: "",
  },
  writable: true,
});
