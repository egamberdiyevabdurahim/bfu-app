// Approximate centers of the 14 Uzbek regions. Used to auto-pick the
// user's region from their GPS coordinates during registration / edit.
// Keys MUST match Region.name_en in the database (see backend/seed_db.py).
export const REGION_CENTROIDS = {
  "Andijan": [40.78, 72.34],
  "Bukhara": [40.10, 64.30],
  "Fergana": [40.39, 71.79],
  "Jizzakh": [40.12, 67.84],
  "Xorazm": [41.55, 60.63],
  "Namangan": [40.99, 71.67],
  "Navoiy": [40.10, 65.38],
  "Qashqadaryo": [38.83, 65.78],
  "Samarkand": [39.65, 66.96],
  "Sirdaryo": [40.50, 68.80],
  "Surxondaryo": [37.22, 67.28],
  "Tashkent": [41.30, 69.24],
  "Tashkent City": [41.32, 69.25],
  "Republic of Karakalpakstan": [42.46, 59.62],
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Given the regions list from the API and a (lat, lng), return the
// nearest region.id (or null if no match).
export function nearestRegionId(regions, lat, lng) {
  if (lat == null || lng == null || !Array.isArray(regions)) return null;
  let best = null;
  let bestD = Infinity;
  for (const r of regions) {
    const c = REGION_CENTROIDS[r.name_en];
    if (!c) continue;
    const d = haversineKm(lat, lng, c[0], c[1]);
    if (d < bestD) { bestD = d; best = r.id; }
  }
  return best;
}
