export type MarkingMenuSlot = 1 | 2 | 3 | 4 | 5 | 6;

export type MarkingMenuAction =
  | "details"
  | "toggle_tap"
  | "move"
  | "face_up"
  | "face_down"
  | "close"
  | "flip"
  | "mark"
  | "multi_select"
  | "target"
  | "shuffle"
  | "other"
  | "yobinion"
  | "effect_warning"
  | "deselect"
  | "inspect"
  | "view_deck"
  | "publish"
  | "open_stack"
  | "unbundle_stack"
  | "bundle"
  | "shuffle_stack"
  | "flip_stack"
  | "mark_general";

export type MarkingMenuItem = {
  action: MarkingMenuAction;
  label: string;
  slot: MarkingMenuSlot;
};

// この配列を差し替えるだけで、表示数・順番・割り当てを調整できます。
// 1〜3が上段の左→右、4〜6が下段の左→右です。
export const DEFAULT_MARKING_MENU_ITEMS: MarkingMenuItem[] = [
  { slot: 1, action: "details", label: "詳細" },
  { slot: 2, action: "toggle_tap", label: "タップ" },
  { slot: 3, action: "move", label: "移動先" },
  { slot: 4, action: "face_up", label: "表向き" },
  { slot: 5, action: "face_down", label: "裏向き" },
  { slot: 6, action: "close", label: "閉じる" },
];

export type MarkingMenuPosition = MarkingMenuItem & {
  angle: number;
  x: number;
  y: number;
};

export type StackDestinationAction =
  | "face_down_top"
  | "face_up_top"
  | "spread"
  | "face_down_bottom"
  | "face_up_bottom";

export type StackDestinationItem = {
  action: StackDestinationAction;
  angle: number;
  asset: string;
  label: string;
};

export type StackDestinationPosition = StackDestinationItem & {
  x: number;
  y: number;
};

export const STACK_DESTINATION_ITEMS: StackDestinationItem[] = [
  { action: "face_down_top", angle: 315, asset: "/playtest/stack-menu/ueura.svg", label: "上・裏向き" },
  { action: "face_up_top", angle: 45, asset: "/playtest/stack-menu/ueomote.svg", label: "上・表向き" },
  { action: "spread", angle: 90, asset: "/playtest/stack-menu/yokozurashi.svg", label: "横・ずらして" },
  { action: "face_down_bottom", angle: 225, asset: "/playtest/stack-menu/shitaura.svg", label: "下・裏向き" },
  { action: "face_up_bottom", angle: 135, asset: "/playtest/stack-menu/shitaomote.svg", label: "下・表向き" },
];

export const MARKING_MENU_DEAD_ZONE_RADIUS = 42;
export const OTHER_BRANCH_HOLD_MS = 300;

export function isMarkingMenuGestureCancelled(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  deadZoneRadius = MARKING_MENU_DEAD_ZONE_RADIUS,
) {
  return Math.hypot(pointerX - originX, pointerY - originY) <= deadZoneRadius;
}

const slotOffsets: Record<MarkingMenuSlot, number> = {
  1: -35,
  2: 0,
  3: 35,
  4: -35,
  5: 0,
  6: 35,
};

export function markingMenuAxisTilt(anchorX: number, viewportWidth: number) {
  void anchorX;
  void viewportWidth;
  return 0;
}

export type MarkingMenuVisualBounds = {
  halfHeight: number;
  halfWidth: number;
  x: number;
  y: number;
};

function clampMenuAxis(anchor: number, viewportSize: number, minimumOffset: number, maximumOffset: number, edgeMargin: number) {
  const minimumCenter = edgeMargin - minimumOffset;
  const maximumCenter = viewportSize - edgeMargin - maximumOffset;
  if (minimumCenter > maximumCenter) return (viewportSize - minimumOffset - maximumOffset) / 2;
  return Math.min(Math.max(anchor, minimumCenter), maximumCenter);
}

export function calculateMarkingMenuCenter(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  visualBounds: readonly MarkingMenuVisualBounds[] = [],
  edgeMargin = 8,
) {
  if (visualBounds.length > 0) {
    const minimumX = Math.min(...visualBounds.map((item) => item.x - item.halfWidth));
    const maximumX = Math.max(...visualBounds.map((item) => item.x + item.halfWidth));
    const minimumY = Math.min(...visualBounds.map((item) => item.y - item.halfHeight));
    const maximumY = Math.max(...visualBounds.map((item) => item.y + item.halfHeight));
    return {
      x: clampMenuAxis(x, viewportWidth, minimumX, maximumX, edgeMargin),
      y: clampMenuAxis(y, viewportHeight, minimumY, maximumY, edgeMargin),
    };
  }
  const horizontalMargin = viewportWidth * 0.15;
  const verticalMargin = viewportHeight * 0.15;
  return {
    x: Math.min(Math.max(x, horizontalMargin), viewportWidth - horizontalMargin),
    y: Math.min(Math.max(y, verticalMargin), viewportHeight - verticalMargin),
  };
}

export function calculateMarkingMenuVisualBounds(positions: MarkingMenuPosition[], viewportWidth: number) {
  const mobile = viewportWidth <= 700;
  const fontSize = mobile ? 12 : 13;
  const minimumWidth = mobile ? 84 : 94;
  return positions.map((item) => {
    const labelWidth = Array.from(item.label).reduce((width, character) => (
      width + (character.codePointAt(0)! > 0xff ? fontSize : fontSize * 0.62)
    ), 0);
    const width = Math.max(minimumWidth, 16 + 18 + 5 + labelWidth + 6) * 1.1;
    return { x: item.x, y: item.y, halfWidth: width / 2, halfHeight: 21 };
  });
}

export function calculateMarkingMenuBranchBounds(viewportWidth: number, viewportHeight: number): MarkingMenuVisualBounds[] {
  return [{
    x: 0,
    y: 0,
    halfWidth: Math.min(280, viewportWidth * 0.82) / 2,
    halfHeight: Math.min(330, viewportHeight * 0.7) / 2,
  }];
}

export function calculateMarkingMenuPositions(
  items: MarkingMenuItem[],
  anchorX: number,
  viewportWidth: number,
  radius = 92,
): MarkingMenuPosition[] {
  const axisTilt = markingMenuAxisTilt(anchorX, viewportWidth);
  return items.slice(0, 6).map((item) => {
    const isTop = item.slot <= 3;
    const isCenter = item.slot === 2 || item.slot === 5;
    const itemRadius = isCenter ? radius * 1.28 : radius;
    const angle = isTop
      ? axisTilt + slotOffsets[item.slot]
      : 180 - axisTilt - slotOffsets[item.slot];
    const radians = angle * Math.PI / 180;
    return {
      ...item,
      angle,
      x: Math.sin(radians) * itemRadius,
      y: -Math.cos(radians) * itemRadius,
    };
  });
}

function circularAngleDistance(first: number, second: number) {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}

export function selectMarkingMenuItem(
  positions: MarkingMenuPosition[],
  deltaX: number,
  deltaY: number,
  deadZoneRadius = MARKING_MENU_DEAD_ZONE_RADIUS,
  optionRadius = 92,
) {
  const distance = Math.hypot(deltaX, deltaY);
  const outerCancelRadius = 2.5 * (deadZoneRadius + 3 * (optionRadius - deadZoneRadius));
  if (distance <= deadZoneRadius || distance > outerCancelRadius) return null;
  const pointerAngle = (Math.atan2(deltaX, -deltaY) * 180 / Math.PI + 360) % 360;
  return positions.reduce<MarkingMenuPosition | null>((selected, item) => {
    if (!selected) return item;
    return circularAngleDistance(pointerAngle, item.angle) < circularAngleDistance(pointerAngle, selected.angle)
      ? item
      : selected;
  }, null);
}

export function calculateStackDestinationPositions(radius = 100): StackDestinationPosition[] {
  return STACK_DESTINATION_ITEMS.map((item) => {
    const radians = item.angle * Math.PI / 180;
    return { ...item, x: Math.sin(radians) * radius, y: -Math.cos(radians) * radius };
  });
}

export function calculateStackDestinationVisualBounds(positions: StackDestinationPosition[], viewportWidth: number) {
  const mobile = viewportWidth <= 700;
  return positions.map((item) => {
    const width = item.action === "spread" ? (mobile ? 144 : 180) : (mobile ? 106 : 130);
    const height = mobile ? 36 : 44;
    return { x: item.x, y: item.y, halfWidth: width * 0.55, halfHeight: height * 0.55 };
  });
}

export function selectStackDestinationItem(
  positions: StackDestinationPosition[],
  deltaX: number,
  deltaY: number,
  deadZoneRadius = MARKING_MENU_DEAD_ZONE_RADIUS,
  optionRadius = 100,
) {
  const distance = Math.hypot(deltaX, deltaY);
  const outerCancelRadius = 2.5 * (deadZoneRadius + 3 * (optionRadius - deadZoneRadius));
  if (distance <= deadZoneRadius || distance > outerCancelRadius) return null;
  const pointerAngle = (Math.atan2(deltaX, -deltaY) * 180 / Math.PI + 360) % 360;
  return positions.reduce<StackDestinationPosition | null>((selected, item) => {
    if (!selected) return item;
    return circularAngleDistance(pointerAngle, item.angle) < circularAngleDistance(pointerAngle, selected.angle)
      ? item
      : selected;
  }, null);
}

