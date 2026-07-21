
import crypto from "crypto";

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