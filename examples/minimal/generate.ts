/**
 * The whole CLI for a site using this engine.
 *   npx tsx examples/minimal/generate.ts --count=1 --dry-run
 */
import { runBlogGenerateCli } from '../../src/index.js';
import { minimalBlogRuntime } from './runtime.js';

await runBlogGenerateCli(minimalBlogRuntime(), process.cwd());
