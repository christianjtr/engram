export interface GenerationStrategyConfig {
    link_by_session: boolean;
    link_by_project: boolean;
    max_depth_levels: number;
}

export interface SemanticGraphConfig {
    generation_strategy: GenerationStrategyConfig;
}
