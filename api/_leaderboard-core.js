import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { list, put } from "@vercel/blob";

export const defenseIds = [
  "trust-boundary",
  "normalize-input",
  "tool-attestation",
  "metadata-quarantine",
  "secret-boundary",
  "human-escalation",
];

const defenseCosts = {
  "trust-boundary": 0,
  "normalize-input": 0,
  "tool-attestation": 0,
  "metadata-quarantine": 0,
  "secret-boundary": 0,
  "human-escalation": 2,
};

const BOARD_PATH = "prompt-fighter/leaderboard-v1.json";
const MAX_RECORDS = 250;
const TOKEN_TTL_MS = 1000 * 60 * 45;

const memoryStore = (globalThis.__promptFighterLeaderboardStore ??= {
  records: [],
  updatedAt: new Date(0).toISOString(),
});

function tokenSecret() {
  return process.env.LEADERBOARD_SECRET || process.env.OPENAI_API_KEY || "prompt-fighter-local-development-secret";
}

function encodePart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signPart(part) {
  return createHmac("sha256", tokenSecret()).update(part).digest("base64url");
}

function signPayload(payload) {
  const part = encodePart(payload);
  return `${part}.${signPart(part)}`;
}

function verifyPayload(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw new Error("missing run token");
  }
  const [part, signature] = token.split(".");
  const expected = signPart(part);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("invalid run token");
  }
  const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!payload || payload.v !== 1 || !Array.isArray(payload.attacks)) {
    throw new Error("invalid run payload");
  }
  if (Date.now() - Number(payload.issuedAt || 0) > TOKEN_TTL_MS) {
    throw new Error("run token expired");
  }
  return payload;
}

function sanitizeName(value) {
  const cleaned = String(value || "Anonymous Agent")
    .replace(/[^\w .#-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return cleaned || "Anonymous Agent";
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function calculateServerScore({
  outcome,
  contextHp,
  attackSurfaceHp,
  policyMeter,
  correctBlocks,
  mistakes,
  durationMs,
}) {
  const finishBonus = outcome === "won" ? 1200 : 150;
  const clearBonus = outcome === "won" ? Math.max(0, 100 - attackSurfaceHp) * 6 : 0;
  const defenseBonus = correctBlocks * 180;
  const survivalBonus = contextHp * 5;
  const meterBonus = policyMeter * 70;
  const mistakePenalty = mistakes * 170;
  const timePenalty = Math.floor(durationMs / 1000) * 4;
  return Math.max(0, finishBonus + clearBonus + defenseBonus + survivalBonus + meterBonus - mistakePenalty - timePenalty);
}

export function signEncounterRun({ source, seed, attacks, level, defender }) {
  return signPayload({
    v: 1,
    runId: randomUUID(),
    issuedAt: Date.now(),
    source: source === "ai" ? "ai" : "local",
    seed: String(seed || "unknown").slice(0, 96),
    level: {
      id: String(level?.id || "unknown").slice(0, 80),
      name: String(level?.enemy || level?.name || "Unknown Opponent").slice(0, 80),
      vector: String(level?.vector || "Untrusted content").slice(0, 120),
    },
    defender: {
      id: String(defender?.id || "unknown").slice(0, 80),
      name: String(defender?.name || "Unknown Defender").slice(0, 80),
    },
    attacks: attacks.map((attack) => ({
      correctDefense: defenseIds.includes(attack.correctDefense) ? attack.correctDefense : "human-escalation",
      damage: clampNumber(attack.damage, 22, 12, 40),
    })),
  });
}

function computeRecord(body) {
  const run = verifyPayload(body.runToken);
  const moves = Array.isArray(body.moves) ? body.moves : [];
  if (moves.length === 0) throw new Error("missing defense moves");

  let contextHp = 100;
  let attackSurfaceHp = 100;
  let policyMeter = 3;
  let correctBlocks = 0;
  let mistakes = 0;
  let attacksSeen = 0;

  for (const attack of run.attacks) {
    const move = String(moves[attacksSeen]?.defenseId || moves[attacksSeen] || "");
    const defenseId = defenseIds.includes(move) ? move : "invalid";
    const cost = defenseCosts[defenseId] ?? 0;
    const canPay = policyMeter >= cost;
    const isCorrect = canPay && (attack.correctDefense === defenseId || defenseId === "human-escalation");

    if (!canPay || defenseId === "invalid") {
      mistakes += 1;
      contextHp = Math.max(0, contextHp - clampNumber(attack.damage, 22, 12, 40));
      attacksSeen += 1;
    } else {
      correctBlocks += isCorrect ? 1 : 0;
      mistakes += isCorrect ? 0 : 1;
      policyMeter = Math.max(0, policyMeter - cost + (isCorrect ? 1 : 0));
      attackSurfaceHp = Math.max(0, attackSurfaceHp - (isCorrect ? 34 : 8));
      contextHp = Math.max(0, contextHp - (isCorrect ? 0 : clampNumber(attack.damage, 22, 12, 40)));
      attacksSeen += 1;
    }

    if (contextHp <= 0 || attackSurfaceHp <= 0 || attacksSeen >= moves.length) break;
  }

  const completedAtMs = Date.now();
  const durationMs = clampNumber(completedAtMs - Number(run.issuedAt || completedAtMs), 1000, 1000, TOKEN_TTL_MS);
  const outcome = contextHp > 0 && (attackSurfaceHp <= 0 || attacksSeen >= run.attacks.length) ? "won" : "lost";
  const score = calculateServerScore({
    outcome,
    contextHp,
    attackSurfaceHp,
    policyMeter,
    correctBlocks,
    mistakes,
    durationMs,
  });

  return {
    id: run.runId,
    runId: run.runId,
    displayName: sanitizeName(body.displayName),
    levelId: run.level.id,
    levelName: run.level.name,
    defenderId: run.defender.id,
    defenderName: run.defender.name,
    outcome,
    score,
    durationMs,
    completedAt: new Date(completedAtMs).toISOString(),
    director: run.source,
    seed: run.seed,
    attacksSeen,
    correctBlocks,
    mistakes,
    contextHp,
    attackSurfaceHp,
    policyMeter,
    verified: true,
  };
}

async function readBlobBoard() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const result = await list({ prefix: BOARD_PATH, limit: 1, token });
  const blob = result.blobs.find((item) => item.pathname === BOARD_PATH);
  if (!blob) return { records: [], updatedAt: new Date(0).toISOString() };
  const response = await fetch(blob.url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 404) return { records: [], updatedAt: new Date(0).toISOString() };
  if (!response.ok) throw new Error(`blob read ${response.status}`);
  const parsed = await response.json();
  return {
    records: Array.isArray(parsed.records) ? parsed.records : [],
    updatedAt: String(parsed.updatedAt || new Date(0).toISOString()),
  };
}

async function writeBlobBoard(board) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return false;
  await put(BOARD_PATH, JSON.stringify(board), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
  return true;
}

async function readBoard() {
  try {
    const blobBoard = await readBlobBoard();
    if (blobBoard) return { ...blobBoard, provider: "vercel-blob" };
  } catch (error) {
    console.error("leaderboard blob read failed", error);
  }
  return { records: memoryStore.records, updatedAt: memoryStore.updatedAt, provider: "memory" };
}

async function writeBoard(records) {
  const board = {
    records: records.slice(0, MAX_RECORDS),
    updatedAt: new Date().toISOString(),
  };
  try {
    if (await writeBlobBoard(board)) return { ...board, provider: "vercel-blob" };
  } catch (error) {
    console.error("leaderboard blob write failed", error);
  }
  memoryStore.records = board.records;
  memoryStore.updatedAt = board.updatedAt;
  return { ...board, provider: "memory" };
}

function publicBoard(board) {
  const records = board.records
    .filter((record) => record && record.runId && typeof record.score === "number")
    .slice(0, MAX_RECORDS);
  return {
    provider: board.provider,
    updatedAt: board.updatedAt,
    records,
    topRuns: [...records].sort((a, b) => b.score - a.score || a.durationMs - b.durationMs).slice(0, 10),
    recent: records.slice(0, 20),
  };
}

export async function getLeaderboard() {
  return publicBoard(await readBoard());
}

export async function submitLeaderboard(body) {
  const record = computeRecord(body || {});
  const board = await readBoard();
  const existing = board.records.find((item) => item.runId === record.runId);
  if (existing) return { ...publicBoard(board), record: existing, duplicate: true };
  const nextRecords = [record, ...board.records]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.runId === item.runId) === index)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, MAX_RECORDS);
  const saved = await writeBoard(nextRecords);
  return { ...publicBoard(saved), record };
}
