export type GesturePoint = { x: number; y: number };

export function isCircleGesture(points: GesturePoint[], minimumTravel = 110) {
  if (points.length < 8) return false;
  const first = points[0];
  const last = points.at(-1)!;
  const travel = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const closed = Math.hypot(last.x - first.x, last.y - first.y) <= Math.max(32, Math.min(width, height) * .65);
  const aspect = Math.min(width, height) / Math.max(width, height, 1);
  return travel >= minimumTravel && width >= 28 && height >= 28 && aspect >= .45 && closed;
}
