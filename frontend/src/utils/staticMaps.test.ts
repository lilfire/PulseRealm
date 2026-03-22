import {
  moveAlongHeading,
  computeDistanceBetween,
  computeHeading,
  streetViewImageUrl,
  streetViewMetadataUrl,
  staticMapUrl,
} from "./staticMaps";

describe("moveAlongHeading", () => {
  it("moves north (heading 0) and increases latitude", () => {
    const result = moveAlongHeading(0, 0, 0, 1000);
    expect(result.lat).toBeGreaterThan(0);
    expect(result.lng).toBeCloseTo(0, 5);
  });

  it("moves east (heading 90) and increases longitude", () => {
    const result = moveAlongHeading(0, 0, 90, 1000);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeGreaterThan(0);
  });

  it("moves south (heading 180) and decreases latitude", () => {
    const result = moveAlongHeading(0, 0, 180, 1000);
    expect(result.lat).toBeLessThan(0);
    expect(result.lng).toBeCloseTo(0, 3);
  });

  it("moves west (heading 270) and decreases longitude", () => {
    const result = moveAlongHeading(0, 0, 270, 1000);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeLessThan(0);
  });

  it("moves approximately correct distance for 1 degree lat (~111km)", () => {
    const result = moveAlongHeading(0, 0, 0, 111_000);
    expect(result.lat).toBeCloseTo(1, 0);
  });

  it("returns same point for zero distance", () => {
    const result = moveAlongHeading(40.7, -74.0, 45, 0);
    expect(result.lat).toBeCloseTo(40.7, 5);
    expect(result.lng).toBeCloseTo(-74.0, 5);
  });
});

describe("computeDistanceBetween", () => {
  it("returns 0 for same point", () => {
    const p = { lat: 51.5, lng: -0.12 };
    expect(computeDistanceBetween(p, p)).toBe(0);
  });

  it("returns ~111km for 1 degree latitude at equator", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 0 };
    const dist = computeDistanceBetween(a, b);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = { lat: 40.7128, lng: -74.006 };
    const b = { lat: 34.0522, lng: -118.2437 };
    expect(computeDistanceBetween(a, b)).toBeCloseTo(computeDistanceBetween(b, a), 5);
  });

  it("computes reasonable distance NYC to LA (~3940km)", () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const dist = computeDistanceBetween(nyc, la);
    expect(dist).toBeGreaterThan(3_900_000);
    expect(dist).toBeLessThan(4_000_000);
  });
});

describe("computeHeading", () => {
  it("returns ~0 for due north", () => {
    const from = { lat: 0, lng: 0 };
    const to = { lat: 1, lng: 0 };
    expect(computeHeading(from, to)).toBeCloseTo(0, 0);
  });

  it("returns ~90 for due east", () => {
    const from = { lat: 0, lng: 0 };
    const to = { lat: 0, lng: 1 };
    expect(computeHeading(from, to)).toBeCloseTo(90, 0);
  });

  it("returns ~180 for due south", () => {
    const from = { lat: 1, lng: 0 };
    const to = { lat: 0, lng: 0 };
    expect(computeHeading(from, to)).toBeCloseTo(180, 0);
  });

  it("returns ~270 for due west", () => {
    const from = { lat: 0, lng: 1 };
    const to = { lat: 0, lng: 0 };
    expect(computeHeading(from, to)).toBeCloseTo(270, 0);
  });

  it("returns value in 0-360 range", () => {
    const from = { lat: 10, lng: 20 };
    const to = { lat: 30, lng: 40 };
    const heading = computeHeading(from, to);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThan(360);
  });
});

describe("streetViewImageUrl", () => {
  it("builds correct URL with all params", () => {
    const url = streetViewImageUrl(40.7, -74.0, 90, 10, 640, 480);
    expect(url).toBe("/api/maps/streetview?size=640x480&location=40.7,-74&heading=90&pitch=10&fov=90");
  });

  it("includes fov=90 always", () => {
    const url = streetViewImageUrl(0, 0, 0, 0, 100, 100);
    expect(url).toContain("&fov=90");
  });
});

describe("streetViewMetadataUrl", () => {
  it("builds correct URL", () => {
    const url = streetViewMetadataUrl(51.5, -0.12);
    expect(url).toBe("/api/maps/streetview/metadata?location=51.5,-0.12");
  });
});

describe("staticMapUrl", () => {
  it("includes base params (size, maptype, styles)", () => {
    const url = staticMapUrl({ width: 640, height: 480 });
    expect(url).toContain("/api/maps/static?size=640x480");
    expect(url).toContain("&maptype=roadmap");
    expect(url).toContain("%7C"); // pipe encoding
  });

  it("includes center and zoom when provided", () => {
    const url = staticMapUrl({ width: 640, height: 480, center: { lat: 40, lng: -74 }, zoom: 12 });
    expect(url).toContain("&center=40,-74&zoom=12");
  });

  it("omits center/zoom when not provided", () => {
    const url = staticMapUrl({ width: 640, height: 480 });
    expect(url).not.toContain("&center=");
    expect(url).not.toContain("&zoom=");
  });

  it("adds markers with color and label", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      markers: [{ lat: 40, lng: -74, label: "A", color: "green" }],
    });
    expect(url).toContain("&markers=color:green%7Clabel:A%7C40,-74");
  });

  it("defaults marker color to red and label to empty", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      markers: [{ lat: 10, lng: 20 }],
    });
    expect(url).toContain("&markers=color:red%7Clabel:%7C10,20");
  });

  it("adds player marker in yellow with label P", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      playerMarker: { lat: 5, lng: 6 },
    });
    expect(url).toContain("&markers=color:yellow%7Clabel:P%7C5,6");
  });

  it("adds encoded path with default color", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      encodedPath: "abc123",
    });
    expect(url).toContain("&path=color:0x4285F4ff%7Cweight:4%7Cenc:abc123");
  });

  it("adds encoded path with custom color", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      encodedPath: "xyz",
      pathColor: "0xFF0000ff",
    });
    expect(url).toContain("&path=color:0xFF0000ff%7Cweight:4%7Cenc:xyz");
  });

  it("adds coordinate path when no encoded path", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      path: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }],
    });
    expect(url).toContain("&path=color:0x4285F4ff%7Cweight:4%7C1,2%7C3,4");
  });

  it("prefers encodedPath over path", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      encodedPath: "encoded",
      path: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }],
    });
    expect(url).toContain("enc:encoded");
    expect(url).not.toContain("1,2%7C3,4");
  });

  it("does not add path when fewer than 2 points", () => {
    const url = staticMapUrl({
      width: 640, height: 480,
      path: [{ lat: 1, lng: 2 }],
    });
    expect(url).not.toContain("&path=");
  });
});
