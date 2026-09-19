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

    it("removes deleted project and global observations before counts, limits, and type discovery", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: [
                mockObservations[0],
                { ...mockObservations[1], type: "deleted-active", deleted_at: "2026-09-18 00:00:00" },
                { ...mockObservations[2], type: "deleted-stale", deleted_at: "2026-09-18 00:00:00" },
            ],
            globalObservations: [
                { ...mockGlobalObservations[0], type: "deleted-global", deleted_at: "2026-09-18 00:00:00" },
                { ...mockGlobalObservations[0], id: 102, sync_id: "global-2", deleted_at: null },
            ],
            relations: [{ ...mockRelations[0], source_id: "obs-1", target_id: "obs-2" }],
            options: { includeStale: true, globalLimit: 1 },
        });

        assert.equal(graph.slice.totalObservations, 1);
        assert.equal(graph.slice.activeCount, 1);
        assert.equal(graph.slice.staleCount, 0);
        assert.equal(graph.slice.globalRulesTotal, 1);
        assert.equal(graph.slice.globalRulesInherited, 1);
        assert.deepEqual(graph.nodes.filter((n) => n.category === "OBSERVATION").map((n) => n.id), [
            "obs:global:102", "obs:1",
        ]);
        for (const type of ["deleted-active", "deleted-stale", "deleted-global"]) {
            assert.equal(Object.hasOwn(graph.types, type), false);
        }
        assert.equal(graph.edges.some((e) => e.metadata?.sync_id === "rel-1"), false);
    });

    it("uses one reference instant for global filtering, lifecycles, counts, and generatedAt", (t) => {
        const now = Date.parse("2026-09-19T12:00:00Z");
        let clockReads = 0;
        // Advance each clock read so a second snapshot crosses the deadline.
        t.mock.method(globalThis, "Date", class extends Date {
            constructor(value?: string | number) {
                super(value ?? now + clockReads++ * 1000);
            }
        });
        const deadline = "2026-09-19T12:00:00.500Z";
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: [{ ...mockObservations[0], review_after: deadline }],
            globalObservations: [{ ...mockGlobalObservations[0], review_after: deadline }],
        });

        assert.equal(clockReads, 1);
        assert.equal(graph.slice.generatedAt, "2026-09-19T12:00:00.000Z");
        assert.equal(graph.slice.activeCount, 1);
        assert.equal(graph.slice.staleCount, 0);
        assert.equal(graph.slice.globalRulesInherited, 1);
        assert.deepEqual(graph.nodes.filter((n) => n.category === "OBSERVATION").map((n) => n.lifecycle), [
            "active", "active",
        ]);
    });

    it("keeps legacy single-project topic IDs and source provenance without rewriting inherited scope", () => {
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: [
                { ...mockObservations[0], project: "source-project" },
                { ...mockObservations[1], session_id: "missing-session" },
            ],
            globalObservations: [{ ...mockGlobalObservations[0], project: "shared-rules", scope: "personal" }],
        });
        assert.equal(graph.nodes.find((n) => n.id === "obs:1")?.metadata?.project, "source-project");
        assert.equal(graph.nodes.find((n) => n.id === "obs:2")?.metadata?.project, "engram");
        assert.ok(graph.nodes.some((n) => n.id === "topic:git/commits"));
        const inherited = graph.nodes.find((n) => n.id === "obs:global:101");
        assert.equal(inherited?.metadata?.project, "shared-rules");
        assert.equal(inherited?.scope, "personal");
    });

    it("infers missing observation projects from sessions even when sessions are hidden", () => {
        for (const all of [false, true]) {
            const graph = buildSemanticGraph({
                projectName: "current-project",
                observations: [{ ...mockObservations[0], project: null }],
                globalObservations: [{ ...mockGlobalObservations[0], session_id: "sess-1" }],
                sessions: mockSessions,
                options: { all },
            });
            assert.equal(graph.nodes.find((n) => n.id === "obs:1")?.metadata?.project, "engram");
            assert.equal(graph.nodes.find((n) => n.id === "obs:global:101")?.metadata?.project, "engram");
            assert.equal(graph.nodes.some((n) => n.category === "SESSION"), false);
        }
    });

    it("builds actual project roots and collision-safe topic namespaces in all-project mode", () => {
        const projectsAndTopics = [
            ["alpha", "shared/topic"],
            ["beta", "shared/topic"],
            ["a:b", "c"],
            ["a", "b:c"],
            ['a","b', "c/%"],
            ["a", 'b","c/%'],
        ];
        const graph = buildSemanticGraph({
            projectName: "All Projects",
            observations: projectsAndTopics.map(([project, topic_key], i) => ({
                ...mockObservations[0], id: i + 1, sync_id: `obs-${i + 1}`, project, topic_key,
            })),
            sessions: mockSessions,
            options: { all: true },
        });
        const roots = graph.nodes.filter((n) => n.category === "PROJECT");
        assert.deepEqual(roots.map((n) => n.metadata?.project).sort(), [...new Set(projectsAndTopics.map(([p]) => p))].sort());
        assert.equal(graph.nodes.some((n) => n.id === "project:All Projects"), false);
        assert.equal(graph.slice.topicsCount, projectsAndTopics.length);
        assert.equal(graph.slice.isExhaustive, false);
        for (const [i, [project, topic]] of projectsAndTopics.entries()) {
            const topicId = `topic:${JSON.stringify([project, topic])}`;
            assert.equal(graph.nodes.find((n) => n.id === topicId)?.metadata?.project, project);
            assert.equal(graph.nodes.find((n) => n.id === `obs:${i + 1}`)?.metadata?.project, project);
            assert.ok(graph.edges.some((e) => e.source === `obs:${i + 1}` && e.target === topicId));
            assert.ok(graph.edges.some((e) => e.source === topicId && e.target === `project:${project}`));
            assert.ok(graph.edges.some((e) => e.source === `project:${project}` && e.target === "global:context"));
        }
        const ids = new Set(graph.nodes.map((n) => n.id));
        assert.equal(ids.size, graph.nodes.length);
        assert.ok(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target)));
    });

    it("uses an explicit unknown-project fallback in all mode and retains session provenance in both modes", () => {
        for (const all of [false, true]) {
            const fallback = all ? "unknown-project" : "current-project";
            const graph = buildSemanticGraph({
                projectName: "current-project",
                observations: [
                    { ...mockObservations[0], project: null },
                    { ...mockObservations[1], project: "", session_id: "missing-session" },
                ],
                globalObservations: mockGlobalObservations,
                sessions: [mockSessions[0], { ...mockSessions[0], id: "unknown-session", project: "" }],
                options: { all, includeSessions: true },
            });
            assert.equal(graph.nodes.find((n) => n.id === "obs:1")?.metadata?.project, "engram");
            assert.equal(graph.nodes.find((n) => n.id === "obs:2")?.metadata?.project, fallback);
            assert.equal(graph.nodes.find((n) => n.id === "obs:global:101")?.metadata?.project, "unknown-project");
            assert.equal(graph.nodes.find((n) => n.id === "session:sess-1")?.metadata?.project, "engram");
            assert.equal(graph.nodes.find((n) => n.id === "session:unknown-session")?.metadata?.project, fallback);
            assert.ok(graph.edges.some((e) => e.source === "session:sess-1" && e.target === "project:engram"));
            assert.ok(graph.edges.some((e) => e.source === "session:unknown-session" && e.target === `project:${fallback}`));
            assert.ok(graph.edges.some((e) => e.source === "obs:1" && e.target === "session:sess-1"));
            const ids = new Set(graph.nodes.map((n) => n.id));
            assert.ok(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target)));
        }
    });

    it("only renders judged relations and preserves original verbs alongside mapped categories", () => {
        const verbs = ["supersedes", "conflicts_with", "related", "compatible", "scoped", "not_conflict", "Custom_Relation"];
        const statuses = ["judged", "pending", "orphaned", "ignored", "", "unknown"];
        const graph = buildSemanticGraph({
            projectName: "engram",
            observations: mockObservations.slice(0, 2),
            relations: statuses.flatMap((judgment_status) => verbs.map((relation) => ({
                sync_id: `${judgment_status}:${relation}`,
                source_id: "obs-1", target_id: "obs-2", relation, judgment_status,
            }))),
        });
        const relations = graph.edges.filter((e) => e.metadata?.sync_id);
        assert.equal(relations.length, verbs.length);
        for (const [i, verb] of verbs.entries()) {
            assert.equal(relations[i].metadata?.judgment_status, "judged");
            assert.equal(relations[i].metadata?.relation, verb);
            assert.equal(relations[i].relation, i === 0 ? "SUPERSEDES" : i === 1 ? "CONFLICTS_WITH" : "RELATED_TO");
        }
    });

    it("omits filtered relation endpoints without dangling edges or claiming all-mode exhaustiveness", (t) => {
        t.mock.method(globalThis, "Date", class extends Date {
            constructor(value?: string | number) {
                super(value ?? "2026-09-19T12:00:00Z");
            }
        });
        const observations = [
            { ...mockObservations[0], project: "alpha", topic_key: "keep" },
            { ...mockObservations[1], project: "beta", topic_key: "other", type: "convention" },
            { ...mockObservations[2], project: "beta", topic_key: "keep", type: "convention" },
            { ...mockObservations[0], id: 4, sync_id: "obs-4", topic_key: "keep", type: "bugfix" },
            { ...mockObservations[0], id: 5, sync_id: "obs-5", topic_key: "keep", deleted_at: "2026-09-18 00:00:00" },
        ];
        const graph = buildSemanticGraph({
            projectName: "All Projects",
            observations,
            globalObservations: [
                { ...mockGlobalObservations[0], id: 103, sync_id: "global-stale", review_after: "2025-01-01 00:00:00" },
                { ...mockGlobalObservations[0], id: 104, sync_id: "global-type", type: "bugfix" },
                mockGlobalObservations[0],
                { ...mockGlobalObservations[0], id: 102, sync_id: "global-2" },
            ],
            sessions: mockSessions,
            relations: ["obs-2", "obs-3", "obs-4", "obs-5", "global-1", "global-2", "global-stale", "global-type", "missing"].map((target_id) => ({
                ...mockRelations[0], sync_id: `rel:${target_id}`, source_id: "obs-1", target_id,
            })),
            options: { all: true, includeSessions: true, topicFilter: "keep", typeFilter: ["convention"], globalLimit: 1 },
        });
        assert.deepEqual(graph.nodes.filter((n) => n.category === "OBSERVATION").map((n) => n.id), ["obs:global:101", "obs:1"]);
        const relations = graph.edges.filter((e) => e.metadata?.sync_id);
        assert.equal(relations.length, 1);
        assert.equal(relations[0].target, "obs:global:101");
        const ids = new Set(graph.nodes.map((n) => n.id));
        assert.ok(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target)));
        assert.equal(graph.slice.isExhaustive, false);
    });
});
