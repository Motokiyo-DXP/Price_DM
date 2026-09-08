import assert from "node:assert/strict";
import test from "node:test";

import { advanceTurn, bundleSelectedCards, drawRandomCard, flipStackCards, initialBoard, isMulticolorCard, moveCardsBetweenZones, resetBoard, resolveCardCivilizations, resolveDraggedCardIds, runYobinion, setCardMarker, shuffleSelectedCards, shuffleStackCards, untapAllCards, untapZoneCards } from "./playfield-board.ts";

const cards = Array.from({ length: 40 }, (_, index) => ({ canonicalCardId: index + 1, imageUrl: null, name: `カード${index + 1}`, quantity: 1, sortOrder: index }));

test("初期状態は手札5枚・シールド5枚・山札30枚で表向きカードがない", () => {
  const board = initialBoard(cards, () => 0.5);
  for (const player of Object.values(board.players)) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.shield.length, 5);
    assert.equal(player.deck.length, 30);
    assert.equal(Object.values(player).flat().some((card) => card.face === "face_up"), false);
  }
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

test("複数選択の束化は表裏と並び順を変えずに同じ束へまとめる", () => {
  const board = initialBoard(cards, () => 0.5);
  const two = board.players.p1.hand.slice(0, 2);
  const bundled = bundleSelectedCards(board, new Set(two.map((card) => card.instanceId)));
  const members = bundled.players.p1.hand.filter((card) => card.stackId);
  assert.equal(members.length, 2);
  assert.deepEqual(members.map((card) => card.face), two.map((card) => card.face));
  assert.deepEqual(members.map((card) => card.instanceId), two.map((card) => card.instanceId));
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
