import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SemanticGraph } from "../../src/types.ts";

it("CLI writes a scoped graph and preserves it when a later fetch fails", { timeout: 20_000 }, async (t) => {
    const home = await mkdtemp(join(tmpdir(), "engram-graph-test-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    const urls: URL[] = [];
    let failConflicts = false;
    const server = createServer((req, res) => {
        const url = new URL(req.url!, "http://localhost");
        urls.push(url);
        res.setHeader("Content-Type", "application/json");
        if (url.pathname === "/project/current") {
            res.end(JSON.stringify({ project: "alpha" }));
        } else if (url.pathname === "/observations") {
            res.end("[]");
        } else if (url.pathname === "/export") {
            res.end(JSON.stringify({
                version: "1", exported_at: "2026-09-19T00:00:00Z", sessions: [], prompts: [],
                observations: [1, 2, 3].map((id) => ({
                    id, sync_id: `obs-${id}`, session_id: "session", project: "alpha", scope: "project",
                    title: `Rule ${id}`, content: "Private guidance", type: "decision", topic_key: "shared",
                    revision_count: 1, created_at: "2026-09-19 00:00:00", updated_at: "2026-09-19 00:00:00",
                    deleted_at: id === 3 ? "2026-09-19 01:00:00" : null,
                })),
            }));
        } else if (url.pathname === "/conflicts" && !failConflicts) {
            res.end(JSON.stringify({ total: 1, limit: 500, offset: 0, relations: [{
                sync_id: "rel-1", source_id: "obs-1", target_id: "obs-2",
                relation: "supersedes", judgment_status: "judged",
            }] }));
        } else {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: "fixture unavailable" }));
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));

    const root = fileURLToPath(new URL("../../", import.meta.url));
    const env = {
        ...process.env, HOME: home, USERPROFILE: home, ENGRAM_PROJECT: "", ENGRAM_HTTP_TOKEN: "",
        ENGRAM_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    };
    const args = ["--import", "tsx", "src/index.ts", "--generate"];
    const execute = promisify(execFile);
    const { stdout } = await execute(process.execPath, args, { cwd: root, env });
    assert.match(stdout, /Graph saved/);
    const output = join(home, ".engram", "semantic-graph", "engram_semantic_graph_alpha.json");
    const contents = await readFile(output, "utf8");
    const graph: SemanticGraph = JSON.parse(contents);
    assert.equal(graph.slice.project, "alpha");
    assert.equal(graph.slice.totalObservations, 2);
    assert.equal(graph.nodes.some((n) => n.id === "obs:3"), false);
    assert.ok(graph.edges.some((e) => e.relation === "SUPERSEDES"));
    assert.equal(urls.find((url) => url.pathname === "/project/current")?.searchParams.get("cwd"), root.replace(/\/$/, ""));
    for (const url of urls.filter((url) => ["/export", "/conflicts"].includes(url.pathname))) {
        assert.equal(url.searchParams.get("project"), "alpha");
    }

    failConflicts = true;
    await assert.rejects(execute(process.execPath, args, { cwd: root, env }), (error: unknown) => {
        const failure = error as Error & { code: number; stderr: string; stdout: string };
        assert.equal(failure.code, 1);
        assert.match(failure.stderr, /HTTP 503.*fixture unavailable/);
        assert.doesNotMatch(failure.stdout, /Graph saved/);
        return true;
    });
    assert.equal(await readFile(output, "utf8"), contents);
});
