/**
 * Observation lifecycle and type metadata.
 */

export type ObservationLifecycle = "active" | "stale";
export type SessionStatus = "active" | "completed" | "interrupted";

export const STANDARD_OBSERVATION_TYPES = [
    "convention",
    "decision",
    "architecture",
    "pattern",
    "config",
    "bugfix",
    "discovery",
    "learning",
] as const;

export type StandardObservationType = (typeof STANDARD_OBSERVATION_TYPES)[number];

/**
 * Open union for standard types with full autocomplete support while accepting custom types.
 */
export type ObservationType = StandardObservationType | (string & {});

export interface TypeMetadata {
    type: string;
    label: string;             // Clean uppercase badge (e.g. "CONVENTION", "DECISION")
    color: string;             // Color hex code for visual renderers
    isConventionLike: boolean; // Indicates rules, constraints, and architecture decisions
}