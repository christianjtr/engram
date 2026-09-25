import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { assertEngramReady } from "../../src/cli/preflight";
import {
    clearEngramEnv,
    jsonResponse,
    mockFetch,
    restoreFetchEnv,
    textResponse,
} from "../helpers/mockFetch";

afterEach(() => {
    restoreFetchEnv();
});

test("assertEngramReady accepts local Engram /health without sending a token", async () => {
    clearEngramEnv();
    let requested: URL | undefined;
    let auth: string | null = null;
    mockFetch((url, init) => {
        requested = url;
        auth = new Headers(init?.headers).get("Authorization");
        return jsonResponse({
            status: "ok",
            service: "engram",
            version: "2.2.0",
            instance_id: "abc",
        });
    });

    await assertEngramReady();
    assert.equal(requested?.pathname, "/health");
    assert.equal(requested?.origin, "http://127.0.0.1:7437");
    assert.equal(auth, null);
});

test("assertEngramReady uses ENGRAM_URL", async () => {
    clearEngramEnv();
    process.env.ENGRAM_URL = "http://localhost:9000";
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse({ status: "ok", service: "engram" });
    });

    await assertEngramReady();
    assert.equal(requested?.origin, "http://localhost:9000");
});

test("assertEngramReady throws when the daemon is not running", async () => {
    clearEngramEnv();
    mockFetch(() => {
        const error = new Error("fetch failed");
        (error as Error & { cause: { code: string } }).cause = { code: "ECONNREFUSED" };
        throw error;
    });

    await assert.rejects(
        () => assertEngramReady(),
        /Engram HTTP server is not running at http:\/\/127\.0\.0\.1:7437\. Start it with: engram serve/,
    );
});

test("assertEngramReady throws when the probe times out", async () => {
    clearEngramEnv();
    mockFetch(() => {
        throw new Error("The operation was aborted due to timeout");
    });

    await assert.rejects(
        () => assertEngramReady(),
        /Engram at http:\/\/127\.0\.0\.1:7437 did not respond/,
    );
});

test("assertEngramReady throws on non-OK health status", async () => {
    clearEngramEnv();
    mockFetch(() => textResponse("nope", 503));

    await assert.rejects(
        () => assertEngramReady(),
        /Engram at http:\/\/127\.0\.0\.1:7437 is unreachable \(HTTP 503\)/,
    );
});

test("assertEngramReady rejects a non-engram health service", async () => {
    clearEngramEnv();
    mockFetch(() => jsonResponse({ status: "ok", service: "engram-cloud" }));

    await assert.rejects(
        () => assertEngramReady(),
        /Expected local Engram daemon at http:\/\/127\.0\.0\.1:7437, got service "engram-cloud"/,
    );
});

test("assertEngramReady rejects an invalid health payload", async () => {
    clearEngramEnv();
    mockFetch(() => jsonResponse({ status: "degraded", service: "engram" }));

    await assert.rejects(
        () => assertEngramReady(),
        /Engram at http:\/\/127\.0\.0\.1:7437 returned an invalid \/health response/,
    );
});
