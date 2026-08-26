import type { AllWebStoreOptions, BlogStore } from './types.js';
/**
 * Least-privilege AllWeb store for website repositories and delegated agents.
 *
 * Unlike createSupabaseStore, this adapter never receives a service-role key.
 * It calls the AllWeb site-agent gateway with one revocable token that is
 * irreversibly bound to one site_id. The gateway injects the tenant boundary.
 */
export declare function createAllWebStore(options: AllWebStoreOptions): BlogStore;
//# sourceMappingURL=allweb-store.d.ts.map