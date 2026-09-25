import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { ENGRAM_DIR } from "./index";

export const ENV_ALLOWLIST = [
    "ENGRAM_URL",
    "ENGRAM_PORT",
    "ENGRAM_HTTP_TOKEN",
    "ENGRAM_PROJECT",
] as const;

export type EngramEnvKey = (typeof ENV_ALLOWLIST)[number];

export function applyEnvValues(values: NodeJS.Dict<string>): void {
    for (const key of ENV_ALLOWLIST) {
        if (process.env[key]?.trim()) continue;
        const value = values[key];
        if (value === undefined || value.trim() === "") continue;
        process.env[key] = value;
    }
}

async function readEnvIfExists(filePath: string): Promise<NodeJS.Dict<string>> {
    try {
        return parseEnv(await readFile(filePath, "utf-8"));
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
