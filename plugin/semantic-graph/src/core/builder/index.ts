import fs from "fs";
import type { SemanticGraphConfig, GraphLibJson } from "../../types";
import { resolveConfig } from "../../config";
import { DEFAULT_REASONING_MAPPINGS } from "../../config/semantics";
import { fetchEngramData } from "./fetcher";
import { type GraphBuilderContext } from "./context";
import { processSessions, processObservations, processMutations } from "./processors";

export { resolveReasoningRole } from "./reasoning";

export interface SaveGraphOptions {
    /** Whether to minify the JSON output. Defaults to true. */
    minify?: boolean;
}

/**
 * Builds the native Graphlib knowledge graph matching strict GraphLibJson specifications.
 */
export function buildKnowledgeGraph(projectName: string, config?: SemanticGraphConfig): GraphLibJson {
    const activeConfig = resolveConfig(config);
    const rawData = fetchEngramData(projectName);
    const categoryExclusions = activeConfig.category_exclusions || [];
    const mappings = DEFAULT_REASONING_MAPPINGS;

    const ctx: GraphBuilderContext = {
        projectName,
        categoryExclusions,
        nodesList: [],
        edgesList: [],
        seenNodes: new Set<string>(),
        sessionHashMap: new Map<string, string>(),
        obsSyncIdToHash: new Map<string, string>(),
        mappings
    };

    // Filter sessions based on workspace/project filter
    const filteredSessions = (rawData.sessions || []).filter(
        (s: any) => projectName === "all" || String(s.project).toLowerCase() === projectName.toLowerCase()
    );

    // Filter observations to exclude soft-deleted items and match project boundaries
    const filteredObservations = (rawData.observations || []).filter((o: any) => {
        if (o.deleted_at !== null && o.deleted_at !== undefined) return false;
        if (projectName === "all") return true;

        const scope = String(o.scope || "project").toLowerCase();
        const project = String(o.project || "");

        return project.toLowerCase() === projectName.toLowerCase() || scope === "global" || scope === "personal";
    });

    // Run mapping pipelines sequentially
    if (!categoryExclusions.includes("SESSION")) {
        processSessions(filteredSessions as Record<string, unknown>[], ctx);
    }
    if (!categoryExclusions.includes("OBSERVATION")) {
        processObservations(filteredObservations as Record<string, unknown>[], ctx);
    }
    processMutations((rawData.mutations || []) as Record<string, unknown>[], ctx);

    return {
        options: {
            directed: true,
            multigraph: true,
            compound: false
        },
        nodes: ctx.nodesList,
        edges: ctx.edgesList
    };
}

/**
 * Saves the generated knowledge graph to disk in native Graphlib JSON format.
 */
export function saveKnowledgeGraph(graphJson: GraphLibJson, outputPath: string, options?: SaveGraphOptions): void {
    const { minify = true } = options || {};

    const jsonContent = minify
        ? JSON.stringify(graphJson)
        : JSON.stringify(graphJson, null, 2);

    fs.writeFileSync(outputPath, jsonContent, "utf-8");
    console.log(`Knowledge graph saved successfully using Graphlib native schema. Size: ${(jsonContent.length / 1024).toFixed(2)} KB`);
}