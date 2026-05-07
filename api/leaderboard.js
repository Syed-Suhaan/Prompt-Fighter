import { getLeaderboard, submitLeaderboard } from "./_leaderboard-core.js";

function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      res.status(200).json(await getLeaderboard());
      return;
    }

    if (req.method === "POST") {
      res.status(200).json(await submitLeaderboard(getBody(req)));
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
}
