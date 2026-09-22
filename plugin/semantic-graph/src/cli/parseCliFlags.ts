export interface CliFlags {
    all: boolean;
    includeStale: boolean;
    project?: string;
    visualize: boolean;
    globalLimit?: number;
    allGlobals?: boolean;
}

const VALID_SHORT_FLAGS = new Set(["-a", "-p", "-s", "-h", "-v"]);

export function parseCliFlags(args: string[]): CliFlags {
    const unknown = args.find(a => a.startsWith("-") && !a.startsWith("--") && !VALID_SHORT_FLAGS.has(a));
    if (unknown) throw new Error(`Unknown flag: ${unknown}`);

    if (args.includes("--global-limit")) {
        throw new Error("Missing value for --global-limit. Use --global-limit=<number>");

    }
    if (args.includes("--all-globals") && args.some(a => a.startsWith("--global-limit="))) {
        throw new Error("--all-globals and --global-limit cannot be used together");
    }

    const all = args.includes("-a");
    const pIndex = args.indexOf("-p");
    const project = pIndex !== -1 ? args[pIndex + 1]?.trim() : undefined;

    if (pIndex !== -1 && (!project || project.startsWith("-"))) {
        throw new Error("Missing or invalid value for -p");
    }

    if (all && project) {
        throw new Error("-a and -p cannot be used together");
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

    const allGlobals = args.includes("--all-globals");

    return {
        all,
        project,
        globalLimit,
        allGlobals,
        includeStale: args.includes("-s"),
        visualize: args.includes("-v")
    };
}