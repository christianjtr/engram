import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

// 1. Inherit official Engram production environment variables
const prod = process.argv === "production" || process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
    // 2. Map our 4 core plugin endpoints
    entryPoints: [
        // "src/bootstrap.ts",
        "src/cli-init.ts",
        // "src/processor.ts",
        // "src/mcp-server.ts"
    ],
    bundle: true,
    // 3. Mark Node system modules and MCP SDK as external
    external: [
        "@modelcontextprotocol/sdk",
        ...builtins,
    ],
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outdir: "dist",
    minify: prod,
});

if (watch) {
    console.log("⚡ [esbuild] Development mode active. Watching source files...");
    await context.watch();
} else {
    console.log("✨ [esbuild] Performing rigorous production build compilation...");
    await context.rebuild();
    process.exit(0);
}
