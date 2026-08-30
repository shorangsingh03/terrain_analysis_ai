import numpy as np


def analyze_dem_hazards_from_matrix(
    elevation_matrix: np.ndarray, cell_size_m: float = 2.0
):
    dy, dx = np.gradient(elevation_matrix, cell_size_m)
    slope_deg = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))

    max_slope = float(np.max(slope_deg))

    # Landslide Risk: steep mountain slopes (> 25 degrees)
    landslide_mask = slope_deg > 25
    landslide_pct = float(
        (np.sum(landslide_mask) / elevation_matrix.size) * 100.0
    )

    # Flood Prone Area: low elevation valleys (bottom 30%) with flat ground (slope < 10 degrees)
    elev_min = elevation_matrix.min()
    elev_range = elevation_matrix.max() - elev_min + 1e-6
    rel_elev = (elevation_matrix - elev_min) / elev_range

    flood_mask = (rel_elev < 0.30) & (slope_deg < 10)
    flood_pct = float((np.sum(flood_mask) / elevation_matrix.size) * 100.0)

    return {
        "max_slope_deg": round(max_slope, 1),
        "landslide_risk_area_pct": round(landslide_pct, 1),
        "flood_prone_area_pct": round(flood_pct, 1),
    }