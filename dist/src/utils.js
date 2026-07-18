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
/**
 * Deterministically shorten text to maxChars on a word boundary. Models cannot
 * count characters, so length limits are enforced here rather than by
 * rejecting a generation attempt.
 */
export function clampText(s, maxChars) {
    const text = String(s).trim().replace(/\s+/g, ' ');
    if (text.length <= maxChars)
        return text;
    const cut = text.slice(0, maxChars + 1);
    const lastSpace = cut.lastIndexOf(' ');
    return cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).replace(/[ ,.;:–—-]+$/, '');
}
export function mimeTypeFor(path) {
    const ext = path.toLowerCase().split('?')[0].split('.').pop() || '';
    const map = {
        webp: 'image/webp',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        avif: 'image/avif',
        gif: 'image/gif',
        svg: 'image/svg+xml',
    };
    return map[ext] || 'image/jpeg';
}
export function env(name, required = true) {
    const v = process.env[name];
    if (!v && required)
        throw new Error(`Missing required env: ${name}`);
    return v || '';
}
//# sourceMappingURL=utils.js.map