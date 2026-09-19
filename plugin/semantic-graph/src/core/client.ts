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

export interface EngramProjectSelection {
    project?: string;
    allProjects?: boolean;
}

interface ConflictPage {
    relations: EngramRelation[] | null;
    total: number;
    limit: number;
    offset: number;
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
     * Resolves the caller's directory via the server's project resolver.
     * Ambiguity and discovery failures must not select a fallback project.
     */
    async resolveCurrentProject(): Promise<string> {
        const data = await this.get<{ project?: string; error_hint?: string }>("/project/current", {
            cwd: process.cwd(),
        });
        if (data?.error_hint || typeof data?.project !== "string" || !data.project.trim()) {
            throw new Error(`Project discovery failed: ${data?.error_hint || "no project resolved"}. Use --project <name>.`);
        }
        return data.project;
    }

    /**
     * Fetches export data from Engram.
     * When project is supplied, returns data scoped to that project.
     * When allProjects is true, returns the complete database dump.
     */
    async fetchExport(options?: EngramProjectSelection): Promise<EngramExportPayload> {
        const params: Record<string, string | boolean | undefined> = {};
        if (options?.allProjects) {
            params.all_projects = true;
        } else if (options?.project) {
            params.project = options.project;
        }

        const data = await this.get<EngramExportPayload>("/export", params);
        if (!data || typeof data.version !== "string" || typeof data.exported_at !== "string"
            || (data.observations !== null && !Array.isArray(data.observations))
            || (data.sessions !== null && !Array.isArray(data.sessions))
            || (data.prompts != null && !Array.isArray(data.prompts))) {
            throw new Error("Invalid /export response from Engram server");
        }

        return {
            ...data,
            sessions: data.sessions ?? [],
            observations: data.observations ?? [],
            prompts: data.prompts ?? [],
        };
    }

    /**
     * Fetches global observations across all projects using GET /observations.
     */
    async fetchGlobalObservations(limit: number = 20): Promise<EngramObservation[]> {
        if (!Number.isSafeInteger(limit) || limit < 0) {
            throw new Error("Global observation limit must be a non-negative integer");
        }
        if (limit === 0) return [];
        const data = await this.get<EngramObservation[] | null>("/observations", {
            all_projects: true,
            scope: "global",
            limit,
            sort: "created_at:desc",
        });
        if (data !== null && !Array.isArray(data)) {
            throw new Error("Invalid /observations response from Engram server");
        }
        return data ?? [];
    }

    /**
     * Traverses all pages of judged relations exposed by /conflicts.
     * The endpoint excludes not_conflict verdicts and omits judgment explanations.
     */
    async fetchConflicts(options?: EngramProjectSelection): Promise<EngramRelation[]> {
        const relations: EngramRelation[] = [];
        const seen = new Set<string>();
        let total: number | undefined;
        for (;;) {
            const data = await this.get<ConflictPage>("/conflicts", {
                project: options?.allProjects ? undefined : options?.project,
                all_projects: options?.allProjects || undefined,
                status: "judged",
                limit: 500,
                offset: relations.length,
            });
            if (!data || !Number.isSafeInteger(data.total) || data.total < 0
                || !Number.isSafeInteger(data.limit) || data.limit <= 0
                || data.offset !== relations.length
                || (data.relations !== null && !Array.isArray(data.relations))) {
                throw new Error("Invalid /conflicts pagination response from Engram server");
            }
            const page = data.relations ?? [];
            if (page.length > data.limit || page.some((rel) => !rel
                || typeof rel.sync_id !== "string" || !rel.sync_id
                || typeof rel.source_id !== "string" || !rel.source_id
                || typeof rel.target_id !== "string" || !rel.target_id
                || typeof rel.relation !== "string" || !rel.relation
                || rel.judgment_status !== "judged")) {
                throw new Error("Invalid /conflicts relation records from Engram server");
            }
            total ??= data.total;
            if (data.total !== total || relations.length + page.length > total
                || (page.length === 0 && relations.length < total)) {
                throw new Error("Incomplete or changing /conflicts pagination; retry graph generation");
            }
            for (const rel of page) {
                if (seen.has(rel.sync_id)) {
                    throw new Error("Changing /conflicts pagination; retry graph generation");
                }
                seen.add(rel.sync_id);
                relations.push(rel);
            }
            if (relations.length === total) return relations;
        }
    }
}
