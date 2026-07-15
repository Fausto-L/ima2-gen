import { z } from "zod";

export type SpriteAnchorStatus = "missing" | "candidate" | "approved";
export interface SpriteCell { width: number; height: number; safeMarginX: number; safeMarginY: number }
export interface SpriteStateRecipe { key: string; frames: number; fps: number; loop: boolean; action: string }
export interface SpriteFit { mode: "contain" | "cover"; scale: number }
export interface SpriteRecipeDefinition {
  version: 1;
  character: { id: string; description: string; baseAssetId: string | null };
  cell: SpriteCell;
  chromaKey: { name: string; hex: string; rgb: [number, number, number] };
  states: SpriteStateRecipe[];
  style: string;
  fit?: SpriteFit;
}

const text = (name: string, max: number) => z.string().trim().min(1, `${name} is required`).max(max);
const stateSchema = z.object({
  key: text("state key", 64).regex(/^[A-Za-z0-9_-]+$/, "state key contains invalid characters"),
  frames: z.number().int().min(1).max(12), fps: z.number().int().min(1).max(60),
  loop: z.boolean().default(true), action: text("state action", 500),
});
const recipeSchema = z.object({
  version: z.literal(1).default(1),
  character: z.object({ id: text("character id", 100), description: text("character description", 1000), baseAssetId: z.string().trim().min(1).max(200).nullable().default(null) }),
  cell: z.object({ width: z.number().int().min(32).max(2048), height: z.number().int().min(32).max(2048), safeMarginX: z.number().int().min(0), safeMarginY: z.number().int().min(0) }),
  chromaKey: z.object({ name: text("chroma name", 80), hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/), rgb: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]) }),
  states: z.array(stateSchema).min(1).max(100), style: text("style", 1000),
  fit: z.object({ mode: z.enum(["contain", "cover"]).default("contain"), scale: z.number().positive().max(10).default(1) }).optional(),
}).superRefine((recipe, ctx) => {
  if (recipe.cell.safeMarginX * 2 >= recipe.cell.width) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cell", "safeMarginX"], message: "safeMarginX must be less than half the cell width" });
  if (recipe.cell.safeMarginY * 2 >= recipe.cell.height) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cell", "safeMarginY"], message: "safeMarginY must be less than half the cell height" });
  const seen = new Set<string>();
  for (const state of recipe.states) { if (seen.has(state.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["states"], message: `duplicate state key: ${state.key}` }); seen.add(state.key); }
  for (const state of recipe.states) if (state.frames * recipe.cell.width * recipe.cell.height > 100_000_000) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["states", state.key], message: "guide pixel count exceeds 100MP" });
  const rgb = recipe.chromaKey.rgb.map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  if (recipe.chromaKey.hex.slice(1).toUpperCase() !== rgb) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chromaKey"], message: "hex and rgb chroma values must match" });
});

function validationError(error: z.ZodError): Error {
  const result = new Error(error.issues[0]?.message ?? "invalid sprite recipe") as Error & { status: number; code: string };
  result.status = 400; result.code = "INVALID_SPRITE_RECIPE"; return result;
}

export function parseSpriteRecipeInput(input: unknown): SpriteRecipeDefinition {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data as SpriteRecipeDefinition;
}

export function normalizeSpriteRecipe(input: unknown): SpriteRecipeDefinition {
  const recipe = parseSpriteRecipeInput(input);
  return { ...recipe, chromaKey: { ...recipe.chromaKey, hex: recipe.chromaKey.hex.toUpperCase() } };
}
