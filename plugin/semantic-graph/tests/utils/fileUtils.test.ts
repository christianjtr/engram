import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDir, sanitizeFilename, writeAtomicFile } from "../../src/utils/fileUtils";

test("sanitizeFilename normalizes identifiers safely", () => {
    assert.equal(sanitizeFilename("my-project"), "my-project");
    assert.equal(sanitizeFilename("  my/nested/project  "), "my_nested_project");
    assert.equal(sanitizeFilename("windows\\style\\path"), "windows_style_path");
    assert.equal(sanitizeFilename("   "), "unknown");
    assert.equal(sanitizeFilename(""), "unknown");
});

test("writeAtomicFile writes file atomically and ensures content", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "engram-test-"));
    const targetPath = path.join(tmpDir, "test-atomic.json");

    try {
        await ensureDir(tmpDir);
        await writeAtomicFile(targetPath, JSON.stringify({ hello: "world" }));

        const content = await fs.readFile(targetPath, "utf-8");
        assert.deepEqual(JSON.parse(content), { hello: "world" });
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});
