import "@testing-library/jest-dom";

// Mock import.meta.env
Object.defineProperty(import.meta, "env", {
  value: {
    VITE_GOOGLE_MAPS_API_KEY: "",
    VITE_API_URL: "",
    VITE_HUB_URL: "",
  },
  writable: true,
});
