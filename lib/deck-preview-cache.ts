export type PreviewCard = { zone: string; name: string; imageUrl: string | null };
export type DeckPreview = { name: string; cards: PreviewCard[] };

type DeckPreviewScope = "mine" | "public";

const globalPreviewCache = globalThis as typeof globalThis & {
  __deckPreviewCache?: Map<string, DeckPreview>;
};

const previewCache = globalPreviewCache.__deckPreviewCache ??= new Map<string, DeckPreview>();

function cacheKey(scope: DeckPreviewScope, deckId: string) {
  return `${scope}:${deckId}`;
}

export function getDeckPreview(scope: DeckPreviewScope, deckId: string) {
  return previewCache.get(cacheKey(scope, deckId));
}

export function hasDeckPreview(scope: DeckPreviewScope, deckId: string) {
  return previewCache.has(cacheKey(scope, deckId));
}

export function setDeckPreview(scope: DeckPreviewScope, deckId: string, preview: DeckPreview) {
  previewCache.set(cacheKey(scope, deckId), preview);
}

export function invalidateDeckPreviewCache(deckId: string) {
  previewCache.delete(cacheKey("mine", deckId));
  previewCache.delete(cacheKey("public", deckId));
}
