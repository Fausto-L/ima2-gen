import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJson } from "./atomicWrite.js";

export async function persistVideoArtifact(
  generatedDir: string,
  filename: string,
  buffer: Buffer,
  metadata: unknown,
): Promise<void> {
  const filePath = join(generatedDir, filename);
  await writeFile(filePath, buffer);
  try {
    await atomicWriteJson(`${filePath}.json`, metadata);
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }
}
