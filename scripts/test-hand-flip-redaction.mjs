import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Use only the isolated, network-disabled validation container created for this task.
const container = "price-dm-hand-flip-validation-20261005";
const info = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(info.HostConfig.NetworkMode, "none");
const sql = (source) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: source, encoding: "utf8" }).trim();
sql("create schema if not exists private;" + readFileSync(new URL("../supabase/migrations/20261005054427_hand_flip_visibility.sql", import.meta.url), "utf8"));
let cases = 0;
for (const owner of ["p1", "p2"]) for (const viewer of ["p1", "p2"]) {
  for (const zone of ["hand", "battle", "deck", "deckInspection", "reveal"]) {
    for (const face of ["owner_only", "face_down", "face_up"]) for (const spectator of [false, true]) {
      const card = { instanceId: "card", canonicalCardId: 42, cardPrintId: 7, name: "identity", imageUrl: "image", cost: 3, civilizations: ["fire"], cardTypes: ["creature"], face };
      const player = Object.fromEntries(["hand", "battle", "deck", "deckInspection", "reveal"].map((z) => [z, z === zone ? [card] : []]));
      const state = { players: { [owner]: player }, revealPublic: { [owner]: false } };
      const result = JSON.parse(sql(`select private.redact_game_state('${JSON.stringify(state)}'::jsonb,'${viewer}',${spectator});`)).players[owner][zone][0];
      const visible = zone === "reveal" ? owner === viewer : zone === "deckInspection" ? owner === viewer && !spectator : zone === "deck" ? false : spectator || face === "face_up" || face === "owner_only" && owner === viewer || zone === "hand" && face === "face_down" && owner !== viewer;
      for (const key of ["canonicalCardId", "cardPrintId", "name", "imageUrl", "cost", "civilizations", "cardTypes"]) {
        assert.deepEqual(result[key], visible ? card[key] : key === "name" ? "非公開カード" : ["civilizations", "cardTypes"].includes(key) ? [] : null, `${owner}/${viewer}/${zone}/${face}/${spectator}/${key}`);
      }
      cases++;
    }
  }
}
console.log(`SQL redaction: ${cases} cases, all 7 identity fields passed`);
