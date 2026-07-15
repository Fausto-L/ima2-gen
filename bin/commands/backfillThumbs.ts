import { config } from "../../config.js";
import { backfillThumbnails } from "../../lib/thumbBackfill.js";
import { invalidateHistoryIndex } from "../../lib/historyIndex.js";

export interface BackfillThumbsResult { created: number; skipped: number; failed: number; total: number }

const HELP = `  Usage: ima2 backfill-thumbs\n\n  Generate missing thumbnails for gallery media.`;

export async function backfillThumbs(argv: string[] = []): Promise<BackfillThumbsResult | null> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return null;
  }
  const dir = config.storage.generatedDir;
  console.log(`[thumbs] Scanning ${dir} (recursive) for missing thumbnails...`);

  let r;
  try {
    r = await backfillThumbnails(dir);
  } catch (e) {
    console.error("[thumbs] Backfill failed:", e instanceof Error ? e.message : e);
    throw e;
  }

  if (r.created > 0) invalidateHistoryIndex();
  console.log(`[thumbs] Done: ${r.created} created, ${r.skipped} skipped (already exist), ${r.failed} failed out of ${r.total} media files.`);
  if (r.failures.length > 0) {
    console.log(`[thumbs] Showing ${r.failures.length} thumbnail failure(s):`);
    for (const failure of r.failures) {
      console.log(`  - ${failure.kind}: ${failure.file} (${failure.reason})`);
    }
  }
  return { created: r.created, skipped: r.skipped, failed: r.failed, total: r.total };
}
