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
export type ObservationType = StandardObservationType | (string & {});

export interface TypeMetadata {
    type: ObservationType;
    label: string;
    isConventionLike: boolean;
}
