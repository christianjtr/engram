
import crypto from "crypto";
import { execSync } from "child_process";

export type GenericRecord = Record<string, unknown>;

export function generateMD5Hash(input: string): string {
    return crypto.createHash("md5").update(input).digest("hex");
}

export function parseMutationPayload(payload: unknown): GenericRecord | null {
    if (!payload) return null;
    if (typeof payload === "object" && payload !== null) return payload as GenericRecord;
    if (typeof payload === "string") {
        try {
            return JSON.parse(payload) as GenericRecord;
        } catch {
            return null;
        }
    }
    return null;
}

export function getStringProp(obj: GenericRecord, key: string): string | undefined {
    const val = obj[key];
    return typeof val === "string" ? val : undefined;
}

/**
 * Safely determines the current project name.
 * 1. Uses ENGRAM_PROJECT env variable if set.
 * 2. Uses `engram project current --json` to detect it from CLI.
 * 3. Falls back to "unknown-project".
 */
export function getCurrentProjectName(): string {
    if (process.env.ENGRAM_PROJECT) {
        return process.env.ENGRAM_PROJECT;
    }

    try {
        const output = execSync("engram project current --json", { stdio: "pipe", encoding: "utf-8" });
        const parsed = JSON.parse(output.trim());
        if (parsed && parsed.project) {
            return parsed.project;
        }
    } catch (e) {
        // Fallback below
    }
    
    return "unknown-project";
}
