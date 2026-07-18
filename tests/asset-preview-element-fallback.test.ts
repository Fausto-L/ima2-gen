import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assetToPreviewItem } from "../ui/src/lib/assetPreview.ts";

describe("assetToPreviewItem element fallback", () => {
  it("element without filePath falls back to metadata.refs[0] (keying entry stays available)", () => {
    const item = assetToPreviewItem({
      id: "a_elem",
      kind: "element",
      name: "elem",
      filePath: null,
      createdAt: "2026-07-18",
      metadata: { refs: ["1784131394336_776db756_0.png"] },
      tags: [],
    } as never);
    assert.equal(item.filename, "1784131394336_776db756_0.png");
    assert.notEqual(item.kind, "edit");
    assert.ok(item.url.endsWith("1784131394336_776db756_0.png"));
  });

  it("element without refs keeps empty filename (no crash)", () => {
    const item = assetToPreviewItem({
      id: "a_elem2",
      kind: "element",
      name: "elem2",
      filePath: null,
      createdAt: "2026-07-18",
      metadata: {},
      tags: [],
    } as never);
    assert.equal(item.filename, "");
  });

  it("regular image asset is unchanged", () => {
    const item = assetToPreviewItem({
      id: "a_img",
      kind: "image",
      name: "img",
      filePath: "foo.png",
      createdAt: "2026-07-18",
      metadata: {},
      tags: [],
    } as never);
    assert.equal(item.filename, "foo.png");
  });
});
