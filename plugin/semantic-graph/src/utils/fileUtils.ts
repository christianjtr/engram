import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

/**
 * Ensures that a directory exists, creating it (and any parent directories) if necessary.
 * Using recursive: true automatically handles the case where the directory already exists.
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Safely writes a file by saving it to a temporary path first,
 * then renaming it to prevent data corruption if the process crashes.
 */
export async function writeAtomicFile(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    try {
        await fs.writeFile(tempPath, content, "utf-8");
        await fs.rename(tempPath, filePath);
    } catch (error) {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
    }
}

/**
 * Normalizes a string into a safe, filesystem-friendly identifier.
 */
export function sanitizeFilename(name: string): string {
    return name.trim().replace(/[/\\]+/g, "_") || "unknown";
}
