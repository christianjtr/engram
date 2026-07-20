export interface TriggerConfig {
    mode: "on_demand" | "cron";
    interval_minutes: number;
}

export interface GenerationStrategyConfig {
    link_by_session: boolean;
    link_by_project: boolean;
    max_depth_levels: number;
}

export interface SemanticGraphConfig {
    trigger: TriggerConfig;
    generation_strategy: GenerationStrategyConfig;
}
