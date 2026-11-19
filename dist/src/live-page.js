import { parse } from 'parse5';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const SKIP_TEXT = new Set(['head', 'script', 'style', 'template', 'noscript', 'svg']);
function visit(root, fn) {
    const stack = [root];
    while (stack.length) {
        const node = stack.pop();
        if (fn(node) === false || !('childNodes' in node))
            continue;
        for (let i = node.childNodes.length - 1; i >= 0; i--)
            stack.push(node.childNodes[i]);
    }
}
function attr(node, name) {
    return node.attrs.find((a) => a.name === name)?.value || '';
}
function visibleText(root, fragments) {
    visit(root, (node) => {
        if ('tagName' in node && (SKIP_TEXT.has(node.tagName) || node.attrs.some((a) => a.name === 'hidden')))
            return false;
        if (node.nodeName === '#text' && 'value' in node)
            fragments.push(node.value);
    });
}
function comparable(text) {
    return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(' ');
}
export function liveBlogPageProblems(url, response, html, options = {}) {
    if (response.status !== 200)
        return [`HTTP ${response.status}`];
    const problems = [];
    const robotsHeader = response.headers.get('x-robots-tag') || '';
    // Check generic directives and directives explicitly scoped to Googlebot or Bingbot.
    let relevant = true;
    const noindex = (value) => /(?:^|\s)(?:noindex|none)(?=\s|,|$)/i.test(value.trim());
    for (let directive of robotsHeader.split(',')) {
        const scope = directive.match(/^\s*([a-z][\w-]*):\s*/i);
        if (scope && !['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after'].includes(scope[1].toLowerCase())) {
            relevant = /^(googlebot|bingbot)$/i.test(scope[1]);
            directive = directive.slice(scope[0].length);
        }
        if (relevant && noindex(directive)) {
            problems.push('X-Robots-Tag prevents indexing');
            break;
        }
    }
    const canonicalMatches = (href) => {
        if (!href)
            return false;
        try {
            return new URL(href, url).href === url;
        }
        catch {
            return false;
        }
    };
    const linkHeader = response.headers.get('link') || '';
    const canonicalHeaders = [...linkHeader.matchAll(/<([^>]*)>([^,]*)/g)]
        .filter((match) => /;\s*rel\s*=\s*(?:"[^"]*\bcanonical\b[^"]*"|canonical\b)/i.test(match[2]));
    if (canonicalHeaders.some((match) => !canonicalMatches(match[1])))
        problems.push('HTTP canonical points away from the article URL');
    const canonicals = [];
    const headings = [];
    const doc = parse(html);
    const head = doc.childNodes.flatMap((node) => 'childNodes' in node ? node.childNodes : [])
        .find((node) => 'tagName' in node && node.tagName === 'head');
    if (head)
        visit(head, (node) => {
            if (!('tagName' in node))
                return;
            if (node.tagName === 'link' && attr(node, 'rel').toLowerCase().split(/\s+/).includes('canonical')) {
                canonicals.push(attr(node, 'href').trim());
            }
            if (node.tagName === 'meta' && /^(robots|googlebot|bingbot)$/i.test(attr(node, 'name').trim())
                && attr(node, 'content').split(',').some(noindex)) {
                problems.push('robots meta tag prevents indexing');
            }
        });
    if (options.requireCanonicalHtml && canonicals.length !== 1)
        problems.push('expected exactly one canonical link in the HTML head');
    if (canonicals.some((href) => !canonicalMatches(href)))
        problems.push('HTML canonical points away from the article URL');
    if (options.requireCanonicalHtml) {
        if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || ''))
            problems.push('response is not HTML');
        visit(doc, (node) => {
            if ('tagName' in node && SKIP_TEXT.has(node.tagName))
                return false;
            if ('tagName' in node && node.attrs.some((a) => a.name === 'hidden'))
                return false;
            if ('tagName' in node && node.tagName === 'h1') {
                const fragments = [];
                visibleText(node, fragments);
                headings.push(comparable(fragments.join(' ')));
            }
        });
        const title = options.title ? comparable(options.title) : '';
        if (title ? !headings.includes(title) : !headings.some(Boolean))
            problems.push('article title missing from rendered H1');
    }
    if (options.answer) {
        const answer = comparable(options.answer).split(' ').slice(0, 8).join(' ');
        const fragments = [];
        visibleText(doc, fragments);
        if (!answer || !comparable(fragments.join(' ')).includes(answer))
            problems.push('published answer missing from readable HTML');
    }
    return [...new Set(problems)];
}
/** Bound decompressed HTML retained by the publish and health probes. */
export async function readBlogHtml(response, maxBytes = MAX_HTML_BYTES) {
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                return html + decoder.decode();
            bytes += value.byteLength;
            if (bytes > maxBytes)
                throw new Error('response exceeds the verification size limit');
            html += decoder.decode(value, { stream: true });
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
//# sourceMappingURL=live-page.js.map