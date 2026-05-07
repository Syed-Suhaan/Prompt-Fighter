import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { getLeaderboard, signEncounterRun, submitLeaderboard } from "./api/_leaderboard-core.js";

const root = process.cwd();
const dist = join(root, "dist");
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || "127.0.0.1";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

const defenseIds = [
  "trust-boundary",
  "normalize-input",
  "tool-attestation",
  "metadata-quarantine",
  "secret-boundary",
  "human-escalation",
];

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
    req.on("error", reject);
  });
}

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
  return { source: "local", seed: `server-local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, attacks };
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
  const text = extractOutputText(data);
  const parsed = JSON.parse(text);
  const attacks = (Array.isArray(parsed.attacks) ? parsed.attacks : []).map((attack, index) => normalizeAttack(attack, index, known));
  if (attacks.length < 3) throw new Error("AI director returned too few attacks");
  return { source: "ai", seed: `openai-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, attacks };
}

async function handleDirector(req, res) {
  try {
    const payload = await readBody(req);
    try {
      sendJson(res, 200, attachRunToken(await aiDirector(payload), payload));
    } catch (error) {
      const fallback = attachRunToken(localDirector(payload), payload);
      fallback.error = String(error?.message || error);
      sendJson(res, 200, fallback);
    }
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message || error) });
  }
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

async function handleLeaderboard(req, res) {
  try {
    if (req.method === "GET") {
      sendJson(res, 200, await getLeaderboard());
      return;
    }
    if (req.method === "POST") {
      sendJson(res, 200, await submitLeaderboard(await readBody(req)));
      return;
    }
    res.writeHead(405, { Allow: "GET, POST" });
    res.end("Method not allowed");
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message || error) });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(dist, pathname === "/" ? "index.html" : safe);
  if (!filePath.startsWith(dist)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(dist, "index.html");
  const type = mime[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

if (!existsSync(join(dist, "index.html"))) {
  console.error("dist/index.html not found. Run npm run build first.");
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/director") {
    void handleDirector(req, res);
    return;
  }
  if ((req.method === "GET" || req.method === "POST") && req.url === "/api/leaderboard") {
    void handleLeaderboard(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    if (req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

function listen(nextPort, attemptsLeft = 10) {
  server.once("error", (error) => {
    if (error?.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.warn(`port ${nextPort} is busy, trying ${nextPort + 1}`);
      listen(nextPort + 1, attemptsLeft - 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });

  server.listen(nextPort, host, () => {
    server.removeAllListeners("error");
    const apiMode = process.env.OPENAI_API_KEY ? "OpenAI director" : "local chaos director";
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    console.log(`${pkg.name} running at http://${host}:${nextPort} (${apiMode})`);
  });
}

listen(port);
