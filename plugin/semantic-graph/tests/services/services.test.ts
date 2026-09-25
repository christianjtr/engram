import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MAX_CONFLICT_RELATIONS } from "../../src/config";
import {
    fetchConflicts,
    fetchExport,
    fetchGlobalObservations,
    getCurrentProjectName,
} from "../../src/services/engram/services";
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
        scope,
        revision_count: 1,
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    };
}

function relation(id: number) {
    return {
        id,
        sync_id: `rel-${id}`,
        relation: "related",
        judgment_status: "judged",
        source_id: "sync-1",
        source_title: "A",
        target_id: "sync-2",
        target_title: "B",
        created_at: "2026-09-20T00:00:00Z",
        updated_at: "2026-09-20T00:00:00Z",
    };
}

test("getCurrentProjectName uses ENGRAM_PROJECT when set", async () => {
    clearEngramEnv();
    process.env.ENGRAM_PROJECT = "from-env";
    mockFetch(() => {
        throw new Error("fetch should not run");
    });

    assert.equal(await getCurrentProjectName(), "from-env");
});

test("getCurrentProjectName reads /project/current and sends cwd", async () => {
    clearEngramEnv();
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse({ project: "engram" });
    });

    assert.equal(await getCurrentProjectName(), "engram");
    assert.equal(requested?.pathname, "/project/current");
    assert.equal(requested?.searchParams.get("cwd"), process.cwd());
});

test("getCurrentProjectName throws when discovery fails", async () => {
    clearEngramEnv();
    mockFetch(() => jsonResponse({ error_hint: "ambiguous project" }));

    await assert.rejects(
        () => getCurrentProjectName(),
        /Project discovery failed: ambiguous project/,
    );
});

test("fetchExport sends project selector and parses payload", async () => {
    clearEngramEnv();
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse({
            version: "1",
            exported_at: "2026-09-20T00:00:00Z",
            observations: [observation(1)],
            sessions: [],
        });
    });

    const payload = await fetchExport({ project: "engram" });
    assert.equal(payload.observations.length, 1);
    assert.equal(requested?.pathname, "/export");
    assert.equal(requested?.searchParams.get("project"), "engram");
    assert.equal(requested?.searchParams.has("all_projects"), false);
});

test("fetchExport sends all_projects and defaults missing collections", async () => {
    clearEngramEnv();
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse({ version: "1", exported_at: "2026-09-20T00:00:00Z" });
    });

    const payload = await fetchExport({ allProjects: true });
    assert.deepEqual(payload.observations, []);
    assert.deepEqual(payload.sessions, []);
    assert.equal(requested?.searchParams.get("all_projects"), "true");
    assert.equal(requested?.searchParams.has("project"), false);
});

test("fetchGlobalObservations returns empty array when limit is 0", async () => {
    clearEngramEnv();
    mockFetch(() => {
        throw new Error("fetch should not run");
    });
    assert.deepEqual(await fetchGlobalObservations(0), []);
});

test("fetchGlobalObservations rejects invalid limits", async () => {
    await assert.rejects(
        () => fetchGlobalObservations(-1),
        /Global observation limit must be a non-negative integer/,
    );
});

test("fetchGlobalObservations requests global scope across projects", async () => {
    clearEngramEnv();
    let requested: URL | undefined;
    mockFetch((url) => {
        requested = url;
        return jsonResponse([observation(9, "global")]);
    });

    const result = await fetchGlobalObservations(15);
    assert.equal(result[0]?.id, 9);
    assert.equal(requested?.pathname, "/observations");
    assert.equal(requested?.searchParams.get("all_projects"), "true");
    assert.equal(requested?.searchParams.get("scope"), "global");
    assert.equal(requested?.searchParams.get("limit"), "15");
    assert.equal(requested?.searchParams.get("sort"), "created_at:desc");
});

test("fetchConflicts paginates until total is reached", async () => {
    clearEngramEnv();
    const offsets: number[] = [];
    mockFetch((url) => {
        const offset = Number(url.searchParams.get("offset") ?? 0);
        offsets.push(offset);
        if (offset === 0) {
            return jsonResponse({
                relations: [relation(1), relation(2)],
                total: 3,
                limit: 500,
                offset: 0,
            });
        }
        return jsonResponse({
            relations: [relation(3)],
            total: 3,
            limit: 500,
            offset: 2,
        });
    });

    const relations = await fetchConflicts({ project: "engram" });
    assert.equal(relations.length, 3);
    assert.deepEqual(offsets, [0, 2]);
});

test("fetchConflicts throws when total exceeds the safety cap", async () => {
    clearEngramEnv();
    mockFetch(() =>
        jsonResponse({
            relations: [],
            total: MAX_CONFLICT_RELATIONS + 1,
            limit: 500,
            offset: 0,
        }),
    );

    await assert.rejects(() => fetchConflicts(), /too many conflict relations/);
});

test("fetchConflicts throws when total changes during pagination", async () => {
    clearEngramEnv();
    mockFetch((url) => {
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (offset === 0) {
            return jsonResponse({
                relations: [relation(1)],
                total: 2,
                limit: 500,
                offset: 0,
            });
        }
        return jsonResponse({
            relations: [relation(2)],
            total: 9,
            limit: 500,
            offset: 1,
        });
    });

    await assert.rejects(
        () => fetchConflicts(),
        /Conflict relations total changed during pagination/,
    );
});

test("fetchConflicts throws when pagination ends before total", async () => {
    clearEngramEnv();
    mockFetch((url) => {
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (offset === 0) {
            return jsonResponse({
                relations: [relation(1)],
                total: 4,
                limit: 500,
                offset: 0,
            });
        }
        return jsonResponse({
            relations: [],
            total: 4,
            limit: 500,
            offset: 1,
        });
    });

    await assert.rejects(
        () => fetchConflicts(),
        /Incomplete conflict pagination: received 1 relations but expected 4/,
    );
});

test("fetchConflicts rejects invalid server envelopes", async () => {
    clearEngramEnv();
    mockFetch(() => jsonResponse({ relations: [] }));

    await assert.rejects(() => fetchConflicts(), /Invalid \/conflicts response from Engram server/);
});
