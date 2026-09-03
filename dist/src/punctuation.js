/** Publication-wide rule, including HTML spellings of an em dash. */
const EM_DASH = /\u2014|&(?:mdash|#0*8212|#x0*2014);/gi;
export function hasEmDash(value) {
    return new RegExp(EM_DASH.source, 'i').test(typeof value === 'string' ? value : JSON.stringify(value) || '');
}
/** Mechanical punctuation repair; never changes dates or a post's URL. */
export function normalizeBlogProse(text) {
    return text.replace(/[ \t]*(?:\u2014|&(?:mdash|#0*8212|#x0*2014);)[ \t]*/gi, ' - ');
}
/** Call after custom rendering too, so an adapter cannot reintroduce forbidden punctuation. */
export function assertNoEmDashes(value) {
    if (hasEmDash(value))
        throw new Error('Blog posts must never contain em dashes, including HTML entities');
}
//# sourceMappingURL=punctuation.js.map