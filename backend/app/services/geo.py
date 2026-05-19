"""Geo helpers — region auto-detection from lat/lng.

Keys MUST match Region.name_en (see seed_db.py)."""
from __future__ import annotations

import math

REGION_CENTROIDS: dict[str, tuple[float, float]] = {
    "Andijan": (40.78, 72.34),
    "Bukhara": (40.10, 64.30),
    "Fergana": (40.39, 71.79),
    "Jizzakh": (40.12, 67.84),
    "Xorazm": (41.55, 60.63),
    "Namangan": (40.99, 71.67),
    "Navoiy": (40.10, 65.38),
    "Qashqadaryo": (38.83, 65.78),
    "Samarkand": (39.65, 66.96),
    "Sirdaryo": (40.50, 68.80),
    "Surxondaryo": (37.22, 67.28),
    "Tashkent": (41.30, 69.24),
    "Tashkent City": (41.32, 69.25),
    "Republic of Karakalpakstan": (42.46, 59.62),
}


def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    R = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    x = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2)
    return 2 * R * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def nearest_region_id(regions, lat: float, lng: float) -> int | None:
    """`regions` is an iterable of Region rows with .id and .name_en."""
    if lat is None or lng is None:
        return None
    best_id = None
    best_d = float("inf")
    for r in regions:
        c = REGION_CENTROIDS.get(r.name_en)
        if not c:
            continue
        d = haversine_km(lat, lng, c[0], c[1])
        if d < best_d:
            best_d = d
            best_id = r.id
    return best_id
