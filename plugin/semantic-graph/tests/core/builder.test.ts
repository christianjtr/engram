import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSemanticGraph } from "../../src/core/builder.ts";
import { EngramObservation, EngramRelation, EngramSession } from "../../src/types.ts";

describe("SemanticGraphBuilder", () => {
    const mockObservations: EngramObservation[] = [
        {
            id: 1,
            sync_id: "obs-1",
            session_id: "sess-1",
            type: "convention",
            title: "Use Conventional Commits",
            content: "Commit messages must follow conventional commits format.",
            scope: "project",
            topic_key: "git/commits",
            revision_count: 1,
            created_at: "2026-09-17T10:00:00Z",
            updated_at: "2026-09-17T10:00:00Z",
        },
        {
            id: 2,
            sync_id: "obs-2",
            session_id: "sess-1",
            type: "architecture",
            title: "Thin Adapters in TS",
            content: "Adapters in plugin/ must remain thin and communicate via HTTP.",
            scope: "project",
            topic_key: "architecture/plugins",
            revision_count: 2,
            created_at: "2026-09-17T10:05:00Z",
            updated_at: "2026-09-17T10:05:00Z",
        },
        {
            id: 3,
            sync_id: "obs-3",
            session_id: "sess-1",
            type: "decision",
            title: "Legacy ExecSync Runner",
            content: "Legacy shell runner using execSync.",
            scope: "project",
            topic_key: "architecture/plugins",
            review_after: "2025-01-01T00:00:00Z", // Past date -> Stale!
            revision_count: 1,
            created_at: "2025-01-01T10:00:00Z",
            updated_at: "2025-01-01T10:00:00Z",
        },
    ];

    const mockGlobalObservations: EngramObservation[] = [
        {
            id: 101,
            sync_id: "global-1",
            session_id: "sess-global",
            type: "convention",
            title: "Global Code Hygiene",
            content: "Keep source files focused and eliminate unused imports.",
            scope: "global",
            revision_count: 1,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
        },
    ];

    const mockSessions: EngramSession[] = [
        {
            id: "sess-1",
            project: "engram",
            directory: "/workspaces/engram",
            started_at: "2026-09-17T09:00:00Z",
            ended_at: "2026-09-17T10:30:00Z",
            summary: "Implemented graph core",
        },
    ];

    const mockRelations: EngramRelation[] = [
        {
            sync_id: "rel-1",
            source_id: "obs-2",
            target_id: "obs-3",
            relation: "supersedes",
            reason: "HTTP client supersedes legacy execSync runner",
            judgment_status: "judged",
        },
    ];

    it("assembles root context nodes and inheritance edge", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            globalObservations: mockGlobalObservations,
        });

        const rootContext = graph.nodes.find((n) => n.id === "global:context");
        const projectRoot = graph.nodes.find((n) => n.id === "project:engram");
        assert.ok(rootContext);
        assert.ok(projectRoot);

        const inheritsEdge = graph.edges.find(
            (e) => e.source === "project:engram" && e.target === "global:context" && e.relation === "INHERITS"
        );
        assert.ok(inheritsEdge);
    });

    it("creates topic cluster nodes and groups observations correctly", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            globalObservations: mockGlobalObservations,
        });

        // 2 active observations: git/commits and architecture/plugins
        const topicCommits = graph.nodes.find((n) => n.id === "topic:git/commits");
        const topicArchitecture = graph.nodes.find((n) => n.id === "topic:architecture/plugins");
        assert.ok(topicCommits);
        assert.ok(topicArchitecture);

        // Topic should belong to project
        const topicEdge = graph.edges.find((e) => e.source === "topic:git/commits" && e.target === "project:engram");
        assert.ok(topicEdge);
        assert.equal(topicEdge.relation, "BELONGS_TO");

        // Obs 1 should belong to git/commits topic
        const obs1Edge = graph.edges.find((e) => e.source === "obs:1" && e.target === "topic:git/commits");
        assert.ok(obs1Edge);
        assert.equal(obs1Edge.relation, "BELONGS_TO");
    });

    it("excludes stale observations by default and includes them when requested", () => {
        const defaultGraph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
        });

        assert.equal(defaultGraph.nodes.some((n) => n.id === "obs:3"), false);
        assert.equal(defaultGraph.slice.staleCount, 1);
        assert.equal(defaultGraph.slice.activeCount, 2);

        const staleGraph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            options: { includeStale: true },
        });

        const staleNode = staleGraph.nodes.find((n) => n.id === "obs:3");
        assert.ok(staleNode);
        assert.equal(staleNode.lifecycle, "stale");
    });

    it("respects globalLimit slicing", () => {
        const withGlobals = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            globalObservations: mockGlobalObservations,
            options: { globalLimit: 1 },
        });
        assert.equal(withGlobals.slice.globalRulesInherited, 1);

        const zeroGlobals = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            globalObservations: mockGlobalObservations,
            options: { globalLimit: 0 },
        });
        assert.equal(zeroGlobals.slice.globalRulesInherited, 0);
        assert.equal(zeroGlobals.nodes.some((n) => n.id === "obs:global:101"), false);
    });

    it("links sessions and observations when includeSessions is enabled", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            sessions: mockSessions,
            options: { includeSessions: true },
        });

        const sessionNode = graph.nodes.find((n) => n.id === "session:sess-1");
        assert.ok(sessionNode);
        assert.equal(sessionNode.status, "completed");

        const producedInEdge = graph.edges.find(
            (e) => e.source === "obs:1" && e.target === "session:sess-1" && e.relation === "PRODUCED_IN"
        );
        assert.ok(producedInEdge);
    });

    it("builds semantic relation edges between observations", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            relations: mockRelations,
            options: { includeStale: true }, // Obs 3 is stale, so include it to map relation
        });

        const relationEdge = graph.edges.find(
            (e) => e.source === "obs:2" && e.target === "obs:3" && e.relation === "SUPERSEDES"
        );
        assert.ok(relationEdge);
        assert.equal(relationEdge.reason, "HTTP client supersedes legacy execSync runner");
    });

    it("computes accurate slice metadata", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations,
            globalObservations: mockGlobalObservations,
        });

        assert.equal(graph.slice.project, "engram");
        assert.equal(graph.slice.totalObservations, 3);
        assert.equal(graph.slice.activeCount, 2);
        assert.equal(graph.slice.staleCount, 1);
        assert.equal(graph.slice.globalRulesInherited, 1);
        assert.equal(graph.slice.topicsCount, 2);
    });
});
