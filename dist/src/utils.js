export function norm(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
export function slugify(s) {
    return norm(s)
        .replace(/\b(the|a|an|in|of|for|to|your|and|with|how)\b/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 70);
}
export function wordCount(s) {
    return (String(s).trim().match(/\S+/g) || []).length;
}
export function yamlString(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
export function xmlEscape(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
export function env(name, required = true) {
    const v = process.env[name];
    if (!v && required)
        throw new Error(`Missing required env: ${name}`);
    return v || '';
}
//# sourceMappingURL=utils.js.map