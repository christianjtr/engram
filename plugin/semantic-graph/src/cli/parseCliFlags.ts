export interface CliFlags {
    all: boolean;
    includeStale: boolean;
    globalLimit?: number;
}

const VALID_SHORT_FLAGS = new Set(["-a", "-s", "-h"]);

export function parseCliFlags(args: string[]): CliFlags {
    const unknown = args.find(a => a.startsWith("-") && !a.startsWith("--") && !VALID_SHORT_FLAGS.has(a));
    if (unknown) throw new Error(`Unknown flag: ${unknown}`);

    if (args.includes("--global-limit")) {
        throw new Error("Missing value for --global-limit. Use --global-limit=<number>");
    }

    let globalLimit: number | undefined;
    const limitArg = args.find(a => a.startsWith("--global-limit="));

    if (limitArg) {
        const val = limitArg.split("=")[1]?.trim();
        const num = Number(val);

        if (val && Number.isSafeInteger(num) && num >= 0) {
            globalLimit = num;
        } else {
            throw new Error("Invalid value for --global-limit: must be a non-negative integer");
        }
    }

    return {
        all: args.includes("-a"),
        includeStale: args.includes("-s"),
        globalLimit,
    };
}