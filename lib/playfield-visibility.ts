import type { PlayerId } from "@/lib/playfield-board";
import type { CardFace, PlayZone } from "@/lib/playfield-interactions";

export function isCardFaceVisible({
  face,
  inspected = false,
  inspectionViewer,
  owner,
  revealHiddenCards = false,
  deckDrawer = false,
  view,
  zone,
}: {
  face: CardFace;
  inspected?: boolean;
  inspectionViewer?: PlayerId;
  owner: PlayerId;
  revealHiddenCards?: boolean;
  deckDrawer?: boolean;
  view: PlayerId;
  zone: PlayZone;
}) {
  if (zone === "deck") return deckDrawer && owner === view;
  if (revealHiddenCards) return true;
  return face === "face_up"
    || (face === "owner_only" && owner === view)
    || (inspected && inspectionViewer === view);
}
