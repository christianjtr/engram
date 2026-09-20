interface EngramClientOptions {
    baseUrl?: string;
    token?: string;
    timeoutMs?: number;
}

const MAX_ERROR_BODY_LENGTH = 1_000;

function resolveConfig(options?: EngramClientOptions) {
    const envPort = process.env.ENGRAM_PORT || "7437";
    const envUrl = process.env.ENGRAM_URL || `http://127.0.0.1:${envPort}`;
    const baseUrl = (options?.baseUrl ?? envUrl).replace(/\/+$/, "");
    const token = options?.token ?? process.env.ENGRAM_HTTP_TOKEN;
    const timeoutMs = options?.timeoutMs ?? 10_000;

    try {
        new URL(baseUrl);
    } catch {
        throw new Error(`Invalid Engram server URL: ${baseUrl}`);
    }

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("Engram HTTP timeout must be a positive finite number");
    }

    return { baseUrl, token, timeoutMs };
}

function buildHeaders(token?: string): HeadersInit {
    return {
        Accept: "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
    };
}

function buildUrl(
    baseUrl: string,
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
): string {
    const cleanEndpoint = endpoint.replace(/^\/+/, "");
    const cleanParams = Object.fromEntries(
        Object.entries(params ?? {}).filter(([, val]) => val !== undefined && val !== null && val !== "")
    );

    const query = new URLSearchParams(cleanParams as Record<string, string>).toString();
    return `${baseUrl}/${cleanEndpoint}${query ? `?${query}` : ""}`;
}

/**
 * Low-level HTTP GET transport helper using native Fetch API.
 */
async function engramFetch<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: EngramClientOptions
): Promise<T> {
    const { baseUrl, token, timeoutMs } = resolveConfig(options);
    const url = buildUrl(baseUrl, endpoint, params);

    let response: Response;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: buildHeaders(token),
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error(`Request to Engram server at ${endpoint} timed out after ${timeoutMs}ms.`);
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to reach Engram server at ${baseUrl}: ${message}. Is 'engram serve' running?`);
    }

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        const detail = body.length > MAX_ERROR_BODY_LENGTH
            ? `${body.slice(0, MAX_ERROR_BODY_LENGTH)}...`
            : body;
        throw new Error(`Engram server responded with HTTP ${response.status} ${response.statusText} on ${endpoint}: ${detail}`);
    }

    return (await response.json()) as T;
}

export const engramHttpClient = {
    get: engramFetch,
};