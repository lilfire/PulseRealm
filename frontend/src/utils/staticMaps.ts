/**
 * Pure-math geo utilities and URL builders for Google Maps Static APIs.
 * Used as a fallback when the Google Maps JavaScript API fails to load
 * (e.g. Chrome 74 doesn't support ES2020+ syntax).
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Offset a lat/lng point by distance (meters) along a heading (degrees). */
export function moveAlongHeading(
  lat: number,
  lng: number,
  headingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  const d = distanceM / EARTH_RADIUS_M;
  const h = toRad(headingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(h),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(h) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/** Haversine distance between two points in meters. */
export function computeDistanceBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const x =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x));
}

/** Initial bearing from `from` to `to` in degrees (0–360). */
export function computeHeading(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360;
}

/** Build a Street View Static API image URL. */
export function streetViewImageUrl(
  lat: number,
  lng: number,
  heading: number,
  pitch: number,
  width: number,
  height: number,
  apiKey: string,
): string {
  return (
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=${width}x${height}` +
    `&location=${lat},${lng}` +
    `&heading=${heading}` +
    `&pitch=${pitch}` +
    `&fov=90` +
    `&key=${apiKey}`
  );
}

/** Build a Street View Metadata API URL (returns JSON with status + pano location). */
export function streetViewMetadataUrl(
  lat: number,
  lng: number,
  apiKey: string,
): string {
  return (
    `https://maps.googleapis.com/maps/api/streetview/metadata` +
    `?location=${lat},${lng}` +
    `&key=${apiKey}`
  );
}

/** Build a Static Maps API URL with optional markers and path.
 *  When center/zoom are omitted the API auto-fits to markers & path. */
export function staticMapUrl(options: {
  center?: { lat: number; lng: number };
  zoom?: number;
  width: number;
  height: number;
  apiKey: string;
  markers?: Array<{ lat: number; lng: number; label?: string; color?: string }>;
  path?: Array<{ lat: number; lng: number }>;
  pathColor?: string;
  playerMarker?: { lat: number; lng: number };
}): string {
  const { center, zoom, width, height, apiKey, markers, path, pathColor, playerMarker } = options;
  let url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=${width}x${height}` +
    `&maptype=roadmap` +
    `&style=element:geometry|color:0x242f3e` +
    `&style=element:labels.text.fill|color:0x746855` +
    `&style=feature:road|element:geometry|color:0x38414e` +
    `&style=feature:water|element:geometry|color:0x17263c` +
    `&key=${apiKey}`;

  if (center != null && zoom != null) {
    url += `&center=${center.lat},${center.lng}&zoom=${zoom}`;
  }

  if (markers) {
    for (const m of markers) {
      const color = m.color || "red";
      const label = m.label || "";
      url += `&markers=color:${color}|label:${label}|${m.lat},${m.lng}`;
    }
  }

  if (playerMarker) {
    url += `&markers=color:yellow|label:P|${playerMarker.lat},${playerMarker.lng}`;
  }

  if (path && path.length >= 2) {
    const color = pathColor || "0x4285F4ff";
    const coords = path.map((p) => `${p.lat},${p.lng}`).join("|");
    url += `&path=color:${color}|weight:4|${coords}`;
  }

  return url;
}
