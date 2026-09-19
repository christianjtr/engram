import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { fetchAndBuildGraph, runStatsAction } from "../../src/cli/actions.ts";
import type { EngramObservation } from "../../src/types.ts";

const observations: EngramObservation[] = [1, 2].map((id) => ({
    id, sync_id: `obs-${id}`, session_id: `sess-${id}`, project: id === 1 ? "alpha" : "beta",
    type: "decision", title: `Decision ${id}`, content: "Guidance", scope: "project",
    topic_key: "shared/topic", revision_count: 1,
    created_at: "2026-09-19 00:00:00", updated_at: "2026-09-19 00:00:00",
}));

function setProjectEnv(t: TestContext, value?: string) {
    const previous = process.env.ENGRAM_PROJECT;
    if (value === undefined) delete process.env.ENGRAM_PROJECT;
    else process.env.ENGRAM_PROJECT = value;
    t.after(() => {
        if (previous === undefined) delete process.env.ENGRAM_PROJECT;
        else process.env.ENGRAM_PROJECT = previous;
    });
}

describe("Graph generation pipeline", () => {
    it("sends explicit all-project selectors and retains separate project topics", async (t) => {
        const paths: string[] = [];
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            paths.push(url.pathname);
            assert.equal(url.searchParams.get("all_projects"), "true");
            assert.equal(url.searchParams.has("project"), false);
            if (url.pathname === "/export") return Response.json({
                version: "1", exported_at: "2026-09-19T00:00:00Z", observations, sessions: [], prompts: [],
            });
            if (url.pathname === "/observations") return Response.json([]);
            assert.equal(url.pathname, "/conflicts");
            return Response.json({ total: 1, limit: 500, offset: 0, relations: [{
                sync_id: "rel-1", source_id: "obs-1", target_id: "obs-2",
                relation: "conflicts_with", judgment_status: "judged",
            }] });
        });
        const graph = await fetchAndBuildGraph({ all: true });
        assert.equal(paths.includes("/project/current"), false);
        assert.deepEqual(graph.nodes.filter((n) => n.category === "PROJECT").map((n) => n.metadata?.project), ["alpha", "beta"]);
        assert.equal(graph.nodes.filter((n) => n.category === "TOPIC").length, 2);
        assert.ok(graph.edges.some((e) => e.relation === "CONFLICTS_WITH"));
    });

    it("honors explicit project, then local env override, without discovery", async (t) => {
        setProjectEnv(t, "env-project");
        let expected = "explicit-project";
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            assert.notEqual(url.pathname, "/project/current");
            assert.equal(url.searchParams.get("project"), expected);
            if (url.pathname === "/export") return Response.json({
                version: "1", exported_at: "2026-09-19T00:00:00Z", observations: [], sessions: [],
            });
            assert.equal(url.pathname, "/conflicts");
            return Response.json({ total: 0, limit: 500, offset: 0, relations: [] });
        });
        assert.equal((await fetchAndBuildGraph({ project: expected, globalLimit: 0 })).slice.project, expected);
        expected = "env-project";
        assert.equal((await fetchAndBuildGraph({ globalLimit: 0 })).slice.project, expected);
    });

    it("does not turn failed or ambiguous discovery into an unknown-project export", async (t) => {
        setProjectEnv(t);
        const request = t.mock.method(globalThis, "fetch", async (input: string) => {
            assert.equal(new URL(input).pathname, "/project/current");
            return Response.json({ project: "", error_hint: "ambiguous project" });
        });
        await assert.rejects(fetchAndBuildGraph(), /--project/);
        assert.equal(request.mock.callCount(), 1);
    });

    it("status uses the same caller-aware project resolution as generation", async (t) => {
        setProjectEnv(t);
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            assert.equal(url.pathname, "/project/current");
            assert.equal(url.searchParams.get("cwd"), process.cwd());
            return Response.json({ project: "actual-project" });
        });
        const status = await runStatsAction();
        assert.equal(status.projectName, "actual-project");
        assert.ok(status.graphPath.endsWith("engram_semantic_graph_actual-project.json"));
    });

    it("globalLimit all uses the complete export rather than a capped observation query", async (t) => {
        let exports = 0;
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            if (url.pathname === "/export") {
                exports++;
                return Response.json({ version: "1", exported_at: "2026-09-19T00:00:00Z", sessions: [],
                    observations: Array.from({ length: 25 }, (_, i) => ({
                        ...observations[0], id: i + 1, sync_id: `global-${i}`, scope: "global",
                    })),
                });
            }
            assert.equal(url.pathname, "/conflicts");
            return Response.json({ total: 0, limit: 500, offset: 0, relations: [] });
        });
        const graph = await fetchAndBuildGraph({ all: true, globalLimit: "all" });
        assert.equal(graph.slice.globalRulesInherited, 25);
        assert.equal(exports, 1);
    });

    it("inherits global provenance from its source sessions without displaying foreign sessions", async (t) => {
        t.mock.method(globalThis, "fetch", async (input: string) => {
            const url = new URL(input);
            if (url.pathname === "/export") {
                const allProjects = url.searchParams.get("all_projects") === "true";
                return Response.json({ version: "1", exported_at: "2026-09-19T00:00:00Z",
                    observations: allProjects ? [{ ...observations[1], project: null, scope: "global" }] : [],
                    sessions: allProjects ? [{
                        id: "sess-2", project: "beta", directory: "/beta", started_at: "2026-09-19 00:00:00",
                    }] : [],
                });
            }
            assert.equal(url.pathname, "/conflicts");
            return Response.json({ total: 0, limit: 500, offset: 0, relations: [] });
        });
        const graph = await fetchAndBuildGraph({ project: "alpha", globalLimit: "all", includeSessions: true });
        assert.equal(graph.nodes.find((n) => n.id === "obs:global:2")?.metadata?.project, "beta");
        assert.equal(graph.nodes.some((n) => n.category === "SESSION"), false);
    });
});
