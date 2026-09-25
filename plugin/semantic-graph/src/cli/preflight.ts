import { PREFLIGHT_TIMEOUT_MS } from "../config";
import { getEngramBaseUrl } from "../services/engram/constants";
import { EngramHealthSchema } from "../services/engram/schemas";

function isConnectionRefused(error: unknown): boolean {
    if (error && typeof error === "object" && "cause" in error) {
        const cause = (error as { cause?: unknown }).cause;
        if (cause && typeof cause === "object" && "code" in cause) {
            return (cause as { code?: string }).code === "ECONNREFUSED";
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    return /ECONNREFUSED/i.test(message);
}

function serviceName(raw: unknown): string | undefined {
    if (raw && typeof raw === "object" && "service" in raw) {
        const service = (raw as { service?: unknown }).service;
        return typeof service === "string" ? service : undefined;
    }
    return undefined;
}

export async function assertEngramReady(): Promise<void> {
    const baseUrl = getEngramBaseUrl().replace(/\/+$/, "");
    const url = new URL("health", `${baseUrl}/`);

    let response: Response;
    try {
        response = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
        });
    } catch (error) {
        if (isConnectionRefused(error)) {
            throw new Error(
                `Engram HTTP server is not running at ${baseUrl}. Start it with: engram serve`,
            );
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Engram at ${baseUrl} did not respond: ${message}. Is 'engram serve' running?`,
        );
    }

    if (!response.ok) {
        throw new Error(
            `Engram at ${baseUrl} is unreachable (HTTP ${response.status}). Is 'engram serve' running?`,
        );
    }

    const raw: unknown = await response.json();
    const service = serviceName(raw);
    if (service && service !== "engram") {
        throw new Error(`Expected local Engram daemon at ${baseUrl}, got service "${service}".`);
    }

    if (!EngramHealthSchema.safeParse(raw).success) {
        throw new Error(`Engram at ${baseUrl} returned an invalid /health response.`);
    }
}
