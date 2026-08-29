export type PlayZone =
  | "deck"
  | "hand"
  | "shield"
  | "mana"
  | "battle"
  | "graveyard"
  | "hyperspatial"
  | "gr"
  | "reveal";

export type CardFace = "face_up" | "face_down" | "owner_only";

export type ShieldPlacementMarker = {
  turn: number;
  order: number;
};

export type MoveDefaults = {
  face: CardFace;
  shieldMarker: ShieldPlacementMarker | null;
};

export function moveDefaults(
  _from: PlayZone,
  to: PlayZone,
  context: { turn: number; shieldPlacementOrder: number },
): MoveDefaults {
  if (to === "deck") return { face: "face_down", shieldMarker: null };
  if (to === "shield") {
    return {
      face: "face_down",
      shieldMarker: {
        turn: context.turn,
        order: context.shieldPlacementOrder,
      },
    };
  }
  if (to === "hand") return { face: "owner_only", shieldMarker: null };
  return { face: "face_up", shieldMarker: null };
}

export type GestureKind = "drag" | "long_press" | "tap" | "none";

export function classifyPointerGesture(input: {
  durationMs: number;
  distancePx: number;
  cancelled?: boolean;
}): GestureKind {
  if (
    input.cancelled ||
    !Number.isFinite(input.durationMs) ||
    !Number.isFinite(input.distancePx) ||
    input.durationMs < 0 ||
    input.distancePx < 0
  ) return "none";
  if (input.distancePx > 8) return "drag";
  if (input.durationMs >= 500) return "long_press";
  if (input.durationMs <= 250) return "tap";
  return "none";
}

export type ManaCard = {
  id: string;
  civilizations: string[];
  tapped: boolean;
};

export type PlaySide = {
  label: string;
  cost: number;
  civilizations: string[];
  action: "summon" | "cast" | "play";
};

export type ManaPaymentResult = {
  valid: boolean;
  missingAmount: number;
  missingCivilizations: string[];
};

export function validateManaPayment(
  selectedMana: ManaCard[],
  side: PlaySide,
): ManaPaymentResult {
  const usableMana = selectedMana.filter((mana) => !mana.tapped);
  const availableCivilizations = new Set(
    usableMana.flatMap((mana) => mana.civilizations),
  );
  const requiredCivilizations = [...new Set(side.civilizations)];
  const missingCivilizations = requiredCivilizations.filter(
    (civilization) => !availableCivilizations.has(civilization),
  );
  const missingAmount = Math.max(0, side.cost - usableMana.length);
  return {
    valid: missingAmount === 0 && missingCivilizations.length === 0,
    missingAmount,
    missingCivilizations,
  };
}

export type DeckShortcut = {
  kind: "reveal_until_match";
  label: "ヨビニオン" | "メクレイド";
  maxCost: number;
  civilizations: string[];
  cardTypes: string[];
  destination: PlayZone;
  remainder: "bottom_random" | "bottom_chosen" | "shuffle";
};
