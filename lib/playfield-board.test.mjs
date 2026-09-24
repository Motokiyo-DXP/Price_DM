import assert from "node:assert/strict";
import test from "node:test";

import { advanceTurn, bundleSelectedCards, changeSlayerCount, clearCardMarkers, closeMaxDeckInspection, countZoneCards, detachCardFromStack, drawRandomCard, findAttachedSpreadStackId, flipStackCards, initialBoard, inspectDeckCards, isMulticolorCard, moveCardsBetweenZones, toggleLegacyCardTapState, toggleRevealPublic, resetBoard, resolveCardCivilizations, resolveDraggedCardIds, runYobinion, setCardMarker, shuffleSelectedCards, stackOnHorizontalRoot, shuffleStackCards, unbundleStack, untapAllCards, untapZoneCards } from "./playfield-board.ts";

test("横束A-BのAにCを縦に重ねるとBは横接続のまま残る", () => {
  const a = { instanceId: "a", stackId: "stack-a", stackLayout: "spread", stackOrder: 0 };
  const b = { instanceId: "b", stackId: "stack-a", stackLayout: "spread", stackOrder: 1 };
  const c = { instanceId: "c", stackId: null };
  for (const placement of ["top", "bottom"]) {
    const result = stackOnHorizontalRoot([a, b, c], a, new Set(["c"]), "face_up", placement);
    assert.equal(result.find((card) => card.instanceId === "a")?.stackId, "vertical-stack-a");
    assert.equal(result.find((card) => card.instanceId === "c")?.stackId, "vertical-stack-a");
    assert.equal(result.find((card) => card.instanceId === "b")?.stackId, "stack-a");
    assert.equal(result.find((card) => card.instanceId === "b")?.attachedToStackId, "vertical-stack-a");
  }
});

test("横束から縦束を作ると最上部以外のマーカーを解除する", () => {
  const a = { instanceId: "a", stackId: "horizontal", stackLayout: "spread", stackOrder: 0, markers: ["cannot_attack"] };
  const b = { instanceId: "b", stackId: "horizontal", stackLayout: "spread", stackOrder: 1, markers: ["blocker"] };
  const c = { instanceId: "c", stackId: null, markers: ["summoning_sickness"] };
  for (const placement of ["top", "bottom"]) {
    const result = stackOnHorizontalRoot([a, b, c], a, new Set(["c"]), "face_up", placement);
    const topId = placement === "top" ? "c" : "a";
    assert.deepEqual(result.find((card) => card.instanceId === topId)?.markers, topId === "c" ? c.markers : a.markers);
    assert.deepEqual(result.find((card) => card.instanceId === (topId === "c" ? "a" : "c"))?.markers, []);
    assert.deepEqual(result.find((card) => card.instanceId === "b")?.markers, b.markers);
  }
});

const cards = Array.from({ length: 40 }, (_, index) => ({ canonicalCardId: index + 1, imageUrl: null, name: `カード${index + 1}`, quantity: 1, sortOrder: index }));

test("Legacy TAP の両policyは false→true で同じ結果となり metadata と周辺参照を保持する", () => {
  const board = initialBoard(cards, () => 0.5);
  const target = { ...board.players.p1.hand[0], face: "face_up", tapped: false, markers: ["keep_tapped", "blocker"], stackId: "stack-1", stackOrder: 2, stackLayout: "diagonal", stackPlacement: "top", attachedToStackId: "stack-2" };
  const other = board.players.p1.hand[1];
  board.players.p1.mana = [target, other];
  const before = structuredClone(board);
  const normal = toggleLegacyCardTapState(board, "p1", "mana", target.instanceId, { clearKeepTappedOnUntap: true });
  const menu = toggleLegacyCardTapState(board, "p1", "mana", target.instanceId, { clearKeepTappedOnUntap: false });
  assert.deepEqual(normal, menu);
  assert.deepEqual(normal.players.p1.mana[0], { ...target, tapped: true });
  assert.strictEqual(normal.players.p1.mana[0].markers, target.markers);
  assert.strictEqual(normal.players.p1.mana[1], other);
  assert.strictEqual(normal.players.p1.hand, board.players.p1.hand);
  assert.strictEqual(normal.players.p1.battle, board.players.p1.battle);
  assert.strictEqual(normal.players.p2, board.players.p2);
  assert.deepEqual(board, before);
});

test("Legacy UNTAP の通常policyだけ keep_tapped を除去し、他markerを保持する", () => {
  const board = initialBoard(cards, () => 0.5);
  const target = { ...board.players.p1.hand[0], tapped: true, markers: ["blocker", "keep_tapped", "power_up"] };
  board.players.p1.mana = [target];
  const before = structuredClone(board);
  const normal = toggleLegacyCardTapState(board, "p1", "mana", target.instanceId, { clearKeepTappedOnUntap: true });
  const menu = toggleLegacyCardTapState(board, "p1", "mana", target.instanceId, { clearKeepTappedOnUntap: false });
  assert.deepEqual(normal.players.p1.mana[0], { ...target, tapped: false, markers: ["blocker", "power_up"] });
  assert.deepEqual(menu.players.p1.mana[0], { ...target, tapped: false });
  assert.strictEqual(menu.players.p1.mana[0].markers, target.markers);
  assert.deepEqual(board, before);
});

test("Legacy TAP は対象不在なら元の BoardState を返す", () => {
  const board = initialBoard(cards, () => 0.5);
  assert.strictEqual(toggleLegacyCardTapState(board, "p1", "mana", "missing", { clearKeepTappedOnUntap: true }), board);
});

test("縦束のどのカードを対象にしても接続済みの横束を選ぶ", () => {
  const zone = [
    { instanceId: "a", stackId: "vertical", stackLayout: "diagonal" },
    { instanceId: "b", stackId: "vertical", stackLayout: "diagonal" },
    { instanceId: "c", stackId: "horizontal", stackLayout: "spread", attachedToStackId: "vertical" },
  ];
  for (const target of zone.slice(0, 2)) {
    assert.equal(findAttachedSpreadStackId(zone, target.stackId), "horizontal");
  }
});

test("初期状態は手札5枚・シールド5枚・山札30枚で表向きカードがない", () => {
  const board = initialBoard(cards, () => 0.5);
  for (const player of Object.values(board.players)) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.shield.length, 5);
    assert.equal(player.deck.length, 30);
    assert.equal(Object.values(player).flat().some((card) => card.face === "face_up"), false);
  }
});

test("山札閲覧は実zoneへ移り、上・下・MAXで枚数と順序を保ちカードを重複させない", () => {
  const board = initialBoard(cards, () => 0.5);
  const allIds = Object.values(board.players.p1).flat().map((card) => card.instanceId).sort();
  const deckOrder = board.players.p1.deck.map((card) => card.instanceId);
  const top = inspectDeckCards(board, "p1", 3, "top");
  assert.equal(top.players.p1.deck.length, 27);
  assert.deepEqual(top.players.p1.deckInspection.map((card) => card.instanceId), deckOrder.slice(0, 3));
  assert.equal(new Set(Object.values(top.players.p1).flat().map((card) => card.instanceId)).size, 40);
  assert.deepEqual(Object.values(top.players.p1).flat().map((card) => card.instanceId).sort(), allIds);
  const bottom = inspectDeckCards(board, "p1", 3, "bottom");
  assert.equal(bottom.players.p1.deck.length, 27);
  assert.deepEqual(bottom.players.p1.deckInspection.map((card) => card.instanceId), deckOrder.slice(-3));
  const max = inspectDeckCards(board, "p1", "max", "top");
  assert.equal(max.players.p1.deck.length, 0);
  assert.equal(max.players.p1.deckInspection.length, 30);
  assert.equal(new Set(Object.values(max.players.p1).flat().map((card) => card.instanceId)).size, 40);
});

test("inspectionから山札上・下と他zoneへ移すとinspectionから消える", () => {
  const board = inspectDeckCards(initialBoard(cards, () => 0.5), "p1", 3, "top");
  const [topId, bottomId, handId] = board.players.p1.deckInspection.map((card) => card.instanceId);
  const afterTop = moveCardsBetweenZones(board, "p1", "deckInspection", "deck", new Set([topId]), "top");
  const afterBottom = moveCardsBetweenZones(afterTop, "p1", "deckInspection", "deck", new Set([bottomId]), "bottom");
  const afterHand = moveCardsBetweenZones(afterBottom, "p1", "deckInspection", "hand", new Set([handId]));
  assert.equal(afterTop.players.p1.deck.length, 28);
  assert.equal(afterBottom.players.p1.deck.length, 29);
  assert.equal(afterHand.players.p1.deckInspection.length, 0);
  assert.equal(afterHand.players.p1.hand.some((card) => card.instanceId === handId), true);
  assert.equal(new Set(Object.values(afterHand.players.p1).flat().map((card) => card.instanceId)).size, 40);
});

test("MAX終了時は上A・shuffle(R)・下Bの順で戻してinspectionを空にする", () => {
  const inspected = inspectDeckCards(initialBoard(cards, () => 0.5), "p1", "max", "top");
  const ids = inspected.players.p1.deckInspection.map((card) => card.instanceId);
  const a = ids[0];
  const b = ids.at(-1);
  const afterA = moveCardsBetweenZones(inspected, "p1", "deckInspection", "deck", new Set([a]), "top");
  const afterB = moveCardsBetweenZones(afterA, "p1", "deckInspection", "deck", new Set([b]), "bottom");
  const closed = closeMaxDeckInspection(afterB, "p1", [a], [b], () => 0.5);
  const deckIds = closed.players.p1.deck.map((card) => card.instanceId);
  assert.equal(deckIds[0], a);
  assert.equal(deckIds.at(-1), b);
  assert.deepEqual(new Set(deckIds.slice(1, -1)), new Set(ids.slice(1, -1)));
  assert.equal(closed.players.p1.deckInspection.length, 0);
  assert.equal(new Set(Object.values(closed.players.p1).flat().map((card) => card.instanceId)).size, 40);
});

test("ターン番号は先攻と後攻が同じ番号を共有し、後攻終了後にだけ進む", () => {
  const firstTurn = initialBoard(cards, () => 0.5);
  assert.deepEqual([firstTurn.activePlayer, firstTurn.turn], ["p1", 1]);

  const secondPlayerTurn = advanceTurn(firstTurn);
  assert.deepEqual([secondPlayerTurn.activePlayer, secondPlayerTurn.turn], ["p2", 1]);

  const secondTurn = advanceTurn(secondPlayerTurn);
  assert.deepEqual([secondTurn.activePlayer, secondTurn.turn], ["p1", 2]);

  const secondPlayerSecondTurn = advanceTurn(secondTurn);
  assert.deepEqual([secondPlayerSecondTurn.activePlayer, secondPlayerSecondTurn.turn], ["p2", 2]);
});

test("同じカードを別登録行で採用しても初期手札を含む全カードのIDは重複しない", () => {
  const repeatedPrints = Array.from({ length: 20 }, (_, index) => ({
    canonicalCardId: 7,
    imageUrl: `/print-${index}.jpg`,
    name: "同名カード",
    quantity: 2,
    sortOrder: index,
  }));
  const board = initialBoard(repeatedPrints, () => 0.5);
  for (const player of Object.values(board.players)) {
    const instanceIds = Object.values(player).flat().map((card) => card.instanceId);
    assert.equal(new Set(instanceIds).size, 40);
    assert.equal(new Set(player.hand.map((card) => card.instanceId)).size, 5);
  }
});

test("ドローは確定済みの山札順序の先頭から1枚を手札へ移す", () => {
  const board = initialBoard(cards, () => 0.5);
  const expected = board.players.p1.deck[0]?.instanceId;
  const next = drawRandomCard(board, "p1", () => 0.999999);
  assert.equal(next.players.p1.deck.length, 29);
  assert.equal(next.players.p1.hand.length, 6);
  assert.equal(next.players.p1.hand.at(-1)?.instanceId, expected);
  assert.equal(next.players.p1.hand.at(-1)?.face, "owner_only");
});

test("ドローのたびに山札を再ランダム化しない", () => {
  const board = initialBoard(cards, () => 0.5);
  const expected = board.players.p1.deck.slice(0, 2).map((card) => card.instanceId);
  const first = drawRandomCard(board, "p1", () => 0.999999);
  const second = drawRandomCard(first, "p1", () => 0);
  assert.deepEqual(second.players.p1.hand.slice(-2).map((card) => card.instanceId), expected);
});

test("手札から各ゾーンへの移動はコピーせず元の手札から必ず1枚減る", () => {
  const destinations = ["battle", "mana", "shield", "graveyard", "hyperspatial", "gr", "abyss", "reveal", "deck"];
  for (const destination of destinations) {
    const board = initialBoard(cards, () => 0.5);
    const movingId = board.players.p1.hand[0].instanceId;
    const handBefore = board.players.p1.hand.length;
    const destinationBefore = board.players.p1[destination].length;
    const next = moveCardsBetweenZones(board, "p1", "hand", destination, new Set([movingId]));
    assert.equal(next.players.p1.hand.length, handBefore - 1, `${destination}: 手札から減る`);
    assert.equal(next.players.p1[destination].length, destinationBefore + 1, `${destination}: 移動先に増える`);
    assert.equal(Object.values(next.players.p1).flat().filter((card) => card.instanceId === movingId).length, 1, `${destination}: カードは盤面全体で1枚だけ`);
  }
});

test("ゾーン移動で既存マーカーがすべて外れ、召喚酔いだけ新たに付く", () => {
  const board = initialBoard(cards, () => 0.5);
  const card = board.players.p1.shield[0];
  const marked = setCardMarker(setCardMarker(board, "p1", "shield", card.instanceId, "shield_force", true), "p1", "shield", card.instanceId, "cannot_attack", true);
  const moved = moveCardsBetweenZones(marked, "p1", "shield", "battle", new Set([card.instanceId]), "bottom", true);
  assert.deepEqual(moved.players.p1.battle[0].markers, ["summoning_sickness"]);
  assert.deepEqual(marked.players.p1.shield[0].markers, ["shield_force", "cannot_attack"]);
  const returned = moveCardsBetweenZones(moved, "p1", "battle", "shield", new Set([card.instanceId]));
  assert.deepEqual(returned.players.p1.shield.at(-1).markers, []);
});

test("全アンタップとリセットが盤面を初期状態へ戻す", () => {
  const board = initialBoard(cards, () => 0.5);
  board.players.p1.mana.push({ ...board.players.p1.hand.pop(), tapped: true, face: "face_up", markers: ["cannot_attack"] });
  assert.equal(untapAllCards(board, "p1").players.p1.mana[0].tapped, false);
  const reset = resetBoard(board, () => 0.5);
  assert.equal(reset.players.p1.hand.length, 5);
  assert.equal(reset.players.p1.shield.length, 5);
  assert.equal(reset.players.p1.deck.length, 30);
  assert.equal(reset.players.p1.battle.length, 0);
  assert.equal(reset.players.p1.mana.length, 0);
  assert.equal(Object.values(reset.players).flatMap((player) => Object.values(player).flat()).some((card) => card.markers?.length), false);
});

test("マーキングは明示的に追加・解除できる", () => {
  const board = initialBoard(cards, () => 0.5);
  const card = board.players.p1.hand[0];
  const marked = setCardMarker(board, "p1", "hand", card.instanceId, "cannot_attack", true);
  assert.deepEqual(marked.players.p1.hand[0].markers, ["cannot_attack"]);
  const unmarked = setCardMarker(marked, "p1", "hand", card.instanceId, "cannot_attack", false);
  assert.deepEqual(unmarked.players.p1.hand[0].markers, []);
});

test("マーカー一括解除は対象カードの全種類と重複分だけを消す", () => {
  const board = initialBoard(cards, () => 0.5);
  const target = board.players.p1.hand[0];
  const other = board.players.p1.hand[1];
  const marked = setCardMarker(setCardMarker(changeSlayerCount(changeSlayerCount(board, "p1", "hand", target.instanceId, 1), "p1", "hand", target.instanceId, 1), "p1", "hand", target.instanceId, "shield_force", true), "p1", "hand", other.instanceId, "power_down", true);
  const cleared = clearCardMarkers(marked, "p1", "hand", target.instanceId);
  assert.deepEqual(cleared.players.p1.hand[0].markers, []);
  assert.deepEqual(cleared.players.p1.hand[1].markers, ["power_down"]);
  assert.equal(clearCardMarkers(cleared, "p1", "hand", target.instanceId), cleared);
});

test("スレイヤーは個数を増減し、0未満にはならない", () => {
  const board = initialBoard(cards, () => 0.5);
  const card = board.players.p1.hand[0];
  const first = changeSlayerCount(board, "p1", "hand", card.instanceId, 1);
  const second = changeSlayerCount(first, "p1", "hand", card.instanceId, 1);
  assert.deepEqual(second.players.p1.hand[0].markers, ["slayer", "slayer"]);
  const removed = changeSlayerCount(second, "p1", "hand", card.instanceId, -1);
  assert.deepEqual(removed.players.p1.hand[0].markers, ["slayer"]);
  assert.deepEqual(changeSlayerCount(changeSlayerCount(removed, "p1", "hand", card.instanceId, -1), "p1", "hand", card.instanceId, -1).players.p1.hand[0].markers, []);
});

test("アンタップしないマーカーと選択カードの束を維持する", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  board.players.p1.battle = two.map((card, index) => ({ ...card, face: "face_up", tapped: true, markers: index === 0 ? ["keep_tapped"] : [] }));
  board.players.p1.hand = board.players.p1.hand.slice(2);
  const untapped = untapAllCards(board, "p1");
  assert.equal(untapped.players.p1.battle[0].tapped, true);
  assert.equal(untapped.players.p1.battle[1].tapped, false);
  const shuffled = shuffleSelectedCards(untapped, new Set(two.map((card) => card.instanceId)), () => 0);
  assert.ok(shuffled.players.p1.battle.every((card) => card.face === "face_down" && card.stackId));
});

test("束の1枚からドラッグ対象を解決すると同じ束の全カードを返す", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const stacked = shuffleSelectedCards(board, new Set(two.map((card) => card.instanceId)), () => 0);
  const ids = resolveDraggedCardIds(stacked.players.p1.hand, two[0].instanceId);
  assert.deepEqual([...ids].sort(), two.map((card) => card.instanceId).sort());
});

test("束全体を別ゾーンへ移動しても束情報を維持する", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const stacked = shuffleSelectedCards(board, new Set(two.map((card) => card.instanceId)), () => 0);
  const ids = resolveDraggedCardIds(stacked.players.p1.hand, two[0].instanceId);
  const moved = moveCardsBetweenZones(stacked, "p1", "hand", "mana", ids);
  const destination = moved.players.p1.mana.filter((card) => ids.has(card.instanceId));
  assert.equal(destination.length, 2);
  assert.equal(new Set(destination.map((card) => card.stackId)).size, 1);
  assert.ok(destination.every((card) => card.stackId && card.stackOrder !== null));
});

test("束を手札へ移すと各カードが表向きの単体になる", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  board.players.p1.hand = board.players.p1.hand.slice(2);
  board.players.p1.battle = two.map((card, index) => ({ ...card, face: "face_down", stackId: "battle-stack", stackOrder: index, stackLayout: "diagonal", stackPlacement: "top" }));
  const moved = moveCardsBetweenZones(board, "p1", "battle", "hand", new Set(two.map((card) => card.instanceId)));
  const returned = moved.players.p1.hand.filter((card) => two.some((item) => item.instanceId === card.instanceId));
  assert.equal(returned.length, 2);
  assert.ok(returned.every((card) => card.face === "face_up" && card.stackId === null && card.stackOrder === null && card.stackLayout === null && card.stackPlacement === null && card.attachedToStackId === null));
  assert.equal(countZoneCards(moved.players.p1.hand), moved.players.p1.hand.length);
});

test("閲覧中の山札カードを手札へ移すとinstanceIdを維持して1枚だけ移動し、総数は変わらない", () => {
  const board = initialBoard(cards, () => 0.5);
  const moving = board.players.p1.deck[0];
  const totalBefore = Object.values(board.players.p1).reduce((total, zone) => total + zone.length, 0);
  const moved = moveCardsBetweenZones(board, "p1", "deck", "hand", new Set([moving.instanceId]), "bottom", true);
  const totalAfter = Object.values(moved.players.p1).reduce((total, zone) => total + zone.length, 0);
  assert.equal(moved.players.p1.deck.some((card) => card.instanceId === moving.instanceId), false);
  assert.equal(moved.players.p1.hand.filter((card) => card.instanceId === moving.instanceId).length, 1);
  assert.equal(totalAfter, totalBefore);
});

test("束を山札上へ戻すと表示順で表向きの単体になり、その順に引ける", () => {
  const board = initialBoard(cards, () => 0.5);
  const [a, b, c, x, y] = board.players.p1.hand.slice(0, 5);
  board.players.p1.hand = [];
  board.players.p1.deck = [x, y];
  board.players.p1.deckInspection = [
    { ...a, face: "face_down", stackId: "shuffled", stackOrder: 2, stackLayout: "diagonal", stackPlacement: "top" },
    { ...b, face: "face_down", stackId: "shuffled", stackOrder: 0, stackLayout: "diagonal", stackPlacement: "top" },
    { ...c, face: "face_down", stackId: "shuffled", stackOrder: 1, stackLayout: "diagonal", stackPlacement: "top" },
  ];
  const ids = resolveDraggedCardIds(board.players.p1.deckInspection, a.instanceId);
  const returned = moveCardsBetweenZones(board, "p1", "deckInspection", "deck", ids, "top");
  assert.deepEqual(returned.players.p1.deck.map((card) => card.instanceId), [b.instanceId, c.instanceId, a.instanceId, x.instanceId, y.instanceId]);
  const returnedCards = returned.players.p1.deck.slice(0, 3);
  assert.ok(returnedCards.every((card) => card.face === "face_up" && card.stackId === null && card.stackOrder === null && card.stackLayout === null && card.stackPlacement === null && card.attachedToStackId === null));
  let drawn = returned;
  for (const expected of [b, c, a]) {
    drawn = drawRandomCard(drawn, "p1");
    assert.equal(drawn.players.p1.hand.at(-1).instanceId, expected.instanceId);
  }
});

test("束を山札下へ戻すと既存順と束の表示順を保って最後に引ける", () => {
  const board = initialBoard(cards, () => 0.5);
  const [a, b, c, x, y] = board.players.p1.hand.slice(0, 5);
  board.players.p1.hand = [];
  board.players.p1.deck = [x, y];
  board.players.p1.deckInspection = [
    { ...a, face: "face_down", stackId: "shuffled", stackOrder: 2, stackLayout: "diagonal", stackPlacement: "top" },
    { ...b, face: "face_down", stackId: "shuffled", stackOrder: 0, stackLayout: "diagonal", stackPlacement: "top" },
    { ...c, face: "face_down", stackId: "shuffled", stackOrder: 1, stackLayout: "diagonal", stackPlacement: "top" },
  ];
  const ids = resolveDraggedCardIds(board.players.p1.deckInspection, a.instanceId);
  const returned = moveCardsBetweenZones(board, "p1", "deckInspection", "deck", ids, "bottom");
  assert.deepEqual(returned.players.p1.deck.map((card) => card.instanceId), [x.instanceId, y.instanceId, b.instanceId, c.instanceId, a.instanceId]);
  assert.ok(returned.players.p1.deck.slice(2).every((card) => card.face === "face_up" && card.stackId === null && card.stackOrder === null));
  let drawn = returned;
  for (const expected of [x, y, b, c, a]) {
    drawn = drawRandomCard(drawn, "p1");
    assert.equal(drawn.players.p1.hand.at(-1).instanceId, expected.instanceId);
  }
});

test("束はゾーンで1枚として数え、個別移動で残り1枚になれば解除する", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  assert.equal(countZoneCards(bundled.players.p1.hand), bundled.players.p1.hand.length - 1);
  const moved = moveCardsBetweenZones(bundled, "p1", "hand", "mana", new Set([two[0].instanceId]));
  assert.equal(moved.players.p1.hand.find((card) => card.instanceId === two[1].instanceId)?.stackId, null);
  assert.equal(moved.players.p1.mana.find((card) => card.instanceId === two[0].instanceId)?.stackId, null);
});

test("接続した横束が1枚になっても縦束の横に残る", () => {
  const board = initialBoard(cards, () => 0.5);
  const [a, b, c, d] = board.players.p1.hand.slice(0, 4);
  board.players.p1.hand = board.players.p1.hand.slice(4);
  board.players.p1.battle = [
    { ...a, stackId: "vertical", stackLayout: "diagonal", stackOrder: 0 },
    { ...b, stackId: "vertical", stackLayout: "diagonal", stackOrder: 1 },
    { ...c, stackId: "horizontal", stackLayout: "spread", stackOrder: 0, attachedToStackId: "vertical" },
    { ...d, stackId: "horizontal", stackLayout: "spread", stackOrder: 1, attachedToStackId: "vertical" },
  ];
  const moved = moveCardsBetweenZones(board, "p1", "battle", "graveyard", new Set([d.instanceId]));
  const remaining = moved.players.p1.battle.find((card) => card.instanceId === c.instanceId);
  assert.equal(remaining?.stackId, "horizontal");
  assert.equal(remaining?.stackLayout, "spread");
  assert.equal(remaining?.attachedToStackId, "vertical");
});

test("接続元の縦束が1枚になっても横束の位置を保つ", () => {
  const board = initialBoard(cards, () => 0.5);
  const [a, b, c] = board.players.p1.hand.slice(0, 3);
  board.players.p1.hand = board.players.p1.hand.slice(3);
  board.players.p1.battle = [
    { ...a, stackId: "vertical", stackLayout: "diagonal", stackOrder: 0 },
    { ...b, stackId: "vertical", stackLayout: "diagonal", stackOrder: 1 },
    { ...c, stackId: "horizontal", stackLayout: "spread", stackOrder: 0, attachedToStackId: "vertical" },
  ];
  const moved = moveCardsBetweenZones(board, "p1", "battle", "graveyard", new Set([b.instanceId]));
  assert.equal(moved.players.p1.battle.find((card) => card.instanceId === a.instanceId)?.stackId, "vertical");
  assert.equal(moved.players.p1.battle.find((card) => card.instanceId === c.instanceId)?.attachedToStackId, "vertical");
});

test("束の内容からバトルゾーン内へ移すとその1枚だけ独立し、接続は残る", () => {
  const board = initialBoard(cards, () => 0.5);
  const [a, b, c, d] = board.players.p1.hand.slice(0, 4);
  board.players.p1.hand = board.players.p1.hand.slice(4);
  board.players.p1.battle = [
    { ...a, stackId: "vertical", stackLayout: "diagonal", stackOrder: 0 },
    { ...b, stackId: "vertical", stackLayout: "diagonal", stackOrder: 1 },
    { ...c, stackId: "horizontal", stackLayout: "spread", stackOrder: 0, attachedToStackId: "vertical" },
    { ...d, stackId: "horizontal", stackLayout: "spread", stackOrder: 1, attachedToStackId: "vertical" },
  ];
  const next = detachCardFromStack(board, "p1", "battle", d.instanceId);
  assert.equal(next.players.p1.battle.length, 4);
  assert.equal(next.players.p1.battle.at(-1)?.instanceId, d.instanceId);
  assert.equal(next.players.p1.battle.at(-1)?.stackId, null);
  assert.equal(next.players.p1.battle.at(-1)?.attachedToStackId, null);
  assert.equal(next.players.p1.battle.find((card) => card.instanceId === c.instanceId)?.stackId, "horizontal");
  assert.equal(next.players.p1.battle.find((card) => card.instanceId === c.instanceId)?.attachedToStackId, "vertical");
});

test("接続元の縦束から1枚外しても残る縦1枚と横束の接続を維持する", () => {
  const board = initialBoard(cards, () => 0.5);
  const [a, b, c] = board.players.p1.hand.slice(0, 3);
  board.players.p1.hand = board.players.p1.hand.slice(3);
  board.players.p1.battle = [
    { ...a, stackId: "vertical", stackLayout: "diagonal", stackOrder: 0 },
    { ...b, stackId: "vertical", stackLayout: "diagonal", stackOrder: 1 },
    { ...c, stackId: "horizontal", stackLayout: "spread", stackOrder: 0, attachedToStackId: "vertical" },
  ];
  const next = detachCardFromStack(board, "p1", "battle", b.instanceId);
  assert.equal(next.players.p1.battle.find((card) => card.instanceId === a.instanceId)?.stackId, "vertical");
  assert.equal(next.players.p1.battle.find((card) => card.instanceId === c.instanceId)?.stackId, "horizontal");
  assert.equal(next.players.p1.battle.at(-1)?.stackId, null);
});

test("束を解除すると全カードの束情報がなくなる", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  const stackId = bundled.players.p1.hand.find((card) => card.stackId)?.stackId;
  const unbundled = unbundleStack(bundled, "p1", "hand", stackId);
  assert.ok(unbundled.players.p1.hand.every((card) => !card.stackId));
  assert.equal(countZoneCards(unbundled.players.p1.hand), unbundled.players.p1.hand.length);
});

test("複数選択の束化は表裏と並び順を変えずに同じ束へまとめる", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  const members = bundled.players.p1.hand.filter((card) => card.stackId);
  assert.equal(members.length, 2);
  assert.deepEqual(members.map((card) => card.face), two.map((card) => card.face));
  assert.deepEqual(members.map((card) => card.instanceId), two.map((card) => card.instanceId));
});

test("複数選択を縦束にすると最上部以外のマーカーを解除する", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  two[0].markers = ["cannot_attack"];
  two[1].markers = ["summoning_sickness"];
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  const members = bundled.players.p1.hand.filter((card) => card.stackId);
  assert.deepEqual(members.map((card) => card.markers), [[], ["summoning_sickness"]]);
});

test("束専用シャッフルは全カードを裏向きにして順番をランダム化する", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  const stackId = bundled.players.p1.hand.find((card) => card.stackId)?.stackId;
  const shuffled = shuffleStackCards(bundled, "p1", "hand", stackId, () => 0);
  const members = shuffled.players.p1.hand.filter((card) => card.stackId === stackId).sort((a, b) => a.stackOrder - b.stackOrder);
  assert.ok(members.every((card) => card.face === "face_down"));
  assert.notDeepEqual(members.map((card) => card.instanceId), two.map((card) => card.instanceId));
});

test("束専用反転は全裏なら全表、それ以外は全裏に統一する", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  const stackId = bundled.players.p1.hand.find((card) => card.stackId)?.stackId;
  const allDown = { ...bundled, players: { ...bundled.players, p1: { ...bundled.players.p1, hand: bundled.players.p1.hand.map((card) => card.stackId === stackId ? { ...card, face: "face_down" } : card) } } };
  const allUp = flipStackCards(allDown, "p1", "hand", stackId);
  assert.ok(allUp.players.p1.hand.filter((card) => card.stackId === stackId).every((card) => card.face === "face_up"));
  const mixed = { ...allUp, players: { ...allUp.players, p1: { ...allUp.players.p1, hand: allUp.players.p1.hand.map((card, index) => card.stackId === stackId && index === 0 ? { ...card, face: "face_down" } : card) } } };
  const normalized = flipStackCards(mixed, "p1", "hand", stackId);
  assert.ok(normalized.players.p1.hand.filter((card) => card.stackId === stackId).every((card) => card.face === "face_down"));
});

test("ヨビニオンは山札順に低コスト対象を見つけ残りを山札下へ戻す", () => {
  const board = initialBoard(cards, () => 0.5);
  const source = { ...board.players.p1.hand[0], cost: 5, face: "face_up" };
  board.players.p1.battle = [source];
  board.players.p1.deck = [
    { ...board.players.p1.deck[0], cost: 7, cardTypes: ["クリーチャー"] },
    { ...board.players.p1.deck[1], cost: 3, cardTypes: ["呪文", "クリーチャー"] },
    ...board.players.p1.deck.slice(2),
  ];
  const next = runYobinion(board, "p1", source.instanceId, false, () => 0);
  assert.equal(next.players.p1.battle.at(-1)?.cost, 3);
  assert.equal(next.players.p1.deck.at(-1)?.cost, 7);
  assert.equal(next.players.p1.deck.at(-1)?.face, "face_down");
  assert.ok(next.players.p1.deck.at(-1)?.stackId);
  assert.equal(next.notifications?.filter((notice) => notice.message.includes("ヨビニオン")).length, 2);
  assert.equal(next.notifications?.every((notice) => notice.revealedCard?.instanceId === next.players.p1.battle.at(-1)?.instanceId), true);
  assert.equal(next.notifications?.every((notice) => notice.revealedCard?.face === "face_up"), true);
});

test("ヨビニオンは種類にクリーチャーを含む低コストカードだけを対象にする", () => {
  const board = initialBoard(cards, () => 0.5);
  const source = { ...board.players.p1.hand[0], cost: 4, face: "face_up" };
  board.players.p1.battle = [source];
  const [unknown, equalCost, spell, compound, ...rest] = board.players.p1.deck;
  board.players.p1.deck = [
    { ...unknown, cost: 1, cardTypes: [] },
    { ...equalCost, cost: 4, cardTypes: ["クリーチャー"] },
    { ...spell, cost: 2, cardTypes: ["呪文"] },
    { ...compound, cost: 3, cardTypes: ["タマシード/クリーチャー"] },
    ...rest,
  ];
  const next = runYobinion(board, "p1", source.instanceId, false, () => 0);
  assert.equal(next.players.p1.battle.at(-1)?.instanceId, compound.instanceId);
  const returned = next.players.p1.deck.slice(-3);
  assert.ok(returned.every((card) => card.face === "face_down"));
  assert.equal(new Set(returned.map((card) => card.stackId)).size, 1);
  assert.deepEqual(new Set(returned.map((card) => card.instanceId)), new Set([unknown.instanceId, equalCost.instanceId, spell.instanceId]));
});

test("保存コストが未登録でもヨビニオン・マルルは天災 デドダムを呼び出す", () => {
  const board = initialBoard(cards, () => 0.5);
  const source = { ...board.players.p1.hand[0], name: "ヨビニオン・マルル", cost: null, cardTypes: ["クリーチャー"], face: "face_up" };
  const dedodam = { ...board.players.p1.deck[0], name: "天災 デドダム", cost: null, cardTypes: ["クリーチャー"] };
  board.players.p1.battle = [source];
  board.players.p1.deck = [dedodam, ...board.players.p1.deck.slice(1)];
  const next = runYobinion(board, "p1", source.instanceId, false, () => 0);
  assert.equal(next.players.p1.battle.at(-1)?.instanceId, dedodam.instanceId);
  assert.equal(next.players.p1.battle.at(-1)?.name, "天災 デドダム");
});

test("正規化した公式文明が2種類以上あるカードだけを多色と判定する", () => {
  assert.equal(isMulticolorCard({ civilizations: ["light", "water"] }), true);
  assert.equal(isMulticolorCard({ civilizations: [" LIGHT ", "water", "light"] }), true);
  assert.equal(isMulticolorCard({ civilizations: ["light"] }), false);
  assert.equal(isMulticolorCard({ civilizations: [] }), false);
  assert.equal(isMulticolorCard({ name: "名前に区切りがある単色カード / 呪文", civilizations: ["fire"] }), false);
  assert.deepEqual(resolveCardCivilizations("カード名は判定に使わない", [" WATER ", "water", "unknown", "darkness"]), ["water", "darkness"]);
});

test("異なる公式文明を2つ以上持つカードだけがマナ移動時に自動タップする", () => {
  const board = initialBoard(cards, () => 0.5);
  const multicolor = { ...board.players.p1.hand[0], civilizations: ["water", "darkness", "nature"] };
  const singleColor = { ...board.players.p1.hand[1], civilizations: ["fire"] };
  board.players.p1.hand = [multicolor, singleColor, ...board.players.p1.hand.slice(2)];
  const movedMulti = moveCardsBetweenZones(board, "p1", "hand", "mana", new Set([multicolor.instanceId]));
  assert.equal(movedMulti.players.p1.mana.at(-1)?.tapped, true);
  const movedSingle = moveCardsBetweenZones(movedMulti, "p1", "hand", "mana", new Set([singleColor.instanceId]));
  assert.equal(movedSingle.players.p1.mana.at(-1)?.tapped, false);
});

test("指定したゾーンだけを全アンタップする", () => {
  const board = initialBoard(cards, () => 0.5);
  board.players.p1.mana = [{ ...board.players.p1.hand[0], tapped: true }];
  board.players.p1.battle = [{ ...board.players.p1.hand[1], tapped: true }];
  const next = untapZoneCards(board, "p1", "mana");
  assert.equal(next.players.p1.mana[0].tapped, false);
  assert.equal(next.players.p1.battle[0].tapped, true);
  const tappedAll = untapZoneCards(next, "p1", "mana");
  assert.equal(tappedAll.players.p1.mana[0].tapped, true);
  tappedAll.players.p1.mana.push({ ...tappedAll.players.p1.hand[0], tapped: false });
  const mixed = untapZoneCards(tappedAll, "p1", "mana");
  assert.ok(mixed.players.p1.mana.every((card) => !card.tapped));
});

test("オンライン仮置き場の公開状態はプレイヤーごとに切り替わり、追加カードにも適用される", () => {
  let board = initialBoard(cards, () => 0.5);
  const [first, second, third] = board.players.p1.hand;
  assert.deepEqual(board.revealPublic, { p1: false, p2: false });
  board = moveCardsBetweenZones(board, "p1", "hand", "reveal", new Set([first.instanceId, second.instanceId]));
  board = toggleRevealPublic(board, "p1");
  assert.deepEqual(board.revealPublic, { p1: true, p2: false });
  assert.equal(board.notifications.at(-1).recipient, "p2");
  assert.equal(board.notifications.at(-1).message, "相手が仮置き場のカードを公開しました");
  board = moveCardsBetweenZones(board, "p1", "hand", "reveal", new Set([third.instanceId]));
  assert.equal(board.players.p1.reveal.length, 3);
  assert.equal(board.revealPublic.p1, true);
  const notificationCount = board.notifications.length;
  board = toggleRevealPublic(board, "p1");
  assert.deepEqual(board.revealPublic, { p1: false, p2: false });
  assert.equal(board.notifications.length, notificationCount);
  board = toggleRevealPublic(board, "p2");
  assert.deepEqual(board.revealPublic, { p1: false, p2: true });
  assert.equal(board.notifications.at(-1).recipient, "p1");
  board = toggleRevealPublic(board, "p1");
  assert.deepEqual(board.revealPublic, { p1: true, p2: true });
  assert.equal(board.notifications.at(-1).recipient, "p2");
});
