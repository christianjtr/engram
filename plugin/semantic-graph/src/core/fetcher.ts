import fs from "fs";
import { execSync } from "child_process";
import { ENGRAM_DIR, getTempExportPath } from "../config";
import type { GenericRecord } from "../utils/helpers";

export interface EngramExportData {
    sessions: GenericRecord[];
    observations: GenericRecord[];
    mutations: GenericRecord[];
}

export function fetchEngramData(projectName: string, customPath?: string): EngramExportData {
    const targetPath = customPath || getTempExportPath(projectName);
    if (!fs.existsSync(ENGRAM_DIR)) {
        fs.mkdirSync(ENGRAM_DIR, { recursive: true });
    }

    try {
        execSync(`engram export "${targetPath}"`, { stdio: "pipe", timeout: 15000 });

        if (!fs.existsSync(targetPath)) {
            throw new Error(`Export file not found at: ${targetPath}`);
        }

        const raw = fs.readFileSync(targetPath, "utf-8").trim();
        if (!raw) throw new Error("Export payload is empty.");

        const parsed = JSON.parse(raw) as GenericRecord;

        const mutations = Array.isArray(parsed.sync_mutations)
            ? parsed.sync_mutations
            : Array.isArray(parsed.mutations)
                ? parsed.mutations
                : [];

        return {
            sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as GenericRecord[]) : [],
            observations: Array.isArray(parsed.observations) ? (parsed.observations as GenericRecord[]) : [],
            mutations: Array.isArray(mutations) ? (mutations as GenericRecord[]) : []
        };
    } catch (error) {
        throw new Error(`Failed to export Engram data: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        if (fs.existsSync(targetPath)) {
            try {
                fs.unlinkSync(targetPath);
            } catch {
                console.warn("Failed to clean up temporary export file");
            }
        }
    }
}