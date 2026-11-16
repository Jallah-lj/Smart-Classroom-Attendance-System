/**
 * Haversine distance formula between two geographic coordinates in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface GeofenceResult {
  isWithin: boolean;
  distanceMeters: number;
  isInconclusive: boolean;
  verdict: 'WITHIN_BOUNDARY' | 'INCONCLUSIVE' | 'OUTSIDE_BOUNDARY';
}

export function evaluateGeofence(
  studentLat: number,
  studentLon: number,
  studentAccuracy: number,
  venueLat: number,
  venueLon: number,
  venueRadiusMeters: number,
  maxAllowedAccuracyMeters: number
): GeofenceResult {
  const distance = calculateDistanceMeters(studentLat, studentLon, venueLat, venueLon);

  // If the device accuracy is worse than the maximum acceptable threshold
  if (studentAccuracy > maxAllowedAccuracyMeters * 2) {
    return {
      isWithin: false,
      distanceMeters: Math.round(distance * 10) / 10,
      isInconclusive: true,
      verdict: 'INCONCLUSIVE'
    };
  }

  // Inside the surveyed radius
  if (distance <= venueRadiusMeters) {
    return {
      isWithin: true,
      distanceMeters: Math.round(distance * 10) / 10,
      isInconclusive: false,
      verdict: 'WITHIN_BOUNDARY'
    };
  }

  // Borderline within accuracy uncertainty window
  if (distance <= venueRadiusMeters + studentAccuracy) {
    return {
      isWithin: false,
      distanceMeters: Math.round(distance * 10) / 10,
      isInconclusive: true,
      verdict: 'INCONCLUSIVE'
    };
  }

  return {
    isWithin: false,
    distanceMeters: Math.round(distance * 10) / 10,
    isInconclusive: false,
    verdict: 'OUTSIDE_BOUNDARY'
  };
}
