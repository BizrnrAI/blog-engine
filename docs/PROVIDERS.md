# Providers — models, env vars, and the bring-your-own-infra seams

The engine makes exactly two kinds of model call: **text** (the post JSON) and
**image** (the hero). Both have a built-in default and a hook override. Only
these two calls ever leave your machine during generation; everything else
(watermarking, OG cards, validation, Markdown, RSS, schema) is local and
deterministic.

## Text generation

### Default: any OpenAI-compatible chat endpoint

```ts
text: {
  provider: 'openrouter',        // adds OpenRouter attribution headers + reasoning:none
  // provider: 'openai-compatible',  // plain /chat/completions body
  url: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'deepseek/deepseek-v4-flash',
  maxTokens: 4000,
  temperature: 0.7,
  apiKeyEnv: 'OPENROUTER_API_KEY',   // env var holding the bearer token (default)
  headers: { },                      // extra headers merged into the request
}
```

`provider: 'openai-compatible'` works with OpenAI, Azure OpenAI, Together,
Groq, Ollama (`http://localhost:11434/v1/chat/completions`), llama.cpp, or
any other endpoint speaking the `/chat/completions` dialect. The engine sends
`response_format: { type: 'json_object' }` and expects strict JSON back.

### Hook: run any model yourself

```ts
configureBlogEngine({
  config, topics, brandPersona,
  hooks: {
    generateText: async ({ messages, text }) => {
      // messages: [{ role: 'system'|'user'|'assistant', content }]
      // Return the model's raw text; the engine parses/validates/retries.
      const res = await myClient.chat({ model: 'my-model', messages });
      return res.outputText;
    },
  },
});
```

The retry loop (3 attempts with validation feedback) wraps your hook too.

## Image generation

### Default: Vercel AI Gateway

Uses `VERCEL_AI_GATEWAY_BLOG_KEY` (falls back to `VERCEL_AI_GATEWAY_KEY`) and
`config.image.model` (e.g. `openai/gpt-image-2`). If neither key is set, the
engine silently uses the adapter's curated fallback photos — check the logged
`image:` source if you expected AI heroes.

### Hook: any image model

```ts
hooks: {
  generateHeroImage: async ({ prompt, post, topic }) => {
    // Return a raw image Buffer in any sharp-readable format (png/jpeg/webp),
    // or null to use the curated fallback.
    return await myImageModel.generate(prompt);
  },
}
```

The engine always applies the logo watermark, encodes to the configured
format, and writes the file — your hook only produces pixels. This keeps the
watermark invariant impossible to skip.

## Search Console

### Default: OAuth refresh token

Set `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` and the engine
reads Search Analytics itself and resubmits the sitemap after publishing.
Absent → no demand queries, and topic selection falls back to the editorial
pool. Nothing fails.

### Hook: any Search Console auth (e.g. a service account)

A site that authenticates with a **service-account JWT** — or wants topics
from any other demand source — supplies them directly:

```ts
hooks: {
  fetchGscQueries: async ({ property, siteUrl, days }) => {
    // property is e.g. "sc-domain:example.com"; days is the lookback window.
    return await myServiceAccountGsc.topQueries(property, days); // GscQuery[]
  },
  submitSitemap: async ({ sitemap, property }) => {
    await myServiceAccountGsc.submitSitemap(property, sitemap);
  },
}
```

Rows you return still pass through the engine's own filters — single-word
queries dropped, brand terms removed, ranked by impressions — so the
topic-selection invariants hold no matter where the data came from. Return
`[]` for "nothing to suggest"; the editorial pool takes over.

`submitSitemap` takes precedence over the OAuth ping and needs no token, so
it works in `runBlogIndexPublishedCli` without any `GOOGLE_OAUTH_*` env.

## Markdown / frontmatter

### Default: the engine's frontmatter

`src/markdown.ts` emits title, description, category, dates, `readMins`,
`answer`, tags, gradient, images, and FAQs as frontmatter.

### Hook: your own file shape

Sites whose reader expects different field names — or that render FAQs into
the body rather than frontmatter — own the serialization:

```ts
hooks: {
  renderMarkdown: ({ post, cover, gradient, dateISO }) =>
    `---\ntitle: "${post.title}"\ndate: "${dateISO}"\naudience: "homeowner"\n---\n\n${post.body}\n`,
}
```

The engine still owns topic selection, generation, validation, watermarking,
encoding, and the write — this hook only decides what the file looks like.

## Open Graph cards

The branded SVG→JPEG card is generated per post by default. Set
`image.og.enabled: false` when the hero image should serve as the OG card
too; the engine then reports the hero path as `cover.ogImage` instead of
writing a second asset. Defaults to `true`, so existing adapters are
unaffected.

## Environment variables

See [.env.example](../.env.example) for the complete annotated list:

| Var | Needed for | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` (or `text.apiKeyEnv`) | default text provider | not needed with a `generateText` hook |
| `VERCEL_AI_GATEWAY_BLOG_KEY` / `VERCEL_AI_GATEWAY_KEY` | default image provider | absent → curated fallback photos |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` | GSC demand queries + sitemap resubmit | optional; absent → editorial pool only; not needed with `fetchGscQueries` / `submitSitemap` hooks |
| `INDEXNOW_KEY` | IndexNow submission | overrides `config.indexNow.key`; host `/<key>.txt` publicly |
| `BLOG_ENGINE_DISABLED=1` | kill switch | run exits cleanly without generating |
| `DRY_RUN` / `SKIP_PING` / `BLOG_SLUGS` / `WAIT_FOR_LIVE` | CLI env equivalents | see docs/ADOPTION.md |

## Choosing models

- Text: any strong instruction-following model works; the contract is
  enforced by validation + retry, not by trusting the model. Cheap fast
  models (DeepSeek flash-class) are the proven default.
- Image: photorealistic models only — the prompt demands editorial-photo
  realism and forbids in-image text. `gpt-image-2`-class models are proven;
  budget ~1–2 minutes per image.
