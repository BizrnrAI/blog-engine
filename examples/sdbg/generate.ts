#!/usr/bin/env tsx
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBlogGenerateCli } from '../../src/index.js';
import { sdbgBlogRuntime } from './runtime.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
await runBlogGenerateCli(sdbgBlogRuntime(), root);
