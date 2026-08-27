import type { BlogStore, SupabaseStoreOptions } from './types.js';
import { storedRowToPost } from './stored-row.js';
/** @deprecated Compatibility alias for earlier internal imports. */
export declare const rowToPost: typeof storedRowToPost;
export declare function createSupabaseStore(options: SupabaseStoreOptions): BlogStore;
//# sourceMappingURL=supabase-store.d.ts.map