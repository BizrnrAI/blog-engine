import { experimental_generateImage as generateImage } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { BLOG_CONFIG } from './config.js';
import { GRADIENTS, HERO_PHOTOS } from './topics.js';
import { xmlEscape } from './utils.js';
function ensureDir(path) {
    if (!existsSync(path))
        mkdirSync(path, { recursive: true });
}
function wrap(title, maxChars, maxLines) {
    const words = title.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if ((cur + ' ' + w).trim().length <= maxChars)
            cur = (cur + ' ' + w).trim();
        else {
            if (cur)
                lines.push(cur);
            cur = w;
        }
    }
    if (cur)
        lines.push(cur);
    if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        kept[maxLines - 1] = kept[maxLines - 1].replace(/[ ,.;:]+$/, '') + '...';
        return kept;
    }
    return lines;
}
export async function applyWatermark(root, imageBuffer) {
    const { width, opacity, margin } = BLOG_CONFIG.image.watermark;
    try {
        const logo = readFileSync(join(root, BLOG_CONFIG.paths.watermarkLogo));
        const watermark = await sharp(logo)
            .resize(width, null, { fit: 'inside' })
            .ensureAlpha()
            .composite([{
                input: Buffer.from([0, 0, 0, Math.round(255 * opacity)]),
                raw: { width: 1, height: 1, channels: 4 },
                tile: true,
                blend: 'dest-in',
            }])
            .toBuffer();
        const base = sharp(imageBuffer);
        const baseMeta = await base.metadata();
        const baseWidth = baseMeta.width ?? 1536;
        const baseHeight = baseMeta.height ?? 1024;
        const wmMeta = await sharp(watermark).metadata();
        const wmWidth = wmMeta.width ?? width;
        const wmHeight = wmMeta.height ?? width;
        return await sharp(imageBuffer)
            .composite([{ input: watermark, top: baseHeight - wmHeight - margin, left: baseWidth - wmWidth - margin }])
            .webp({ quality: 86 })
            .toBuffer();
    }
    catch (err) {
        console.warn('[blog-watermark] failed, returning WebP without watermark:', err instanceof Error ? err.message : String(err));
        return sharp(imageBuffer).webp({ quality: 86 }).toBuffer();
    }
}
function buildAiPrompt(post, topic) {
    return [
        `Create a hyper-realistic ChatGPT Image 2 / GPT Image 2 blog hero image based primarily on this blog title: "${post.title}".`,
        `Use the title as the scene brief. Topic: ${topic.keyword}. Market context: ${BLOG_CONFIG.image.promptMarket}.`,
        BLOG_CONFIG.image.promptStyle,
        BLOG_CONFIG.image.promptCamera,
        'Make the image look like a real, high-end editorial photograph, not an illustration, rendering, collage, stock mockup, or AI-art poster.',
        'No text, captions, words, signs, logos, watermarks, UI overlays, people holding signs, or readable documents inside the generated image.',
        `Avoid recognizable copyrighted listings. Make it suitable for ${BLOG_CONFIG.identity.name}.`,
    ].join(' ');
}
async function generateAiHero(root, post, topic) {
    const apiKey = (process.env.VERCEL_AI_GATEWAY_BLOG_KEY || process.env.VERCEL_AI_GATEWAY_KEY || '').trim();
    if (!apiKey)
        return null;
    try {
        const gateway = createGateway({ apiKey });
        const result = await generateImage({
            model: gateway.imageModel(BLOG_CONFIG.image.model),
            prompt: buildAiPrompt(post, topic),
            size: BLOG_CONFIG.image.size,
            providerOptions: { openai: { quality: BLOG_CONFIG.image.quality } },
        });
        const img = result.images[0];
        const base64 = typeof img === 'string' ? img : img?.base64;
        if (!base64)
            return null;
        const raw = Buffer.from(base64, 'base64');
        const watermarked = await applyWatermark(root, raw);
        const outDir = join(root, BLOG_CONFIG.paths.heroDir);
        ensureDir(outDir);
        const outFile = join(outDir, `${post.slug}.${BLOG_CONFIG.image.format}`);
        await sharp(watermarked).webp({ quality: 86 }).toFile(outFile);
        return {
            image: `/${BLOG_CONFIG.paths.heroDir.replace(/^public\//, '')}/${post.slug}.${BLOG_CONFIG.image.format}`,
            imageAlt: `${BLOG_CONFIG.identity.name} guide: ${post.title}`,
        };
    }
    catch (err) {
        console.warn('[blog-image] AI hero generation failed; using curated fallback:', err instanceof Error ? err.message : String(err));
        return null;
    }
}
export async function makeOgCard(root, post, dryRun = false) {
    const c = BLOG_CONFIG.image.og;
    const W = c.width;
    const H = c.height;
    const pad = 72;
    const rel = `/${BLOG_CONFIG.paths.assetDir.replace(/^public\//, '')}/${post.slug}.jpg`;
    if (dryRun)
        return rel;
    const fontSize = post.title.length <= 46 ? 66 : post.title.length <= 80 ? 56 : post.title.length <= 120 ? 48 : 42;
    const charsPerLine = Math.floor((W - 2 * pad) / (fontSize * 0.52));
    const lines = wrap(post.title, charsPerLine, 4);
    const lineH = Math.round(fontSize * 1.16);
    const titleTop = 318;
    const tspans = lines
        .map((ln, i) => `<tspan x="${pad}" y="${titleTop + i * lineH}">${xmlEscape(ln)}</tspan>`)
        .join('');
    const logoBuf = readFileSync(join(root, BLOG_CONFIG.paths.brandLogo));
    const logoW = 280;
    const logoH = Math.round((112 / 320) * logoW);
    const logoUri = `data:image/png;base64,${logoBuf.toString('base64')}`;
    const footer = `${BLOG_CONFIG.identity.agent.name} · ${BLOG_CONFIG.identity.agent.titleCap}, ${BLOG_CONFIG.identity.agent.license}`;
    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${c.colors.bg2}"/>
      <stop offset="0.7" stop-color="${c.colors.bg}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="0.9">
      <stop offset="0" stop-color="${c.colors.gold}" stop-opacity="0.20"/>
      <stop offset="0.55" stop-color="${c.colors.gold}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="14" fill="none" stroke="${c.colors.gold}" stroke-opacity="0.28"/>
  <image href="${logoUri}" x="${pad}" y="60" width="${logoW}" height="${logoH}"/>
  <text x="${pad}" y="262" font-family='${c.uiFont}' font-size="22" letter-spacing="4" fill="${c.colors.gold2}" font-weight="600">${xmlEscape(post.category.toUpperCase())}</text>
  <text font-family='${c.titleFont}' font-size="${fontSize}" fill="${c.colors.text}" font-style="italic">${tspans}</text>
  <rect x="${pad}" y="${H - 92}" width="${W - 2 * pad}" height="1" fill="${c.colors.gold}" fill-opacity="0.4"/>
  <text x="${pad}" y="${H - 56}" font-family='${c.uiFont}' font-size="20" fill="${c.colors.dim}">${xmlEscape(footer)}</text>
  <text x="${W - pad}" y="${H - 56}" text-anchor="end" font-family='${c.uiFont}' font-size="20" fill="${c.colors.gold2}" font-weight="600">${xmlEscape(BLOG_CONFIG.identity.siteHost)}</text>
</svg>`;
    const outDir = join(root, BLOG_CONFIG.paths.assetDir);
    ensureDir(outDir);
    const outFile = join(outDir, `${post.slug}.jpg`);
    await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toFile(outFile);
    return rel;
}
export async function generateCoverImage(root, post, topic, ordinal, dryRun = false) {
    const ogImage = await makeOgCard(root, post, dryRun);
    const aiHero = dryRun ? null : await generateAiHero(root, post, topic);
    if (aiHero)
        return { ...aiHero, ogImage, source: 'ai-generated' };
    const fallback = HERO_PHOTOS[ordinal % HERO_PHOTOS.length];
    return { image: fallback.url, imageAlt: fallback.alt, ogImage, source: 'curated-fallback' };
}
export function gradientForOrdinal(ordinal) {
    return GRADIENTS[ordinal % GRADIENTS.length];
}
//# sourceMappingURL=images.js.map