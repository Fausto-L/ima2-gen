import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugifyPrompt } from "../lib/filename.ts";

describe("slugifyPrompt", () => {
  it("returns the prompt trimmed and slugified", () => {
    assert.equal(slugifyPrompt("sunset over the mountains"), "sunset-over-the-moun");
  });

  it("truncates to 20 characters", () => {
    assert.equal(slugifyPrompt("a cute cat sitting on a windowsill"), "a-cute-cat-sitting-o");
  });

  it("preserves CJK characters as-is", () => {
    assert.equal(slugifyPrompt("美丽的日落景色"), "美丽的日落景色");
  });

  it("returns 'untitled' for empty string", () => {
    assert.equal(slugifyPrompt(""), "untitled");
  });

  it("returns 'untitled' for whitespace-only string", () => {
    assert.equal(slugifyPrompt("   "), "untitled");
  });

  it("returns 'untitled' for control-chars-only string", () => {
    assert.equal(slugifyPrompt("\t\n\r"), "untitled");
  });

  it("strips filesystem-unsafe chars", () => {
    assert.equal(slugifyPrompt("hello/world:test?world"), "helloworldtestworld");
  });

  it("collapses consecutive hyphens", () => {
    assert.equal(slugifyPrompt("hello   world"), "hello-world");
  });

  it("trims leading and trailing hyphens", () => {
    assert.equal(slugifyPrompt("  hello  "), "hello");
  });

  it("handles CJK mixed with ASCII", () => {
    assert.equal(slugifyPrompt("美丽的 sunset"), "美丽的-sunset");
  });

  it("truncates CJK at 20 chars", () => {
    const long = "一二三四五六七八九十一二三四五六七八九十";
    assert.ok(slugifyPrompt(long).length <= 20);
  });
});
