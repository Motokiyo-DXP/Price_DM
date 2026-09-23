import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const board = readFileSync(new URL("../components/playtest-board.tsx", import.meta.url), "utf8");
const playtestPage = readFileSync(new URL("../app/playtest/[deckId]/page.tsx", import.meta.url), "utf8");

test("下に重ねる2枚束は下カードを右下、上カードを左上に配置する", () => {
  assert.ok(css.includes('.stack-placement-bottom[data-visible-count="2"] .play-card:nth-of-type(1){left:var(--diagonal-step-x);top:var(--diagonal-step-y)}'));
  assert.ok(css.includes('.stack-placement-bottom[data-visible-count="2"] .play-card:nth-of-type(2){left:0;top:0}'));
});

test("下に重ねる3枚束は右下から左上へ段階的に配置する", () => {
  assert.ok(css.includes('.stack-placement-bottom[data-visible-count="3"] .play-card:nth-of-type(1){left:calc(var(--diagonal-step-x) + var(--diagonal-step-x));top:calc(var(--diagonal-step-y) + var(--diagonal-step-y))}'));
  assert.ok(css.includes('.stack-placement-bottom[data-visible-count="3"] .play-card:nth-of-type(2){left:var(--diagonal-step-x);top:var(--diagonal-step-y)}'));
  assert.ok(css.includes('.stack-placement-bottom[data-visible-count="3"] .play-card:nth-of-type(3){left:0;top:0}'));
});

test("束の内容一覧は束表示から独立した横並びカードとして表示する", () => {
  assert.ok(board.includes('className="play-zone-cards stack-inspector-cards"'));
  assert.ok(css.includes('.stack-inspector .stack-inspector-cards>.play-card{flex:0 0 58px;'));
  assert.ok(css.includes('position:relative;transform:none;width:58px'));
});

test("束内カードをタップ状態にしてもstackOrderの表示階層を上書きしない", () => {
  assert.ok(css.includes(".rough-battle-board .card-stack .play-card.tapped{z-index:auto}"));
});

test("重ねる選択肢は指を離さないMayaパネルと中央・外周キャンセルを備える", () => {
  assert.ok(board.includes('<StackDestinationMarkingMenu menu={pendingDestinationStack} />'));
  assert.ok(board.includes('selectStackDestinationItem'));
  assert.ok(board.includes('isMarkingMenuGestureCancelled(pendingDestinationStack.x'));
  assert.ok(board.includes('commitDestinationStack("face_up", "bottom", "spread")'));
  assert.ok(css.includes('.stack-destination-spread{width:144px}'));
});

test("盤面の開閉と寸法変化を観測し、固定手札の実表示位置から余白を計算する", () => {
  assert.ok(board.includes('document.querySelector<HTMLElement>(".rough-battle-board .battle-fields")'));
  assert.ok(board.includes('mutations.observe(fields, { attributes: true'));
  assert.ok(board.includes('observer.observe(element)'));
  assert.ok(board.includes('viewportHeight - handTop - mainBottomPadding'));
  assert.ok(board.includes('className="playtest-bottom-clearance" style={{ height: dynamicBottomClearance }}'));
  assert.ok(css.includes('.playtest-bottom-clearance{pointer-events:none;width:100%}'));
});

test("変形後の手札カード端と下部固定ナビゲーションを測定する", () => {
  assert.ok(board.includes('document.querySelector<HTMLElement>(".battle-player-bottom .zone-hand")'));
  assert.ok(board.includes('document.querySelector<HTMLElement>(".battle-player-bottom .zone-hand .play-zone-cards")'));
  assert.ok(board.includes('card.getBoundingClientRect().top'));
  assert.ok(board.includes('Math.max(cardsClipTop, card.getBoundingClientRect().top)'));
  assert.ok(board.includes('navigation?.getBoundingClientRect()'));
  assert.ok(css.includes('.rough-battle-board .battle-player-bottom .zone-hand,.rough-battle-board .hand-history-actions{bottom:var(--battle-bottom-ui-height,0px)}'));
});

test("ずらして配置は移動カードを右側・同じY座標・下階層へ置く", () => {
  assert.ok(board.includes('commitDestinationStack("face_up", "bottom", "spread")'));
  assert.ok(board.includes('commitStackMove("face_up", "bottom", pending, "spread")'));
  assert.ok(css.includes('.stack-spread.stack-placement-bottom[data-visible-count="2"] .play-card:nth-of-type(1){left:var(--spread-step-x);top:0}'));
  assert.ok(css.includes('.stack-spread.stack-placement-bottom[data-visible-count="2"] .play-card:nth-of-type(2){left:0;top:0}'));
});

test("縦束に接続した横束は右下でなく同じ高さに重ね、縦束の背面に置く", () => {
  assert.ok(css.includes('display:grid;flex:0 0 auto;grid-template-areas:"stack"'));
  assert.ok(css.includes('.connected-stacks>.stack-diagonal{z-index:2}'));
  assert.ok(css.includes('.connected-stacks>.stack-spread{transform:translateX(var(--attached-step-x));z-index:1}'));
});

test("接続した束の枠はカード配置と同じ幅を持つ", () => {
  assert.ok(css.includes('grid-template-areas:"stack";outline:2px solid #ffffff80;padding-right:var(--attached-step-x)'));
  assert.ok(css.includes('.connected-stacks>.card-stack{grid-area:stack;align-self:start;outline:none}'));
  assert.ok(css.includes('.connected-stacks>.card-stack{width:var(--stack-card-width)}'));
  assert.ok(css.includes('.connected-stacks>.stack-diagonal[data-visible-count="2"]{width:calc(var(--stack-card-width) + var(--diagonal-step-x))}'));
  assert.ok(css.includes('.connected-stacks>.stack-spread[data-visible-count="4"]{width:calc(var(--stack-card-width) + var(--spread-step-x) + var(--spread-step-x) + var(--spread-step-x))}'));
});

test("ドラッグ保持は対象カードごとに計時し300msで進捗、500msで共通Mayaパネルを開く", () => {
  assert.ok(board.includes("previousCandidate.targetCardId === candidate.targetCardId"));
  assert.ok(board.includes("}, STACK_HOLD_PROGRESS_MS);"));
  assert.ok(board.includes("}, STACK_HOLD_MENU_MS);"));
  assert.ok(board.includes("<StackHoldProgress point={stackHoldProgress} />"));
  assert.ok(board.includes("specialPreview?.kind === \"stack\" ? <StackDestinationMarkingMenu"));
  assert.ok(board.includes("STACK_HOLD_MENU_MS - STACK_HOLD_PROGRESS_MS"));
  assert.ok(css.includes(".long-press-progress .value{animation:long-press-fill var(--long-press-ms) linear forwards"));
});

test("すべての長押し進捗は共通円形表示を接触点の左上に出す", () => {
  assert.ok(board.includes('label="長押し操作が有効になるまでの残り時間"'));
  assert.ok(board.includes('label="山札の長押し操作が有効になるまでの残り時間"'));
  assert.ok(board.includes('label="その他の操作パネルを開くまでの残り時間"'));
  assert.ok(css.includes("transform:translate(-125%,-125%)"));
});

test("複数選択の発光はカードの重なり順を変えず変形後の輪郭へ追従する", () => {
  assert.ok(css.includes(".rough-battle-board .play-card.selected{"));
  assert.ok(css.includes("filter:brightness(1.12) drop-shadow(0 0 2px #2f80ed) drop-shadow(0 0 4px #69a2ff);"));
  assert.ok(!css.includes("z-index:2000!important;"));
  assert.ok(!css.includes(".rough-battle-board .play-card.selected::after{"));
  assert.ok(board.includes('element.style.zIndex = index === focusedIndex ? "2000" : `${1000 - Math.round(Math.abs(linearX))}`'));
});

test("手札の拡大対象と最前面カードは同じfocusedIndexで決まる", () => {
  assert.ok(board.includes('element.style.setProperty("--fan-scale", index === focusedIndex ? "2.8" : "2")'));
  assert.ok(board.includes('element.dataset.fanFocused = index === focusedIndex ? "true" : "false"'));
  assert.ok(board.includes('element.style.zIndex = index === focusedIndex ? "2000" : `${1000 - Math.round(Math.abs(linearX))}`'));
});

test("相手省略時の通常カード拡大は束内カードへ適用せず幅を維持する", () => {
  assert.ok(css.includes(".opponent-collapsed .battle-player-bottom .zone-battle .play-zone-cards>.play-card{"));
  assert.ok(css.includes(".opponent-collapsed .battle-player-bottom .play-zone:not(.zone-battle) .play-zone-cards>.play-card{"));
  assert.ok(!css.includes(".opponent-collapsed .battle-player-bottom .play-zone:not(.zone-battle) .play-card{height:90%;width:auto}"));
  assert.ok(css.includes(".rough-battle-board .card-stack .play-card{box-sizing:border-box;width:76px}"));
  assert.ok(css.includes(".rough-battle-board .card-stack .play-card{width:48px}"));
});

test("手札0枚表示はY位置を維持しX方向だけ画面中央へ固定する", () => {
  assert.ok(board.includes('fan && cards.length === 0 ? "empty-hand" : ""'));
  assert.ok(css.includes('.zone-hand.empty-hand .play-zone-cards{overflow-x:hidden}'));
  assert.ok(css.includes('left:calc(50vw - max(10px,calc((100vw - 1500px)/2)));'));
  assert.ok(css.includes('top:50%;'));
  assert.ok(css.includes('transform:translate(-50%,-50%);'));
  assert.ok(css.includes('.zone-hand.empty-hand .empty-hand-target{left:calc(50vw - 3px)}'));
});

test("展開手札は実カードと手札なし表示だけを入力対象にする", () => {
  assert.ok(css.includes('.rough-battle-board .battle-player-bottom .zone-hand{background:transparent;border-color:transparent;box-shadow:none;pointer-events:none;z-index:31}'));
  assert.ok(css.includes('.battle-player-bottom .zone-hand .play-zone-cards .card-stack,.battle-player-bottom .zone-hand .play-zone-cards .connected-stacks{pointer-events:none}'));
  assert.ok(css.includes('.battle-player-bottom .zone-hand .play-zone-cards .play-card,.battle-player-bottom .zone-hand .play-zone-cards>.empty-hand-target{pointer-events:auto}'));
});

test("山札上下の選択UIはゾーンのoverflowとtransformに切り取られないPortalで表示する", () => {
  assert.ok(board.includes("function DeckPlacementPreview"));
  assert.ok(board.includes("<DeckPlacementPreview owner={owner}"));
  assert.ok(board.includes("document.body,"));
  assert.ok(board.includes('data-deck-drop-area={activeArea ?? undefined}'));
  assert.ok(board.includes('className={`choice top ${activeArea === "top" ? "active" : ""}`}'));
  assert.ok(board.includes('className={`choice bottom ${activeArea === "bottom" ? "active" : ""}`}'));
});

test("引用ゾーンは種類にかかわらず外側を広げずカード列だけ横スクロールする", () => {
  assert.ok(board.includes('className={`battle-auxiliary-drawer ${activeAuxiliaryZone === "deck" ? "deck-view-drawer" : ""}`}'));
  assert.ok(css.includes('.battle-auxiliary-drawer{max-width:100%;min-width:0;width:100%}'));
  assert.ok(css.includes('.battle-auxiliary-drawer>.play-zone{box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden;width:100%}'));
  assert.ok(css.includes('.battle-auxiliary-drawer>.play-zone>.play-zone-cards{box-sizing:border-box;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;width:100%}'));
  assert.ok(!css.includes('.deck-view-drawer>.zone-deck{'));
});

test("安全な山札閲覧は旧最新版の数値ホイールと専用drawer表示を再利用する", () => {
  assert.ok(board.includes('className="deck-view-number-wheel"'));
  assert.ok(board.includes('className="deck-viewer"'));
  assert.ok(board.includes('className="deck-view-mode-toggle"'));
  assert.ok(css.includes('.deck-view-number-wheel{height:112px'));
  assert.ok(css.includes('.deck-viewer{grid-template-columns:minmax(0,1fr) 168px'));
  assert.ok(css.includes('.deck-view-cards::after{content:"";flex:0 0 30%'));
});

test("ドラッグ先ガイドは同じ所有者・ゾーンを発光させ、山札本体は中断状態として分離する", () => {
  assert.match(board, /querySelectorAll<HTMLElement>\(\x60\[data-drop-owner=/);
  assert.match(board, /function showDeckPlacementGuide/);
  assert.match(board, /deck\.classList\.add\("deck-drop-cancel"\)/);
  assert.match(board, /resolveDeckDropArea\(\{ \.\.\.deckPlacement, pointX: event\.clientX, pointY: event\.clientY \}\)/);
  assert.match(css, /\.drop-guide-active\{[^}]*border-color:#8fffa1!important;[^}]*box-shadow:/);
  assert.ok(css.includes(".special-preview.deck .choice{pointer-events:none}"));
});

test("対戦デッキ名は戻るリンクを置かず中央に表示する", () => {
  assert.doesNotMatch(playtestPage, /← マイデッキ/);
  assert.match(playtestPage, /className="deck-versus"/);
  assert.match(css, /\.playtest-page-heading \.deck-versus\{[^}]*margin-inline:auto/);
});

test("手札は初回描画前に中央スクロールと扇形座標を同期適用する", () => {
  assert.match(board, /useIsomorphicLayoutEffect\(\(\) => \{/);
  assert.match(board, /container\.scrollLeft = Math\.max\(0, \(container\.scrollWidth - container\.clientWidth\) \/ 2\);[\s\S]*applyFanLayout\(\);[\s\S]*addEventListener\("scroll", updateFan/);
});

test("山札・複数選択・束のシャッフルは共通の回転矢印を表示する", () => {
  assert.match(css, /\.shuffle-feedback::after\{[^}]*content:"↻"/);
  assert.match(board, /function animateShuffleFeedback/);
  assert.match(board, /action === "shuffle"[\s\S]*animateShuffleFeedback\(\(\) => cardShuffleFeedbackTargets\(shuffledIds\)\)/);
  assert.match(board, /action === "shuffle_stack"[\s\S]*animateShuffleFeedback\(\(\) => cardShuffleFeedbackTargets\(\[shuffledId\]\)\)/);
});
