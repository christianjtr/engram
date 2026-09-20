export const DEFAULT_MAX_CHARS = 12_000;
export const DEFAULT_MAX_OBSERVATIONS = 40;
export const MAX_OBSERVATION_CONTENT_CHARS = 600;

export const OBSERVATION_PRIORITY: Record<string, number> = {
    decision: 0,
    architecture: 1,
    convention: 2,
    pattern: 3,
    config: 4,
    bugfix: 5,
    discovery: 6,
    learning: 7,
    other: 8,
};
