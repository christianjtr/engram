const originalFetch = globalThis.fetch;
const trackedEnv = ["ENGRAM_URL", "ENGRAM_PORT", "ENGRAM_HTTP_TOKEN", "ENGRAM_PROJECT"] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of trackedEnv) {
    originalEnv[key] = process.env[key];
}

export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

export function textResponse(body: string, status: number): Response {
    return new Response(body, { status });
}

export function mockFetch(
    handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): void {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const href =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return handler(new URL(href), init);
    };
}

export function restoreFetchEnv(): void {
    globalThis.fetch = originalFetch;
    for (const key of trackedEnv) {
        const value = originalEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

export function clearEngramEnv(): void {
    for (const key of trackedEnv) {
        delete process.env[key];
    }
}
