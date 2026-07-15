import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "ima2-sprite-store-"));
process.env.IMA2_CONFIG_DIR = dir; process.env.IMA2_DB_PATH = join(dir, "db.sqlite");
const { closeDb, getDb } = await import("../lib/db.ts");
const { spriteRecipeStore } = await import("../lib/spriteRecipeStore.ts");
const { normalizeSpriteRecipe } = await import("../lib/spriteRecipeSchema.ts");
after(() => { closeDb(); rmSync(dir, { recursive: true, force: true }); });
const definition = { version: 1, character: { id: "hero", description: "blue knight", baseAssetId: null }, cell: { width: 64, height: 64, safeMarginX: 4, safeMarginY: 4 }, chromaKey: { name: "green", hex: "#00FF00", rgb: [0, 255, 0] }, states: [{ key: "idle", frames: 4, fps: 12, loop: true, action: "breathe" }], style: "pixel art" };
describe("sprite recipe schema and store", () => {
  it("normalizes defaults and rejects duplicate states and chroma mismatch", () => { assert.equal(normalizeSpriteRecipe(definition).version, 1); assert.throws(() => normalizeSpriteRecipe({ ...definition, states: [...definition.states, definition.states[0]] }), (error: any) => error.code === "INVALID_SPRITE_RECIPE"); assert.throws(() => normalizeSpriteRecipe({ ...definition, chromaKey: { ...definition.chromaKey, hex: "#FFFFFF" } }), /hex and rgb/); });
  it("creates, updates state rows transactionally, lists, and cascades delete", async () => { const created = await spriteRecipeStore.create({ name: "Hero", recipe: definition }); assert.deepEqual(created.rows.map((row) => row.stateKey), ["idle"]); const updated = await spriteRecipeStore.update(created.id, { recipe: { ...definition, states: [{ ...definition.states[0], key: "walk" }] } }); assert.deepEqual(updated.rows.map((row) => row.stateKey), ["walk"]); assert.equal((await spriteRecipeStore.list())[0].id, created.id); await spriteRecipeStore.remove(created.id); const count = getDb().prepare("SELECT count(*) count FROM sprite_recipe_rows").get() as { count: number }; assert.equal(count.count, 0); });
  it("isolates malformed stored JSON", async () => { const created = await spriteRecipeStore.create({ name: "Bad later", recipe: definition }); getDb().prepare("UPDATE sprite_recipes SET recipe='{' WHERE id=?").run(created.id); await assert.rejects(spriteRecipeStore.get(created.id), (error: any) => error.code === "SPRITE_RECIPE_STORE_ERROR"); });
});
