import { intro } from "@clack/prompts";
import pc from "picocolors";
import prompts from "prompts";

type HostEntry = {
  host: string;
  description?: string;
};

type PreviewState = {
  status: "idle" | "loading" | "ok" | "error";
  message: string;
  updatedAt?: number;
};

const palette = {
  bg: pc.bgBlue,
  fg: pc.white,
  accent: pc.cyan,
  muted: pc.gray,
  good: pc.green,
  warn: pc.yellow,
  bad: pc.red,
};

const HEADER = `${palette.accent("❯ superssh")} ${palette.muted("•")}`;
const FOOTER = `${palette.muted("[Enter] Connect  [q] Quit  [↑/↓] Navigate")}`;
const PREVIEW_CMD = "uptime && df -h / | tail -1";
const PREVIEW_TIMEOUT_MS = 1000;
const PREVIEW_DEBOUNCE_MS = 300;

function uniqHosts(entries: HostEntry[]): HostEntry[] {
  const seen = new Set<string>();
  const result: HostEntry[] = [];
  for (const entry of entries) {
    const key = entry.host.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

async function parseSshConfig(): Promise<HostEntry[]> {
  const configPath = `${Bun.env.HOME}/.ssh/config`;
  const exists = await Bun.file(configPath).exists();
  if (!exists) return [];
  const content = await Bun.file(configPath).text();
  const lines = content.split(/\r?\n/);
  const entries: HostEntry[] = [];
  let currentHosts: string[] = [];
  let currentDescription: string | undefined;
  let currentAliases: string[] = [];

  const flush = () => {
    const description =
      currentDescription ||
      (currentAliases.length > 0 ? currentAliases.join(", ") : undefined);
    for (const host of currentHosts) {
      if (host.includes("*") || host.includes("?")) continue;
      entries.push({ host, description });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      if (line.startsWith("#") && currentHosts.length > 0 && !currentDescription) {
        currentDescription = line.replace(/^#+\s?/, "").trim();
      }
      continue;
    }

    const hostNameMatch = /^hostname\s+(.+)$/i.exec(line);
    if (hostNameMatch) {
      currentAliases.push(hostNameMatch[1].trim());
      continue;
    }

    const userMatch = /^user\s+(.+)$/i.exec(line);
    if (userMatch) {
      currentAliases.push(`user:${userMatch[1].trim()}`);
      continue;
    }

    const portMatch = /^port\s+(.+)$/i.exec(line);
    if (portMatch) {
      currentAliases.push(`port:${portMatch[1].trim()}`);
      continue;
    }

    const match = /^host\s+(.+)$/i.exec(line);
    if (match) {
      if (currentHosts.length > 0) flush();
      currentHosts = match[1].split(/\s+/).filter(Boolean);
      currentDescription = undefined;
      currentAliases = [];
    }
  }

  if (currentHosts.length > 0) flush();
  return uniqHosts(entries);
}

function formatPreview(state: PreviewState): string {
  if (state.status === "loading") return palette.muted("Checking...");
  if (state.status === "ok") return palette.good(state.message);
  if (state.status === "error") return palette.warn(state.message);
  return palette.muted("Hover to preview");
}

function renderPreviewLine(host: string, state: PreviewState) {
  const label = palette.accent(host);
  const message = formatPreview(state);
  return `${label} ${palette.muted("•")} ${message}`;
}

function parsePreviewOutput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "No data";
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const uptimeLine = lines[0] ?? "";
  const dfLine = lines[lines.length - 1] ?? "";
  const loadMatch = /load averages?:\s*([0-9.,]+)\s*[ ,]+([0-9.,]+)\s*[ ,]+([0-9.,]+)/i.exec(
    uptimeLine
  );
  let load = "unknown";
  if (loadMatch) {
    load = `${loadMatch[1]} ${loadMatch[2]} ${loadMatch[3]}`;
  } else {
    const linuxMatch = /load average:\s*([0-9.,]+)\s*,\s*([0-9.,]+)\s*,\s*([0-9.,]+)/i.exec(
      uptimeLine
    );
    if (linuxMatch) load = `${linuxMatch[1]} ${linuxMatch[2]} ${linuxMatch[3]}`;
  }
  const dfParts = dfLine.split(/\s+/);
  const disk = dfParts.length >= 5 ? `${dfParts[4]} used` : "disk ?";
  return `Load ${load} • ${disk}`;
}

async function runPreview(host: string): Promise<PreviewState> {
  const args = [
    "-o",
    "ConnectTimeout=1",
    "-o",
    "BatchMode=yes",
    host,
    PREVIEW_CMD,
  ];
  const proc = Bun.spawn(["ssh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => {
    proc.kill();
  }, PREVIEW_TIMEOUT_MS);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timeout));

  if (exitCode !== 0) {
    const message = stderr.trim() || "Unavailable";
    return { status: "error", message };
  }

  return { status: "ok", message: parsePreviewOutput(stdout), updatedAt: Date.now() };
}

async function runSelector(hosts: HostEntry[]) {
  let activeHost = hosts[0]?.host ?? "";
  let preview: PreviewState = { status: "idle", message: "" };
  let previewToken = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentPrompt: { render: () => void; msg?: string; hint?: string } | null = null;

  const schedulePreview = (host: string) => {
    previewToken += 1;
    const token = previewToken;
    if (debounceTimer) clearTimeout(debounceTimer);
    preview = { status: "loading", message: "" };

    debounceTimer = setTimeout(async () => {
      try {
        const result = await runPreview(host);
        if (token === previewToken) {
          preview = result;
          currentPrompt?.render();
        }
      } catch (error) {
        if (token === previewToken) {
          preview = {
            status: "error",
            message: error instanceof Error ? error.message : "Preview failed",
          };
          currentPrompt?.render();
        }
      }
    }, PREVIEW_DEBOUNCE_MS);
  };

  schedulePreview(activeHost);

  const response = await prompts(
    {
      type: "select",
      name: "host",
      message: "Pick a host",
      choices: hosts.map((entry) => ({
        title: entry.host,
        description: entry.description,
        value: entry.host,
      })),
      hint: "",
      instructions: false,
      onState: (state) => {
        const host = hosts[state.value]?.host;
        if (host && host !== activeHost) {
          activeHost = host;
          schedulePreview(host);
        }
      },
      onRender() {
        currentPrompt = this as { render: () => void; msg?: string; hint?: string };
        const previewLine = activeHost
          ? renderPreviewLine(activeHost, preview)
          : palette.muted("Hover to preview");
        this.msg = `${HEADER}\n${previewLine}\nPick a host`;
        this.hint = FOOTER;
      },
    },
    {
      onCancel: () => {
        process.exit(0);
      },
    }
  );

  if (!response.host) return;
  const selected = response.host as string;
  await handoffToSsh(selected);
}

async function handoffToSsh(host: string) {
  process.stdout.write(`${palette.accent("Connecting to")} ${palette.fg(host)}\n`);
  const child = Bun.spawn(["ssh", host], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await child.exited;
  process.exit(exitCode ?? 0);
}

async function main() {
  intro(palette.accent("superssh"));
  const hosts = await parseSshConfig();
  if (hosts.length === 0) {
    process.stdout.write(
      `${palette.warn("No hosts found in ~/.ssh/config")}. Add entries and try again.\n`
    );
    return;
  }

  await runSelector(hosts);
}

await main();
