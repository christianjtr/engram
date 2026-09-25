import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { applyEnvValues, loadEnvFiles, parseEnvFile } from "../../src/config/loadEnv";
import { clearEngramEnv, restoreFetchEnv } from "../helpers/mockFetch";

afterEach(() => {
    restoreFetchEnv();
});

test("parseEnvFile reads keys, quotes, export, and skips comments", () => {
    const parsed = parseEnvFile(`
# comment
ENGRAM_URL=http://127.0.0.1:9000
export ENGRAM_PORT=9000
ENGRAM_HTTP_TOKEN="secret token"
ENGRAM_PROJECT='engram'
OTHER=ignored-by-apply
INVALID LINE
=nouser
`);

    assert.equal(parsed.ENGRAM_URL, "http://127.0.0.1:9000");
    assert.equal(parsed.ENGRAM_PORT, "9000");
    assert.equal(parsed.ENGRAM_HTTP_TOKEN, "secret token");
    assert.equal(parsed.ENGRAM_PROJECT, "engram");
    assert.equal(parsed.OTHER, "ignored-by-apply");
});

test("applyEnvValues only sets allowlisted keys and skips empty values", () => {
    clearEngramEnv();
    applyEnvValues({
        ENGRAM_URL: "http://localhost:1",
        ENGRAM_PORT: "  ",
        ENGRAM_HTTP_TOKEN: "",
        OTHER: "nope",
    });

    assert.equal(process.env.ENGRAM_URL, "http://localhost:1");
    assert.equal(process.env.ENGRAM_PORT, undefined);
    assert.equal(process.env.OTHER, undefined);
});

test("applyEnvValues does not override process environment", () => {
    clearEngramEnv();
    process.env.ENGRAM_URL = "http://already-set";
    applyEnvValues({ ENGRAM_URL: "http://from-file" });
    assert.equal(process.env.ENGRAM_URL, "http://already-set");
});

test("loadEnvFiles prefers cwd .env over user .env, then process env", async () => {
    clearEngramEnv();
    const root = await mkdtemp(path.join(tmpdir(), "semantic-graph-env-"));
    const cwd = path.join(root, "cwd");
    const userDir = path.join(root, "user");
    await mkdir(cwd);
    await mkdir(userDir);

    await writeFile(
        path.join(userDir, ".env"),
        "ENGRAM_URL=http://from-user\nENGRAM_PORT=1111\nENGRAM_PROJECT=user-project\n",
    );
    await writeFile(path.join(cwd, ".env"), "ENGRAM_URL=http://from-cwd\nOTHER=nope\n");

    process.env.ENGRAM_PROJECT = "from-process";
    await loadEnvFiles({ cwd, userDir });

    assert.equal(process.env.ENGRAM_URL, "http://from-cwd");
    assert.equal(process.env.ENGRAM_PORT, "1111");
    assert.equal(process.env.ENGRAM_PROJECT, "from-process");
    assert.equal(process.env.OTHER, undefined);
});

test("loadEnvFiles ignores missing env files", async () => {
    clearEngramEnv();
    const root = await mkdtemp(path.join(tmpdir(), "semantic-graph-env-missing-"));
    await loadEnvFiles({ cwd: root, userDir: path.join(root, "missing-user") });
    assert.equal(process.env.ENGRAM_URL, undefined);
});
