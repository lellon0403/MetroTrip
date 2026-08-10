type Coordinate = { latitude: number; longitude: number };

const EARTH_RADIUS_METERS = 6_371_000;

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMeters(from: Coordinate, to: Coordinate): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function nearestByCoordinate<T extends Coordinate>(
  origin: Coordinate,
  candidates: T[],
): { item: T; distanceMeters: number } | null {
  return candidates.reduce<{ item: T; distanceMeters: number } | null>((nearest, item) => {
    const distance = distanceMeters(origin, item);
    return !nearest || distance < nearest.distanceMeters
      ? { item, distanceMeters: distance }
      : nearest;
  }, null);
}
