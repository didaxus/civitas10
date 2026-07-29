type CacheInvalidator = () => void;
let generation = new AbortController();
const invalidators = new Set<CacheInvalidator>();
export const beginTenantContextTransition = () => { generation.abort("tenant-context-transition"); generation = new AbortController(); for (const invalidate of invalidators) invalidate(); };
export const tenantRequestSignal = () => generation.signal;
export const registerTenantCache = (invalidate: CacheInvalidator) => { invalidators.add(invalidate); return () => invalidators.delete(invalidate); };
