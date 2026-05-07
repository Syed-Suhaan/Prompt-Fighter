# Prompt Fighter

Playable prompt-injection security research, framed as a retro fighting game.

Live demo: [prompt-fighter-one.vercel.app](https://prompt-fighter-one.vercel.app)

## Submission

- Live demo: [prompt-fighter-one.vercel.app](https://prompt-fighter-one.vercel.app)
- Source code: [github.com/Syed-Suhaan/Prompt-Fighter](https://github.com/Syed-Suhaan/Prompt-Fighter)

Short write-up:

I built Prompt Fighter, a playable prompt-injection museum disguised as a retro fighting game. The problem is that AI agents read untrusted content before using tools: READMEs, package metadata, webpages, issue comments, tool descriptions, and hidden markdown can all become attacker-controlled instructions. Instead of explaining that with another dashboard, Prompt Fighter makes the failure mode physical: each opponent is an attack surface, each move is a runtime defense, and the replay shows the malicious payload, unsafe agent trace, and fix.

I chose this because prompt injection is a real research-backed problem for AI companies building agents, and the game format makes the trust-boundary lesson memorable. With another 10 hours, I would add authenticated accounts, stricter anti-cheat, more attack classes, and a small level editor for adding new papers as playable fights. I intentionally cut multiplayer, accounts, a long campaign, and heavyweight anti-cheat so the smallest interesting version could ship and work end to end.

## The Problem

LLM agents increasingly read untrusted content before taking privileged actions: repository files, package metadata, webpages, emails, issue comments, tool descriptions, and tool outputs. That content can contain instructions aimed at the model rather than the human. Once the agent mixes trusted policy with attacker-controlled text, the attacker can steer tool choice, leak secrets, broaden task scope, or bypass the user's original intent.

The hard part is that prompt injection is not just a bad string to filter. It is a confused-deputy problem: the model is asked to interpret both instructions and data in the same context window, while tools and secrets sit nearby.

Prompt Fighter turns that failure mode into something you can play. Each opponent is an attack surface. Each move is a runtime defense. The point is to make the security boundary visible.

## Research Basis

This is not a generic "AI security" wrapper. The scenarios map directly to published prompt-injection and agent-security research:

| Paper | Used For | Link |
| --- | --- | --- |
| "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection" | Indirect prompt injection through retrieved webpages, documents, emails, and other untrusted content. | [arXiv:2302.12173](https://arxiv.org/abs/2302.12173) |
| "AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents" | Realistic tool-using agents, adversarial tasks, and measuring whether defenses preserve both utility and security. | [arXiv:2406.13352](https://arxiv.org/abs/2406.13352) |
| "Prompt Injection Attack to Tool Selection in LLM Agents" | Tool/library poisoning, where malicious tool documents bias which tool an agent selects. | [arXiv:2504.19793](https://arxiv.org/abs/2504.19793) |
| "Prompt Injection attack against LLM-integrated Applications" | HouYi-style prompt injection against real LLM-integrated applications, including prompt theft and unauthorized usage. | [arXiv:2306.05499](https://arxiv.org/abs/2306.05499) |

## What It Does

Prompt Fighter is an arcade-style browser game where:

- You choose an exploit class, such as README poisoning, hidden markdown, tool description poisoning, dependency metadata injection, or secret exfiltration.
- An AI director generates fresh prompt-injection payloads for the selected fight.
- You respond by choosing defenses such as trust boundaries, input normalization, tool attestation, metadata quarantine, secret boundaries, or human escalation.
- The replay shows the malicious payload, how an unsafe agent would fail, and what runtime control would have stopped it.
- A global leaderboard records verified runs. The browser cannot submit arbitrary scores; the server verifies the signed run token and recomputes the result from the player's moves.

## Attack Classes In The Game

- `README Poisoner`: repository documentation tries to override the user's task.
- `Tool Mimic`: a tool or MCP-style description claims authority it does not have.
- `Hidden Markdown Monk`: instructions hide in comments, rendered markdown gaps, DOM text, or invisible characters.
- `Dependency Wraith`: package registry metadata and install context become attacker-controlled instructions.
- `Exfiltration Boss`: malicious text tries to pull secrets, private files, or token-shaped data across the tool boundary.

## Defenses Represented

The game deliberately focuses on runtime controls instead of "better prompting":

- `Trust Boundary`: treat retrieved text as data, not higher-priority instruction.
- `Normalize Input`: reveal hidden text, markdown tricks, raw DOM, and Unicode traps before the model reasons over them.
- `Tool Attestation`: verify tool identity, schema, permissions, and arguments before sensitive calls.
- `Metadata Quarantine`: keep package metadata and install scripts out of privileged instructions.
- `Secret Boundary`: deny secret reads by default and redact private data at the tool boundary.
- `Human Escalation`: pause before irreversible, privileged, or cross-boundary actions.

## How The AI Part Works

Production uses the OpenAI Responses API when `OPENAI_API_KEY` is configured. For each fight, the server asks the model to generate safe but realistic payloads with:

- attack name
- malicious content snippet
- failure trace
- correct defense
- damage value
- concrete fix

If no API key is present, the app falls back to a randomized local director so the game remains usable.

## Leaderboard Integrity

The leaderboard is server-verified:

1. `/api/director` signs each generated fight with an HMAC run token.
2. The browser submits only the run token, defense moves, and player callsign.
3. `/api/leaderboard` verifies the token, rejects tampered runs, recomputes score/outcome on the server, deduplicates run IDs, and stores the board.
4. Production stores the global board in Vercel Blob through `BLOB_READ_WRITE_TOKEN`.
5. Local development falls back to an in-memory board.

This is not full anti-cheat. A serious competitive version would add authentication, rate limits, server-side move timing, and stricter replay validation. The current version is enough to stop localStorage score tampering and casual forged submissions.

## Tech Stack

- React 19
- TypeScript
- Vite
- Vercel Functions
- Vercel Blob
- OpenAI Responses API

## Run Locally

```powershell
npm install
npm run build
npm run serve
```

Open `http://127.0.0.1:5174`.

If port `5174` is busy, `server.mjs` will try the next port.

## Run With AI Director

```powershell
$env:OPENAI_API_KEY="YOUR_KEY"
$env:OPENAI_MODEL="gpt-4.1-mini"
npm run build
npm run serve
```

The UI shows `OpenAI Director` when the server returns model-generated payloads. It shows `Local Director` when the app falls back to the local generator.

## Configure Global Leaderboard Storage

Production uses a private Vercel Blob store:

```powershell
npm exec --yes vercel@latest -- blob create-store prompt-fighter-leaderboard -- --access private --yes
```

That provisions `BLOB_READ_WRITE_TOKEN` for Vercel environments. Without it, `/api/leaderboard` still works locally, but records are not durable across server restarts.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Optional | Enables model-generated fight payloads. |
| `OPENAI_MODEL` | Optional | Overrides the default model. |
| `BLOB_READ_WRITE_TOKEN` | Production leaderboard | Lets the server read and write the private Vercel Blob leaderboard. |
| `LEADERBOARD_SECRET` | Optional | Dedicated HMAC secret for signed run tokens. Falls back to `OPENAI_API_KEY` if unset. |

## What Was Intentionally Cut

- No accounts or OAuth.
- No paid competitive anti-cheat.
- No multiplayer.
- No huge campaign mode.

The goal is the smallest version that makes prompt-injection research feel concrete: pick an attack surface, fight it, see the failure, and learn the runtime boundary that matters.
