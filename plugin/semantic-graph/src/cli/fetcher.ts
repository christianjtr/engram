import { EngramServices } from "../services/engram";
import { DEFAULT_GLOBAL_LIMIT } from "../config";
import type { EngramObservation } from "../services/engram/types";
import type { GraphBuildOptions } from "../types/graph";

export async function fetchEngramData(options?: GraphBuildOptions) {
    try {
        const isAll = Boolean(options?.all);
        const projectName = isAll
            ? "all"
            : (options?.project?.trim() || await EngramServices.getCurrentProjectName());

        const selection = {
            project: isAll ? undefined : projectName,
            allProjects: isAll,
        };

        const exportPromise = EngramServices.fetchExport(selection);
        const conflictsPromise = EngramServices.fetchConflicts(selection);
        let globalsPromise: Promise<EngramObservation[]>;

        if (isAll) {
            globalsPromise = Promise.resolve([]);
        } else {
            const limit = options?.globalLimit ?? DEFAULT_GLOBAL_LIMIT;
            globalsPromise = EngramServices.fetchGlobalObservations(limit);
        }

        const [exportData, conflicts, externalGlobals] = await Promise.all([
            exportPromise,
            conflictsPromise,
            globalsPromise
        ]);

        const globalObservations = isAll
            ? exportData.observations.filter(obs => obs.scope === "global")
            : externalGlobals;

        return {
            projectName,
            observations: exportData.observations,
            globalObservations,
            globalSessions: exportData.sessions,
            sessions: exportData.sessions,
            relations: conflicts,
            options,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch graph data from Engram: ${message}`);
    }
}