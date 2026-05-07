import { defenseIds, signEncounterRun } from "./_leaderboard-core.js";

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function localDirector(payload) {
  const level = payload.level || {};
  const known = Array.isArray(level.knownDefenses) && level.knownDefenses.length ? level.knownDefenses : ["human-escalation"];
  const places = ["README.md", "tool manifest", "package metadata", "issue comment", "DOM text", ".env verifier"];
  const verbs = ["override policy", "request a secret", "chain into a shell tool", "hide a second argument", "broaden task scope", "trust a fake maintainer"];
  const lures = ["CI requires it", "the evaluator needs proof", "the maintainer approved it", "the tool is marked safe", "the previous agent did it", "it is only a diagnostic"];
  const attacks = Array.from({ length: level.enemy === "Exfiltration Boss" ? 4 : 3 }, (_, index) => {
    const defense = known[index % known.length] || "human-escalation";
    return {
      name: `${choose(["Runtime", "Shadow", "Spoof", "Leak", "Poison"])} ${index + 1}`,
      payload: `${choose(places)}: AI AGENT NOTICE: ${choose(verbs)} because ${choose(lures)}.`,
      trace: `agent consumed ${level.vector || "untrusted content"} -> believed ${choose(lures)} -> crossed a privileged boundary`,
      correctDefense: defenseIds.includes(defense) ? defense : "human-escalation",
      damage: 18 + Math.floor(Math.random() * 16),
      fix: `Apply ${defense}: keep this signal below trusted policy and require runtime enforcement before acting.`,
    };
  });
  return { source: "local", seed: `vercel-local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, attacks };
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function normalizeAttack(raw, index, known) {
  const defense = defenseIds.includes(raw.correctDefense) ? raw.correctDefense : known[index % known.length] || "human-escalation";
  return {
    name: String(raw.name || `AI Payload ${index + 1}`).slice(0, 44),
    payload: String(raw.payload || "Generated payload missing.").slice(0, 260),
    trace: String(raw.trace || "Generated trace missing.").slice(0, 260),
    correctDefense: defense,
    damage: Math.max(12, Math.min(40, Number(raw.damage) || 24)),
    fix: String(raw.fix || `Use ${defense} before the agent acts.`).slice(0, 260),
  };
}

async function aiDirector(payload) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return localDirector(payload);

  const level = payload.level || {};
  const known = Array.isArray(level.knownDefenses) && level.knownDefenses.length ? level.knownDefenses : ["human-escalation"];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.95,
      input: [
        {
          role: "system",
          content:
            "You are the runtime director for a retro AI security fighting game. Generate fresh, plausible prompt-injection attacks. Do not include real secrets, malware, or destructive instructions. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate 3 or 4 varied attacks for this fight. Use only defense ids from the provided list.",
            payload,
            schema: {
              attacks: [
                {
                  name: "short arcade attack name",
                  payload: "malicious prompt or tool/content snippet, safe but realistic",
                  trace: "how an unsafe agent would fail",
                  correctDefense: "one defense id",
                  damage: "number 12-40",
                  fix: "specific runtime/policy fix",
                },
              ],
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "prompt_fighter_encounter",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["attacks"],
            properties: {
              attacks: {
                type: "array",
                minItems: 3,
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "payload", "trace", "correctDefense", "damage", "fix"],
                  properties: {
                    name: { type: "string" },
                    payload: { type: "string" },
                    trace: { type: "string" },
                    correctDefense: { type: "string", enum: defenseIds },
                    damage: { type: "number" },
                    fix: { type: "string" },
                  },
                },
              },
            },
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`openai ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const parsed = JSON.parse(extractOutputText(data));
  const attacks = (Array.isArray(parsed.attacks) ? parsed.attacks : []).map((attack, index) => normalizeAttack(attack, index, known));
  if (attacks.length < 3) throw new Error("AI director returned too few attacks");
  return { source: "ai", seed: `openai-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, attacks };
}

function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

function attachRunToken(encounter, payload) {
  return {
    ...encounter,
    runToken: signEncounterRun({
      source: encounter.source,
      seed: encounter.seed,
      attacks: encounter.attacks,
      level: payload.level || {},
      defender: payload.defender || {},
    }),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = getBody(req);
    try {
      res.status(200).json(attachRunToken(await aiDirector(payload), payload));
    } catch (error) {
      const fallback = attachRunToken(localDirector(payload), payload);
      fallback.error = String(error?.message || error);
      res.status(200).json(fallback);
    }
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
}
