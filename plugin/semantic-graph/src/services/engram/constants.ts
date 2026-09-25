export const DEFAULT_ENGRAM_PORT = "7437";
export const DEFAULT_ENGRAM_HOST = "127.0.0.1";
export const ENGRAM_SCOPES = ["project", "global", "personal"] as const;

export function getEngramBaseUrl(): string {
    const port = process.env.ENGRAM_PORT || DEFAULT_ENGRAM_PORT;
    return process.env.ENGRAM_URL || `http://${DEFAULT_ENGRAM_HOST}:${port}`;
}
