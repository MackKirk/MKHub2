"""
Geofence validation service.
Uses Haversine formula to calculate distance between points.
"""
import math
from typing import Optional, List, Dict, Tuple
from ..config import settings


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth.
    
    Args:
        lat1: Latitude of first point
        lon1: Longitude of first point
        lat2: Latitude of second point
        lon2: Longitude of second point
    
    Returns:
        Distance in meters
    """
    # Earth radius in meters
    R = 6371000
    
    # Convert to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    # Haversine formula
    a = (
        math.sin(delta_phi / 2) ** 2 +
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def inside_geofence(
    point_lat: float,
    point_lng: float,
    geofences: List[Dict],
    accuracy_m: Optional[float] = None
) -> Tuple[bool, Optional[Dict], Optional[bool]]:
    """
    Check if a point is inside any of the geofences.
    
    Args:
        point_lat: Point latitude
        point_lng: Point longitude
        geofences: List of geofence dicts with {lat, lng, radius_m}
        accuracy_m: GPS accuracy in meters (optional)
    
    Returns:
        Tuple of (is_inside, matching_geofence, is_risk)
        is_inside: True if point is inside any geofence
        matching_geofence: The geofence that matches (or None)
        is_risk: True if accuracy is poor (accuracy > GPS_ACCURACY_RISK_M)
    """
    if not geofences:
        return True, None, None  # No geofence means always allowed
    
    is_risk = accuracy_m is not None and accuracy_m > settings.gps_accuracy_risk_m
    
    for geofence in geofences:
        geofence_lat = float(geofence.get("lat", 0))
        geofence_lng = float(geofence.get("lng", 0))
        radius_m = float(geofence.get("radius_m", settings.geo_radius_m_default))
        
        distance = haversine_distance(point_lat, point_lng, geofence_lat, geofence_lng)
        
        if distance <= radius_m:
            return True, geofence, is_risk
    
    return False, None, is_risk

