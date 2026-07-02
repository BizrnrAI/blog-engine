export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(s: string): string {
  return norm(s)
    .replace(/\b(the|a|an|in|of|for|to|your|and|with|how)\b/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

export function wordCount(s: string): number {
  return (String(s).trim().match(/\S+/g) || []).length;
}

export function yamlString(s: string): string {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function env(name: string, required = true): string {
  const v = process.env[name];
  if (!v && required) throw new Error(`Missing required env: ${name}`);
  return v || '';
}
