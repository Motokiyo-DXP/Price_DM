const visiblePaths = new Set(["/deck-search", "/decks", "/", "/solo", "/rooms"]);

export function getVisiblePrimaryNavigationPath(pathname: string | null, mounted: boolean) {
  if (!mounted || pathname === null || !visiblePaths.has(pathname)) return null;
  return pathname;
}
