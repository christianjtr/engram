import fs from "fs";
import { randomUUID } from "crypto";
import * as EngramServices from "../services/engram";
import { buildSemanticGraph } from "../core/assembler";
import { getSemanticGraphPath, ensureConfigDir } from "../config";
import { getCurrentProjectName } from "../utils/helpers";
import type { EngramObservation, EngramSession, GraphBuildOptions } from "../types";

// ─── Data Fetching ───────────────────────────────────────────────────────────

/**
 * Fetches all necessary live data from the Engram HTTP server.
 * Purely handles I/O and data resolution, without transforming the domain.
 */
export async function fetchEngramData(options?: GraphBuildOptions) {
    const isAllProjects = Boolean(options?.all);
    const projectName = isAllProjects ? "all" : (options?.project?.trim() || await getCurrentProjectName());

    const selection = {
        project: isAllProjects ? undefined : projectName,
        allProjects: isAllProjects
    };

    const [exportData, conflicts] = await Promise.all([
        EngramServices.fetchExport(selection),
        EngramServices.fetchConflicts(selection),
    ]);

    let globalObservations: EngramObservation[] = [];
    let globalSessions: EngramSession[] = [];

    if (options?.globalLimit === "all") {
        const allData = isAllProjects ? exportData : await EngramServices.fetchExport({ allProjects: true });
        globalObservations = allData.observations.filter((obs) => obs.scope === "global");
        globalSessions = allData.sessions;
    } else {
        const limit = options?.globalLimit ?? 20;
        globalObservations = await EngramServices.fetchGlobalObservations(limit);
    }

    return {
        projectName,
        observations: exportData.observations,
        globalObservations,
        globalSessions,
        sessions: exportData.sessions,
        relations: conflicts,
        options,
    };
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

/**
 * Orchestrates the full pipeline: Fetch live data -> Build graph -> Persist to disk.
 */
export async function runGenerateGraphAction(options?: GraphBuildOptions & { minify?: boolean }) {
    // 1. Fetch
    const rawData = await fetchEngramData(options);

    // 2. Build
    const graph = buildSemanticGraph(rawData);

    // 3. Persist
    const projectName = graph.slice.project;
    const graphPath = getSemanticGraphPath(projectName);
    const content = options?.minify ? JSON.stringify(graph) : JSON.stringify(graph, null, 2);

    ensureConfigDir();

    const tempPath = `${graphPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
        await fs.promises.writeFile(tempPath, content, "utf-8");
        await fs.promises.rename(tempPath, graphPath);
    } catch (error) {
        await fs.promises.unlink(tempPath).catch(() => undefined);
        throw error;
    }

    return {
        projectName,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        slice: graph.slice,
        graphPath,
    };
}
