import { readFile } from "node:fs/promises";
import path from "node:path";
import { ENGRAM_DIR } from "./index";

export const ENV_ALLOWLIST = [
    "ENGRAM_URL",
    "ENGRAM_PORT",
    "ENGRAM_HTTP_TOKEN",
    "ENGRAM_PROJECT",
] as const;

export type EngramEnvKey = (typeof ENV_ALLOWLIST)[number];

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const withoutExport = line.startsWith("export ")
            ? line.slice("export ".length).trim()
            : line;
        const eq = withoutExport.indexOf("=");
        if (eq <= 0) continue;

        const key = withoutExport.slice(0, eq).trim();
        if (!ENV_KEY_PATTERN.test(key)) continue;

        let value = withoutExport.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
            (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
        ) {
            value = value.slice(1, -1);
        }

        result[key] = value;
    }

    return result;
}

export function applyEnvValues(values: Record<string, string>): void {
    for (const key of ENV_ALLOWLIST) {
        if (process.env[key]?.trim()) continue;
        const value = values[key];
        if (value === undefined || value.trim() === "") continue;
        process.env[key] = value;
    }
}

async function readEnvIfExists(filePath: string): Promise<Record<string, string>> {
    try {
        return parseEnvFile(await readFile(filePath, "utf-8"));
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return {};
        }
        throw error;
    }
}

export async function loadEnvFiles(options?: { cwd?: string; userDir?: string }): Promise<void> {
    const cwd = options?.cwd ?? process.cwd();
    const userDir = options?.userDir ?? ENGRAM_DIR;
    const merged = {
        ...(await readEnvIfExists(path.join(userDir, ".env"))),
        ...(await readEnvIfExists(path.join(cwd, ".env"))),
    };
    applyEnvValues(merged);
}
