const visiblePaths = new Set(["/card-search", "/deck-search", "/decks", "/", "/solo", "/rooms"]);

export function getVisiblePrimaryNavigationPath(pathname: string | null, mounted: boolean) {
  if (!mounted || pathname === null || !visiblePaths.has(pathname)) return null;
  return pathname === "/deck-search" ? "/decks" : pathname;
}
