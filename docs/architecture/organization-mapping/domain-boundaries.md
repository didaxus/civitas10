# Domain boundaries

Do not introduce `organizationType` or school/university/technical-institute presets. Organization-owned values are tenant data under canonical dimensions; they are not canonical definitions. Structure nodes and edges model organization topology. Granular authorization assignments model access constraints. Runtime authorization decisions are made by the backend only and fail closed for unknown, stale, ambiguous, or incompatible state.
