import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MAX_ERROR_BODY_LENGTH } from "../../src/config";
import { engramHttpClient } from "../../src/services/engram/httpClient";
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

test("engramHttpClient.get returns JSON and builds query params", async () => {
    clearEngramEnv();
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse({ ok: true });
    });

    const result = await engramHttpClient.get<{ ok: boolean }>("/export", {
        project: "engram",
        empty: "",
        skipped: undefined,
    });

    assert.deepEqual(result, { ok: true });
    assert.ok(requested);
    assert.equal(requested.pathname, "/export");
    assert.equal(requested.searchParams.get("project"), "engram");
    assert.equal(requested.searchParams.has("empty"), false);
    assert.equal(requested.searchParams.has("skipped"), false);
    assert.equal(requested.origin, "http://127.0.0.1:7437");
});

test("engramHttpClient.get sends bearer token when configured", async () => {
    clearEngramEnv();
    process.env.ENGRAM_HTTP_TOKEN = "secret-token";
    let auth: string | null = null;
    mockFetch((_url, init) => {
        const headers = new Headers(init?.headers);
        auth = headers.get("Authorization");
        return jsonResponse({ ok: true });
    });

    await engramHttpClient.get("/project/current");
    assert.equal(auth, "Bearer secret-token");
});

test("engramHttpClient.get uses ENGRAM_URL override", async () => {
    clearEngramEnv();
    process.env.ENGRAM_URL = "http://localhost:9000";
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse({ ok: true });
    });

    await engramHttpClient.get("/export");
    assert.equal(requested?.origin, "http://localhost:9000");
});

test("engramHttpClient.get wraps network failures", async () => {
    clearEngramEnv();
    mockFetch(async () => {
        throw new Error("ECONNREFUSED");
    });

    await assert.rejects(
        () => engramHttpClient.get("/export"),
        /Failed to reach Engram server.*ECONNREFUSED.*engram serve/,
    );
});

test("engramHttpClient.get surfaces HTTP errors and truncates long bodies", async () => {
    clearEngramEnv();
    mockFetch(() => textResponse("x".repeat(MAX_ERROR_BODY_LENGTH + 25), 500));

    await assert.rejects(
        () => engramHttpClient.get("/conflicts"),
        /Engram HTTP 500 \(\/conflicts\): x{1000}\.\.\./,
    );
});
