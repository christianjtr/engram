import type { GenericRecord } from "../../utils/helpers";

/**
 * Filters sessions by project name.
 * When projectName is "all", returns all sessions unfiltered.
 */
export function filterSessionsByProject(
    sessions: GenericRecord[],
    projectName: string
): GenericRecord[] {
    if (projectName === "all") return sessions;

    return sessions.filter(
        (s) => String(s.project ?? "").toLowerCase() === projectName.toLowerCase()
    );
}

/**
 * Filters observations by project scope, excluding soft-deleted rows.
 *
 * Inclusion rules:
 *  - Soft-deleted rows (deleted_at is set) are always excluded.
 *  - projectName "all" includes every non-deleted observation.
 *  - Otherwise: include if the observation belongs to the target project,
 *    OR its scope is "global" or "personal" (cross-project observations).
 */
export function filterObservationsByProject(
    observations: GenericRecord[],
    projectName: string
): GenericRecord[] {
    return observations.filter((obs) => {
        // Exclude soft-deleted rows
        if (obs.deleted_at !== null && obs.deleted_at !== undefined) return false;

        // "all" mode: include every non-deleted observation
        if (projectName === "all") return true;

        const scope = String(obs.scope ?? "project").toLowerCase();
        const project = String(obs.project ?? "");

        return (
            project.toLowerCase() === projectName.toLowerCase() ||
            scope === "global" ||
            scope === "personal"
        );
    });
}
