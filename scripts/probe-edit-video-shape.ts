// One-shot probe: capture the RAW tools/call response for edit_video keyframe
// stage (stage-1) to learn its real response shape. Not committed to history
// as a test — manual research tool. Usage: node scripts/probe-edit-video-shape.ts <video-file>
import { McpConnectionManager } from "../lib/mcp/connectionManager.js";
import { uploadLocalMediaToRunway } from "../lib/mcp/adapters/runwayUpload.js";
import { homedir } from "node:os";
import { join } from "node:path";

const videoFile = process.argv[2];
if (!videoFile) { console.error("usage: node scripts/probe-edit-video-shape.ts <generated-video-file>"); process.exit(2); }

const manager = new McpConnectionManager({
  enabledProviders: ["runway"],
  tokenDir: join(homedir(), ".ima2", "mcp"),
  getOrigin: () => "http://127.0.0.1:3333",
});

try {
  await manager.connect("runway");
  console.log("[probe] connected:", JSON.stringify(manager.status("runway")));

  const generatedDir = join(homedir(), ".ima2", "generated");
  const videoUrl = await uploadLocalMediaToRunway(manager, join(generatedDir, videoFile), {
    fileName: videoFile, mimeType: "video/mp4",
  });
  console.log("[probe] uploaded:", videoUrl);

  const raw = await manager.callTool("runway", "edit_video", {
    rationale: "probe: capture stage-1 keyframe response shape",
    promptText: "add gentle falling snow",
    video: { url: videoUrl },
    keyframeTimestampSeconds: 0.5,
  }, { timeoutMs: 300_000 });

  console.log("[probe] RAW RESPONSE START");
  console.log(JSON.stringify(raw, null, 2).slice(0, 4000));
  console.log("[probe] RAW RESPONSE END");
} finally {
  await manager.shutdown?.();
}
