import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

function relativeDependencies(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const dependencies: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const specifier = match[1].replace(/\.js$/, '.ts');
    const dependency = resolve(dirname(file), specifier);
    if (existsSync(dependency)) dependencies.push(dependency);
  }
  return dependencies;
}

function dependencyClosure(entry: string): Set<string> {
  const visited = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    queue.push(...relativeDependencies(file));
  }
  return visited;
}

test('provider-neutral core cannot reach a database or control-plane adapter', () => {
  const files = dependencyClosure(resolve(root, 'src/core.ts'));
  const forbidden = [...files].filter((file) =>
    /\/(?:supabase-store|allweb-(?:store|reader|resilient-reader|gsc))\.ts$/.test(file),
  );
  assert.deepEqual(forbidden, []);
});

test('AllWeb adapters share neutral row mapping instead of importing Supabase', () => {
  for (const file of ['src/allweb-store.ts', 'src/allweb-reader.ts']) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]\.\/supabase-store\.js['"]/);
    assert.match(source, /storedRowToPost/);
  }
});

test('package exposes an agnostic core and deliberately named optional adapters', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    exports: Record<string, { import: string; types: string }>;
  };
  assert.deepEqual(Object.keys(pkg.exports), [
    '.',
    './core',
    './adapters/filesystem',
    './adapters/supabase',
    './adapters/allweb',
  ]);
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    assert.match(target.import, /^\.\/dist\/src\//, `${subpath} import must resolve inside dist`);
    assert.match(target.types, /^\.\/dist\/src\//, `${subpath} types must resolve inside dist`);
  }
});
