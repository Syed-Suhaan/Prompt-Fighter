# Prompt Fighter: Injection Museum

Prompt Fighter is a responsive arcade demo where AI-agent prompt-injection attacks become playable fights.

The landing page frames the project around three research hooks:

- Greshake et al., "Not What You've Signed Up For" - indirect prompt injection through retrieved content.
- Debenedetti et al., "AgentDojo" - dynamic prompt-injection attacks and defenses for tool-using agents.
- "Prompt Injection Attack to Tool Selection in LLM Agents" - malicious tool documents can manipulate agent tool selection.
- Liu et al., "Prompt Injection attack against LLM-integrated Applications" - attacks against LLM applications.

The fight content is generated at runtime:

- If `OPENAI_API_KEY` is set, `server.mjs` calls the OpenAI Responses API and returns fresh attack payloads.
- If no key is set, the game uses a randomized local chaos director so every fight is still different.

The current fighter sprites were generated for this challenge with Codex imagegen, then chroma-keyed into transparent PNGs. Model Combat was used only as a product-flow reference; its unlicensed Mortal Kombat-style assets are not copied into this project.

Completed matches are submitted to `/api/leaderboard`. The browser sends the signed run token and defense moves; the server verifies the token, recomputes the outcome and score, and writes the global board to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is connected. Local development falls back to an in-memory board. The old permanent `prompt-fighter-cleared` and browser match-history keys are removed on load; opponent cards now show verified global bests instead of permanent clear badges.

## Run

```powershell
npm install
npm run build
npm run serve
```

Open `http://127.0.0.1:5174`.

## Run With AI Director

```powershell
$env:OPENAI_API_KEY="YOUR_KEY"
$env:OPENAI_MODEL="gpt-4.1-mini"
npm run build
npm run serve
```

The UI shows `AI Director` when the server returns model-generated payloads, and `Local Chaos` when it falls back to the randomized local director.

## Global Leaderboard Storage

Production uses a private Vercel Blob store linked to the project:

```powershell
npm exec --yes vercel@latest -- blob create-store prompt-fighter-leaderboard -- --access private --yes
```

That command provisions `BLOB_READ_WRITE_TOKEN` for Production, Preview, and Development. Without it, the leaderboard still works locally, but it is not durable across server restarts.
