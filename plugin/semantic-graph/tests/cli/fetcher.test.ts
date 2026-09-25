import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchEngramData } from "../../src/cli/fetcher";
import { MAX_GLOBAL_LIMIT } from "../../src/config";
import { clearEngramEnv, jsonResponse, mockFetch, restoreFetchEnv } from "../helpers/mockFetch";

afterEach(() => {
    restoreFetchEnv();
});

function observation(id: number, scope: "project" | "global" = "project") {
    return {
        id,
        sync_id: `sync-${id}`,
        session_id: "sess-1",
        type: "decision",
        title: `Obs ${id}`,
        content: "content",
        project: "engram",
        scope,
        revision_count: 1,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    };
}

const emptyConflicts = {
    relations: [],
    total: 0,
    limit: 500,
    offset: 0,
};

test("fetchEngramData loads current project, export, conflicts, and globals", async () => {
    clearEngramEnv();
    const paths: string[] = [];
    mockFetch((url) => {
        paths.push(`${url.pathname}?${url.searchParams.toString()}`);
        if (url.pathname === "/project/current") {
            return jsonResponse({ project: "engram" });
        }
        if (url.pathname === "/export") {
            return jsonResponse({
                version: "1",
                exported_at: "2026-09-20T00:00:00Z",
                observations: [observation(1)],
                sessions: [
                    {
                        id: "sess-1",
                        project: "engram",
                        directory: "/tmp",
                        started_at: "2026-09-20T00:00:00Z",
                    },
                ],
            });
        }
        if (url.pathname === "/conflicts") {
            return jsonResponse(emptyConflicts);
        }
        if (url.pathname === "/observations") {
            assert.equal(url.searchParams.get("limit"), "15");
            return jsonResponse([observation(99, "global")]);
        }
        return jsonResponse({}, 404);
    });

    const data = await fetchEngramData();
    assert.equal(data.projectName, "engram");
    assert.equal(data.observations.length, 1);
    assert.equal(data.globalObservations[0]?.id, 99);
    assert.ok(paths.some((p) => p.startsWith("/project/current?")));
    assert.ok(paths.some((p) => p.startsWith("/export?")));
    assert.ok(paths.some((p) => p.startsWith("/conflicts?")));
    assert.ok(paths.some((p) => p.startsWith("/observations?")));
});

test("fetchEngramData in all-projects mode skips globals endpoint", async () => {
    clearEngramEnv();
    const paths: string[] = [];
    mockFetch((url) => {
        paths.push(url.pathname);
        if (url.pathname === "/export") {
            assert.equal(url.searchParams.get("all_projects"), "true");
            return jsonResponse({
                version: "1",
                exported_at: "2026-09-20T00:00:00Z",
                observations: [observation(1), observation(2, "global")],
            });
        }
        if (url.pathname === "/conflicts") {
            return jsonResponse(emptyConflicts);
        }
        throw new Error(`unexpected path ${url.pathname}`);
    });

    const data = await fetchEngramData({ all: true });
    assert.equal(data.projectName, "all");
    assert.equal(data.globalObservations.length, 1);
    assert.equal(data.globalObservations[0]?.id, 2);
    assert.equal(paths.includes("/project/current"), false);
    assert.equal(paths.includes("/observations"), false);
});

test("fetchEngramData uses MAX_GLOBAL_LIMIT when allGlobals is set", async () => {
    clearEngramEnv();
    process.env.ENGRAM_PROJECT = "engram";
    mockFetch((url) => {
        if (url.pathname === "/export") {
            return jsonResponse({
                version: "1",
                exported_at: "2026-09-20T00:00:00Z",
                observations: [],
            });
        }
        if (url.pathname === "/conflicts") {
            return jsonResponse(emptyConflicts);
        }
        if (url.pathname === "/observations") {
            assert.equal(url.searchParams.get("limit"), String(MAX_GLOBAL_LIMIT));
            return jsonResponse([]);
        }
        throw new Error(`unexpected path ${url.pathname}`);
    });

    const data = await fetchEngramData({ allGlobals: true });
    assert.deepEqual(data.globalObservations, []);
});

test("fetchEngramData wraps upstream errors", async () => {
    clearEngramEnv();
    mockFetch(() => {
        throw new Error("offline");
    });

    await assert.rejects(
        () => fetchEngramData(),
        /Failed to fetch graph data from Engram: Failed to reach Engram server/,
    );
});
