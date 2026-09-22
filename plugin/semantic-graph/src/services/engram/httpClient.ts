import {
    DEFAULT_ENGRAM_HOST,
    DEFAULT_ENGRAM_PORT,
} from "./constants";

import { DEFAULT_TIMEOUT_MS, MAX_ERROR_BODY_LENGTH } from "../../config";

interface EngramClientOptions {
    baseUrl?: string;
    token?: string;
    timeoutMs?: number;
}

/**
 * Low-level HTTP GET transport using native fetch.
 */
async function engramFetch<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: EngramClientOptions
): Promise<T> {
    const port = process.env.ENGRAM_PORT || DEFAULT_ENGRAM_PORT;
    const baseUrl = options?.baseUrl || process.env.ENGRAM_URL || `http://${DEFAULT_ENGRAM_HOST}:${port}`;
    const token = options?.token ?? process.env.ENGRAM_HTTP_TOKEN;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Construct URL & Query Params natively
    const url = new URL(endpoint.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`);
    if (params) {
        Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== "") {
                url.searchParams.append(key, String(val));
            }
        });
    }

    let response: Response;

    try {
        response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Accept: "application/json",
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to reach Engram server (${baseUrl}): ${message}. Is 'engram serve' running?`);
    }

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        const detail = body.length > MAX_ERROR_BODY_LENGTH ? `${body.slice(0, MAX_ERROR_BODY_LENGTH)}...` : body;
        throw new Error(`Engram HTTP ${response.status} (${endpoint}): ${detail}`);
    }

    return (await response.json()) as T;
}

export const engramHttpClient = {
    get: engramFetch,
};
