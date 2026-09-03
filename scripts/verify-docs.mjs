// Assert the documentation matches the code: every module named in the README exists, every
// exported symbol referenced in the docs is really exported, and every internal link resolves.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const errors = [];

const docs = ['README.md','AGENTS.md','docs/ADOPTION.md','docs/SERVICE.md','docs/CONTENT-SPEC.md','docs/PROVIDERS.md','docs/WORKFLOWS.md','docs/TRAFFIC.md','docs/ROADMAP.md','docs/UPGRADE-V2.md','docs/AUDIT-2026-09.md'];
const text = Object.fromEntries(docs.map(d => [d, readFileSync(d,'utf8')]));

// 1. README module table → src files exist
for (const m of [...text['README.md'].matchAll(/`([a-z-]+\.ts)`/g)].map(x=>x[1])) {
  if (!existsSync(`src/${m}`)) errors.push(`README names src/${m} which does not exist`);
}

// 2. internal doc links resolve
for (const [doc, body] of Object.entries(text)) {
  const dir = doc.includes('/') ? doc.slice(0, doc.lastIndexOf('/')) : '.';
  for (const [, link] of body.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)) {
    const p = link.startsWith('/') ? link.slice(1) : `${dir}/${link}`.replace(/^\.\//,'');
    const norm = p.split('/').reduce((acc,seg)=>{ if(seg==='..') acc.pop(); else if(seg!=='.') acc.push(seg); return acc; },[]).join('/');
    if (!existsSync(norm)) errors.push(`${doc} links to ${link} → ${norm} (missing)`);
  }
}

// 3. exported runtime symbols the docs tell people to import really exist at that exact subpath
const entrypoints = {
  '': '../dist/src/index.js',
  '/core': '../dist/src/core.js',
  '/adapters/filesystem': '../dist/src/adapters/filesystem.js',
  '/adapters/supabase': '../dist/src/adapters/supabase.js',
  '/adapters/allweb': '../dist/src/adapters/allweb.js',
};
const claimed = new Map(Object.keys(entrypoints).map(path => [path, new Set()]));
for (const body of Object.values(text)) {
  for (const [, typeOnly, names, subpath = ''] of body.matchAll(/import (type )?\{([^}]+)\} from '@bizrnr\/blog-engine([^']*)'/g)) {
    if (!(subpath in entrypoints)) {
      errors.push(`docs import unsupported package subpath @bizrnr/blog-engine${subpath}`);
      continue;
    }
    if (typeOnly) continue;
    names.split(',').map(s=>s.trim()).filter(s=>s && !s.startsWith('type ')).forEach(name=>claimed.get(subpath).add(name));
  }
}
for (const [subpath, names] of claimed) {
  const api = await import(new URL(entrypoints[subpath], import.meta.url).href);
  for (const name of names) {
    if (!(name in api)) errors.push(`docs import { ${name} } from '@bizrnr/blog-engine${subpath}' — not exported`);
  }
}

// 4. examples referenced exist
for (const ex of ['minimal','service','sdbg','template']) {
  if (!existsSync(`examples/${ex}`)) errors.push(`examples/${ex} referenced but missing`);
}

// 5. sql file the docs tell people to run
if (!existsSync('sql/0001_blog_posts.sql')) errors.push('sql/0001_blog_posts.sql missing');

console.log(`checked ${docs.length} docs, ${[...claimed.values()].reduce((n, names) => n + names.size, 0)} claimed exports`);
if (errors.length) { console.error('\nDOC DRIFT:\n' + errors.map(e=>' - '+e).join('\n')); process.exit(1); }
console.log('docs match the code ✓');
