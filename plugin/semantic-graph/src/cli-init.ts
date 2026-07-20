import fs from "fs";
import path from "path";
import readline from "readline/promises";
import type { SemanticGraphConfig, GenerationStrategyConfig } from "./types";
import { C, W } from "./wizard-ui";

const ENGRAM_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "", ".engram", "semantic-graph");
const CONFIG_PATH = path.join(ENGRAM_DIR, "graph-config.json");
const TEMPLATE_PATH = path.join(process.cwd(), "config.template.json");

function loadTemplate(templatePath: string): SemanticGraphConfig {
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Base template not found at ${templatePath}`);
    }
    const rawData = fs.readFileSync(templatePath, "utf-8");
    return JSON.parse(rawData) as SemanticGraphConfig;
}

async function promptGenerationStrategy(
    rl: readline.Interface,
    currentStrategy: GenerationStrategyConfig
): Promise<GenerationStrategyConfig> {
    const updatedStrategy = { ...currentStrategy };

    console.log(W.strategy.title);
    console.log(W.strategy.description);

    while (true) {
        const sessionSelection = await rl.question(W.strategy.query(currentStrategy.link_by_session));
        const trimmed = sessionSelection.toLowerCase().trim();

        if (trimmed === "" || trimmed === "y" || trimmed === "yes") {
            updatedStrategy.link_by_session = true;
            break;
        } else if (trimmed === "n" || trimmed === "no") {
            updatedStrategy.link_by_session = false;
            break;
        } else {
            console.log(W.strategy.error);
        }
    }

    console.log(W.strategy.success(updatedStrategy.link_by_session));
    return updatedStrategy;
}

function saveConfig(config: SemanticGraphConfig, targetDir: string, configPath: string): void {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

async function main() {
    console.clear();
    console.log(W.banner.line);
    console.log(W.banner.title);
    console.log(W.banner.line);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        const config = loadTemplate(TEMPLATE_PATH);

        config.generation_strategy = await promptGenerationStrategy(rl, config.generation_strategy);

        saveConfig(config, ENGRAM_DIR, CONFIG_PATH);

        console.log(W.banner.line);
        console.log(W.footer.successHeading);
        console.log(`${W.footer.storageLabel}${C.bright}${CONFIG_PATH}${C.reset}`);
        console.log(W.banner.line + "\n");
    } catch (error) {
        console.error(
            `\n${W.footer.errorHeading}`,
            error instanceof Error ? error.message : error
        );
    } finally {
        rl.close();
    }
}

main();
