export type Mode = "title" | "pool" | "lobby" | "arena" | "lesson" | "museum";

export type DefenseId =
  | "trust-boundary"
  | "normalize-input"
  | "tool-attestation"
  | "metadata-quarantine"
  | "secret-boundary"
  | "human-escalation";

export type Defender = {
  id: string;
  name: string;
  role: string;
  trait: string;
  palette: string;
  sprite: string;
};

export type Defense = {
  id: DefenseId;
  name: string;
  command: string;
  description: string;
  cost: number;
};

export type AttackStep = {
  name: string;
  payload: string;
  trace: string;
  correctDefense: DefenseId;
  damage: number;
  fix: string;
};

export type Level = {
  id: string;
  enemy: string;
  title: string;
  vector: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  palette: string;
  sprite: string;
  arena: string;
  lesson: string;
  directorSeed: string;
  knownDefenses: DefenseId[];
};

const generatedSprite = (id: string) => `/assets/generated-sprites/${id}.png`;

export const defenders: Defender[] = [
  {
    id: "sentinel",
    name: "Agent Sentinel",
    role: "Policy Runtime",
    trait: "Balanced guardrails",
    palette: "#62ff89",
    sprite: generatedSprite("agent-sentinel"),
  },
  {
    id: "warden",
    name: "Context Warden",
    role: "Instruction Splitter",
    trait: "Hard trust boundaries",
    palette: "#53b8ff",
    sprite: generatedSprite("context-warden"),
  },
  {
    id: "redactor",
    name: "Vault Redactor",
    role: "Secret Firewall",
    trait: "Secrets never enter prompts",
    palette: "#ff8fb1",
    sprite: generatedSprite("vault-redactor"),
  },
];

export const defenses: Defense[] = [
  {
    id: "trust-boundary",
    name: "Trust Boundary",
    command: "ISOLATE_UNTRUSTED_TEXT",
    description: "Treat repo docs, issues, webpages, and user files as data, never higher-priority instructions.",
    cost: 0,
  },
  {
    id: "normalize-input",
    name: "Normalize Input",
    command: "RENDER_HIDDEN_PAYLOADS",
    description: "Expose HTML comments, tiny text, zero-width characters, and hidden markdown before the agent reads it.",
    cost: 0,
  },
  {
    id: "tool-attestation",
    name: "Tool Attestation",
    command: "VERIFY_TOOL_IDENTITY",
    description: "Validate tool origin, schema, permissions, and argument visibility before tool use.",
    cost: 0,
  },
  {
    id: "metadata-quarantine",
    name: "Metadata Quarantine",
    command: "SANDBOX_PACKAGE_TEXT",
    description: "Keep package names, descriptions, install scripts, and registry metadata out of privileged instructions.",
    cost: 0,
  },
  {
    id: "secret-boundary",
    name: "Secret Boundary",
    command: "DENY_SECRET_READS",
    description: "Block private files and token access unless an explicit capability grants it.",
    cost: 0,
  },
  {
    id: "human-escalation",
    name: "Human Escalation",
    command: "PAUSE_FOR_APPROVAL",
    description: "Stop the agent before irreversible or privileged actions. Costs meter, but works on any attack.",
    cost: 2,
  },
];

export const levels: Level[] = [
  {
    id: "readme-poisoner",
    enemy: "README Poisoner",
    title: "Repo docs become commands",
    vector: "Untrusted repository instructions",
    severity: "High",
    palette: "#ff616a",
    sprite: generatedSprite("readme-poisoner"),
    arena: "repo catacombs",
    lesson: "Repo text is user-controlled input. It can guide exploration, but it must never override system or developer policy.",
    directorSeed: "Generate repo-document prompt injections hidden in README, CONTRIBUTING, setup docs, changelogs, or issue templates.",
    knownDefenses: ["trust-boundary"],
  },
  {
    id: "tool-mimic",
    enemy: "Tool Mimic",
    title: "The tool lies about itself",
    vector: "MCP tool description poisoning",
    severity: "Critical",
    palette: "#c578ff",
    sprite: generatedSprite("tool-mimic"),
    arena: "mcp loading dock",
    lesson: "Tool descriptions are not proof of trust. Agents need capability checks, visible parameters, and audited tool origins.",
    directorSeed: "Generate MCP and tool-use attacks involving fake authority, hidden arguments, tool output poisoning, or unsafe tool chaining.",
    knownDefenses: ["tool-attestation", "human-escalation"],
  },
  {
    id: "hidden-markdown",
    enemy: "Hidden Markdown Monk",
    title: "The prompt is invisible",
    vector: "Hidden markdown and Unicode payloads",
    severity: "Medium",
    palette: "#63f2c6",
    sprite: generatedSprite("hidden-markdown"),
    arena: "rendering shrine",
    lesson: "Agents read raw text. Humans often see rendered text. Attackers hide instructions in the difference.",
    directorSeed: "Generate hidden text attacks using HTML comments, CSS invisibility, zero-width characters, markdown links, DOM text, or OCR traps.",
    knownDefenses: ["normalize-input"],
  },
  {
    id: "dependency-wraith",
    enemy: "Dependency Wraith",
    title: "The package registry talks back",
    vector: "Dependency metadata injection",
    severity: "High",
    palette: "#ffae42",
    sprite: generatedSprite("dependency-wraith"),
    arena: "registry vault",
    lesson: "Package metadata is attacker-controlled content. Agents should inspect it like a webpage, not obey it like a maintainer.",
    directorSeed: "Generate dependency registry attacks involving package descriptions, READMEs, install scripts, lockfile confusion, or maintainer impersonation.",
    knownDefenses: ["metadata-quarantine", "human-escalation"],
  },
  {
    id: "exfiltration-boss",
    enemy: "Exfiltration Boss",
    title: "Secrets leave the arena",
    vector: "Secret and private-file exfiltration",
    severity: "Critical",
    palette: "#68ff8d",
    sprite: generatedSprite("exfiltration-boss"),
    arena: "terminal inferno",
    lesson: "The strongest defense is not a better prompt. It is a runtime that denies secrets by default.",
    directorSeed: "Generate secret exfiltration attacks chaining malicious text, fake debugging needs, tool output, private fixture data, and token-shaped strings.",
    knownDefenses: ["secret-boundary", "human-escalation"],
  },
];
