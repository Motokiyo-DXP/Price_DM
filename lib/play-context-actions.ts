import type { MarkingMenuAction, MarkingMenuItem, MarkingMenuSlot } from "./marking-menu.ts";
import type { PlayZone } from "./playfield-interactions.ts";

export type ContextualAction = MarkingMenuAction | "flip" | "mark" | "multi_select" | "target" | "shuffle" | "other" | "yobinion";
export type ActionContext = {
  face: "face_up" | "face_down" | "owner_only";
  isMultiple?: boolean;
  isMultiSelectMode?: boolean;
  isStack?: boolean;
  playerSide?: "self" | "opponent";
  selectedCount?: number;
  tapped: boolean;
  zone: PlayZone;
};

const labels: Record<ContextualAction, string> = { details:"カードの詳細",toggle_tap:"タップ切り替え",move:"移動",face_up:"表向き",face_down:"裏向き",close:"閉じる",flip:"反転",mark:"マーキング",multi_select:"複数選択",target:"対象指定",shuffle:"シャッフル",other:"その他",yobinion:"ヨビニオン",effect_warning:"効果無視の疑い",deselect:"選択解除",inspect:"確認",publish:"公開",open_stack:"束を開く",unbundle_stack:"束を解除",bundle:"束にする",shuffle_stack:"シャッフル",flip_stack:"反転",mark_general:"マーキング" };

function slots(actions: Array<[MarkingMenuSlot, ContextualAction, string?]>): MarkingMenuItem[] {
  return actions.map(([slot, action, label]) => ({ action: action as MarkingMenuAction, label: label ?? labels[action], slot }));
}

export function getContextualActions(context: ActionContext): MarkingMenuItem[] {
  const multi = context.isMultiSelectMode || context.isMultiple || (context.selectedCount ?? 0) > 1;
  if (context.zone === "deck") return slots([[2,"shuffle"],[3,"move","カード移動"],[4,"yobinion"],[6,"other"]]);
  if (multi) return slots([[1,"deselect"],[2,"shuffle"],[3,"move","一括移動"],[4,"bundle"],[5,"flip","一括反転"],[6,"other"]]);
  if (context.isStack) return slots([[1,"multi_select"],[2,"shuffle_stack"],[3,"move","束を移動"],[4,"open_stack"],[5,"flip_stack"],[6,"other"]]);
  if (context.zone === "battle") return slots([[1,"multi_select"],[2,"target"],[3,"move"],[4,"mark"],[5,"flip"],[6,"other"]]);
  if (context.zone === "shield") return slots([[1,"multi_select"],[2,"inspect"],[3,"move"],[4,"mark","シールド・フォース"],[5,"flip"],[6,"other"]]);
  if (context.zone === "hand") return slots([[1,"multi_select"],[2,"publish"],[3,"move"],[5,"flip"],[6,"other"]]);
  return slots([[1,"multi_select"],[3,"move"],[5,"flip"],[6,"other"]]);
}

export function getOtherContextualActions(firstLayer: readonly MarkingMenuItem[]): MarkingMenuItem[] {
  const firstLayerActions = new Set(firstLayer.map((item) => item.action));
  const candidates: Array<[MarkingMenuSlot, ContextualAction, MarkingMenuAction]> = [
    ...(firstLayerActions.has("open_stack") ? [[1, "unbundle_stack", "unbundle_stack"] as [MarkingMenuSlot, ContextualAction, MarkingMenuAction]] : []),
    [2, "details", "details"],
    [3, "toggle_tap", "toggle_tap"],
    [4, "effect_warning", "effect_warning"],
    [5, "yobinion", "yobinion"],
    [6, "mark_general", "mark"],
  ];
  return candidates
    .filter(([, , duplicateAction]) => !firstLayerActions.has(duplicateAction))
    .map(([slot, action]) => ({ action: action as MarkingMenuAction, label: labels[action], slot }));
}
