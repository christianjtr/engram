import {
    EngramExportPayload,
    EngramObservation,
    EngramRelation
} from "../types";

export interface EngramClientConfig {
    baseUrl?: string;
    token?: string;
    timeoutMs?: number;
}

export class EngramHttpClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly timeoutMs: number;

    constructor(config?: EngramClientConfig) {
        const envPort = process.env.ENGRAM_PORT || "7437";
        const envUrl = process.env.ENGRAM_URL || `http://127.0.0.1:${envPort}`;
        this.baseUrl = (config?.baseUrl || envUrl).replace(/\/+$/, "");
        this.token = config?.token ?? process.env.ENGRAM_HTTP_TOKEN;
        this.timeoutMs = config?.timeoutMs ?? 10_000;
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: "application/json",
        };
        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        return headers;
    }

    private async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== "") {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        let response: Response;
        try {
            response = await fetch(url.toString(), {
                method: "GET",
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Failed to reach Engram server at ${this.baseUrl}: ${message}. Is 'engram serve' running?`
            );
        }

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(
                `Engram server responded with HTTP ${response.status} ${response.statusText} on ${endpoint}: ${body}`
            );
        }

        return (await response.json()) as T;
    }

    /**
     * Resolves the canonical project name for the current working directory.
     * Calls GET /project/current.
     */
    async resolveCurrentProject(): Promise<string | null> {
        try {
            const data = await this.get<{ project?: string; name?: string }>("/project/current");
            return data.project || data.name || null;
        } catch {
            return null;
        }
    }

    /**
     * Fetches export data from Engram.
     * When project is supplied, returns data scoped to that project.
     * When allProjects is true, returns the complete database dump.
     */
    async fetchExport(options?: { project?: string; allProjects?: boolean }): Promise<EngramExportPayload> {
        const params: Record<string, string | boolean | undefined> = {};
        if (options?.allProjects) {
            params.all_projects = true;
        } else if (options?.project) {
            params.project = options.project;
        }

        const data = await this.get<EngramExportPayload>("/export", params);

        return {
            version: data.version ?? "0.1.0",
            exported_at: data.exported_at ?? new Date().toISOString(),
            sessions: Array.isArray(data.sessions) ? data.sessions : [],
            observations: Array.isArray(data.observations) ? data.observations : [],
            prompts: Array.isArray(data.prompts) ? data.prompts : [],
        };
    }

    /**
     * Fetches global observations across all projects using GET /observations.
     */
    async fetchGlobalObservations(limit: number = 20): Promise<EngramObservation[]> {
        try {
            const data = await this.get<EngramObservation[]>("/observations", {
                all_projects: true,
                scope: "global",
                limit,
                sort: "created_at:desc",
            });
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    /**
     * Fetches judged relation conflicts for a project (or all).
     */
    async fetchConflicts(project?: string): Promise<EngramRelation[]> {
        try {
            const params: Record<string, string | undefined> = {};
            if (project && project !== "all") {
                params.project = project;
            }
            const data = await this.get<EngramRelation[]>("/conflicts", params);
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }
}
