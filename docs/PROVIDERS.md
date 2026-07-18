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

## Environment variables

See [.env.example](../.env.example) for the complete annotated list:

| Var | Needed for | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` (or `text.apiKeyEnv`) | default text provider | not needed with a `generateText` hook |
| `VERCEL_AI_GATEWAY_BLOG_KEY` / `VERCEL_AI_GATEWAY_KEY` | default image provider | absent → curated fallback photos |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` | GSC demand queries + sitemap resubmit | optional; absent → editorial pool only |
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
