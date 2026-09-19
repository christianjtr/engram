import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EngramHttpClient } from "../../src/core/client.ts";

const relation = {
    sync_id: "rel-1", source_id: "obs-1", target_id: "obs-2",
    relation: "supersedes", judgment_status: "judged",
};

describe("Engram HTTP contracts", () => {
    it("sends the caller cwd for discovery", async (t) => {
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            assert.equal(url.pathname, "/project/current");
            assert.equal(url.searchParams.get("cwd"), process.cwd());
            return Response.json({ project: "caller-project" });
        });
        assert.equal(await new EngramHttpClient().resolveCurrentProject(), "caller-project");
    });

    it("rejects ambiguous discovery rather than guessing a project", async (t) => {
        t.mock.method(globalThis, "fetch", async () => Response.json({
            project: "", available_projects: ["alpha", "beta"], error_hint: "ambiguous project",
        }));
        await assert.rejects(new EngramHttpClient().resolveCurrentProject(), /ambiguous.*--project/i);
    });

    it("traverses conflict envelopes beyond 500 rows using the server page size", async (t) => {
        const offsets: number[] = [];
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            assert.equal(url.pathname, "/conflicts");
            assert.equal(url.searchParams.get("project"), "alpha / beta");
            assert.equal(url.searchParams.get("status"), "judged");
            assert.equal(url.searchParams.get("limit"), "500");
            assert.equal(url.searchParams.has("all_projects"), false);
            const offset = Number(url.searchParams.get("offset"));
            offsets.push(offset);
            const count = Math.min(200, 503 - offset);
            return Response.json({ total: 503, limit: 200, offset,
                relations: Array.from({ length: count }, (_, i) => ({ ...relation, sync_id: `rel-${offset + i}` })),
            });
        });
        const relations = await new EngramHttpClient().fetchConflicts({ project: "alpha / beta" });
        assert.equal(relations.length, 503);
        assert.equal(new Set(relations.map((r) => r.sync_id)).size, 503);
        assert.deepEqual(offsets, [0, 200, 400]);
    });

    it("distinguishes all-project mode from a project literally named all", async (t) => {
        const queries: URLSearchParams[] = [];
        t.mock.method(globalThis, "fetch", async (input: string) => {
            queries.push(new URL(input).searchParams);
            return Response.json({ relations: null, total: 0, limit: 500, offset: 0 });
        });
        const client = new EngramHttpClient();
        assert.deepEqual(await client.fetchConflicts({ allProjects: true }), []);
        assert.deepEqual(await client.fetchConflicts({ project: "all" }), []);
        assert.equal(queries[0].get("all_projects"), "true");
        assert.equal(queries[0].has("project"), false);
        assert.equal(queries[1].get("project"), "all");
        assert.equal(queries[1].has("all_projects"), false);
    });

    it("rejects a truncated page instead of returning an apparently complete graph", async (t) => {
        t.mock.method(globalThis, "fetch", async () => Response.json({
            total: 3, limit: 500, offset: 0, relations: [],
        }));
        await assert.rejects(new EngramHttpClient().fetchConflicts(), /incomplete|pagination/i);
    });

    it("rejects invalid conflict envelopes and records", async (t) => {
        for (const payload of [[], {}, null, { total: 1, limit: 500, offset: 0, relations: [{}] }]) {
            const mock = t.mock.method(globalThis, "fetch", async () => Response.json(payload));
            await assert.rejects(new EngramHttpClient().fetchConflicts(), /invalid.*conflicts/i);
            mock.mock.restore();
        }
    });

    it("rejects changing totals and duplicate records during pagination", async (t) => {
        for (const changeTotal of [true, false]) {
            let page = 0;
            const mock = t.mock.method(globalThis, "fetch", async () => Response.json({
                total: changeTotal && page > 0 ? 3 : 2, limit: 1, offset: page++, relations: [relation],
            }));
            await assert.rejects(new EngramHttpClient().fetchConflicts(), /changing.*pagination/i);
            mock.mock.restore();
        }
    });

    it("propagates HTTP failures from discovery, globals and conflicts", async (t) => {
        t.mock.method(globalThis, "fetch", async () => Response.json(
            { code: "unknown_project", error: "No such project" }, { status: 404 },
        ));
        const client = new EngramHttpClient();
        for (const request of [
            () => client.resolveCurrentProject(),
            () => client.fetchGlobalObservations(),
            () => client.fetchConflicts(),
        ]) {
            await assert.rejects(request(), /HTTP 404.*unknown_project/);
        }
    });

    it("propagates network and malformed JSON failures", async (t) => {
        const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
        await assert.rejects(new EngramHttpClient().fetchConflicts(), /offline/);
        mock.mock.restore();
        t.mock.method(globalThis, "fetch", async () => new Response("not JSON"));
        await assert.rejects(new EngramHttpClient().fetchGlobalObservations());
    });

    it("sets authentication and timeout while preserving empty observation responses", async (t) => {
        t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
            const url = new URL(input);
            assert.equal(url.searchParams.get("scope"), "global");
            assert.equal(url.searchParams.get("all_projects"), "true");
            assert.equal(url.searchParams.get("limit"), "20");
            assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-token");
            assert.ok(init.signal instanceof AbortSignal);
            return Response.json(null);
        });
        assert.deepEqual(await new EngramHttpClient({ token: "test-token" }).fetchGlobalObservations(), []);
    });

    it("propagates an aborted request rather than returning an empty result", async (t) => {
        t.mock.method(globalThis, "fetch", (_input: string, init: RequestInit) => new Promise((_resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("request did not abort")), 1000);
            init.signal!.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(init.signal!.reason);
            }, { once: true });
        }));
        await assert.rejects(new EngramHttpClient({ timeoutMs: 5 }).fetchConflicts(), /timeout/i);
    });

    it("skips disabled globals and rejects invalid limits or observation envelopes", async (t) => {
        const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ unexpected: [] }));
        const client = new EngramHttpClient();
        assert.deepEqual(await client.fetchGlobalObservations(0), []);
        assert.equal(fetchMock.mock.callCount(), 0);
        await assert.rejects(client.fetchGlobalObservations(-1), /limit/i);
        await assert.rejects(client.fetchGlobalObservations(), /invalid.*observations/i);
    });

    it("accepts native null export collections, but rejects missing or invalid collections", async (t) => {
        const mock = t.mock.method(globalThis, "fetch", async () => Response.json({
            version: "1", exported_at: "2026-09-19T00:00:00Z", observations: null, sessions: null, prompts: null,
        }));
        const result = await new EngramHttpClient().fetchExport({ project: "alpha" });
        assert.deepEqual(result.observations, []);
        assert.deepEqual(result.sessions, []);
        mock.mock.restore();
        t.mock.method(globalThis, "fetch", async () => Response.json({ observations: {}, sessions: [] }));
        await assert.rejects(new EngramHttpClient().fetchExport(), /invalid.*export/i);
    });
});
