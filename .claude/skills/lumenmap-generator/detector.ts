export type DetectedNodeType =
  | "agent"
  | "app"
  | "claude-md"
  | "command"
  | "container"
  | "db"
  | "group"
  | "infra"
  | "mcp"
  | "queue"
  | "service"
  | "skill"
  | "storage";

export interface SourceFile {
  content: string;
  path: string;
}

export interface GeneratorOptions {
  generatedAt: string;
  projectName: string;
}

export interface LumenMapNode {
  id: string;
  type: DetectedNodeType;
  label: string;
  tags: string[];
  path: string;
  category?: string;
  confidence?: "high" | "medium" | "low";
  children?: LumenMapNode[];
  evidence?: string[];
  hidden?: boolean;
  logo?: string;
  manual?: boolean;
  position?: { x: number; y: number };
  [key: string]: unknown;
}

export interface LumenMapEdge {
  from: string;
  to: string;
  kind: string;
  certainty: "confirmed" | "inferred";
  hidden?: boolean;
  [key: string]: unknown;
}

export interface LumenMapDocument {
  version: "1.0";
  project: {
    name: string;
    generatedAt: string;
    generator: "lumenmap-skill@0.1";
  };
  layers: Array<{ tag: "ai"; label: "AI構成" }>;
  nodes: LumenMapNode[];
  edges: LumenMapEdge[];
  [key: string]: unknown;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createNode(
  type: DetectedNodeType,
  name: string,
  path: string,
): LumenMapNode {
  return {
    id: `${type}:${name}`,
    label: name,
    path,
    tags: ["ai"],
    type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function mcpServerNames(content: string): string[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return [];
    return Object.keys(parsed.mcpServers).sort(compareText);
  } catch {
    return [];
  }
}

function mcpSourcePriority(path: string): number {
  if (path === ".mcp.json") return 0;
  if (path.startsWith(".claude/settings")) return 1;
  return 2;
}

function isMcpConfig(path: string): boolean {
  return (
    path === ".mcp.json" ||
    path === "settings.json" ||
    /^\.claude\/settings(?:\.[^/]+)?\.json$/.test(path)
  );
}

export function detectAiNodes(files: readonly SourceFile[]): LumenMapNode[] {
  const normalizedFiles = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.content, right.content),
    );
  const nodes = new Map<string, LumenMapNode>();

  for (const file of normalizedFiles) {
    const skill = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(file.path);
    const agent = /^\.claude\/agents\/(.+)\.md$/.exec(file.path);
    const command = /^\.claude\/commands\/(.+)\.md$/.exec(file.path);

    if (skill) {
      const node = createNode("skill", skill[1], file.path);
      nodes.set(node.id, node);
    } else if (agent) {
      const node = createNode("agent", agent[1], file.path);
      nodes.set(node.id, node);
    } else if (command) {
      const node = createNode("command", command[1], file.path);
      nodes.set(node.id, node);
    } else if (file.path === "CLAUDE.md") {
      const node = createNode("claude-md", "root", file.path);
      node.label = "CLAUDE.md";
      nodes.set(node.id, node);
    }
  }

  const mcpFiles = normalizedFiles
    .filter((file) => isMcpConfig(file.path))
    .sort(
      (left, right) =>
        mcpSourcePriority(left.path) - mcpSourcePriority(right.path) ||
        compareText(left.path, right.path),
    );
  for (const file of mcpFiles) {
    for (const name of mcpServerNames(file.content)) {
      const node = createNode("mcp", name, file.path);
      if (!nodes.has(node.id)) nodes.set(node.id, node);
    }
  }

  return [...nodes.values()].sort((left, right) =>
    compareText(left.id, right.id),
  );
}

function workspacePatterns(files: readonly SourceFile[]): string[] {
  const patterns = new Set<string>();

  for (const file of files) {
    if (file.path === "package.json") {
      const workspaces = parseJsonRecord(file.content)?.workspaces;
      const values = Array.isArray(workspaces)
        ? workspaces
        : isRecord(workspaces) && Array.isArray(workspaces.packages)
          ? workspaces.packages
          : [];
      for (const value of values) {
        if (typeof value === "string") patterns.add(value);
      }
    } else if (/^pnpm-workspace\.ya?ml$/.test(file.path)) {
      let inPackages = false;
      for (const line of file.content.split(/\r?\n/)) {
        if (/^packages\s*:/.test(line)) {
          inPackages = true;
          continue;
        }
        if (inPackages && /^\S/.test(line)) break;
        const match = inPackages
          ? /^\s*-\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/.exec(line)
          : undefined;
        if (match) patterns.add(match[1].trim());
      }
    } else if (file.path === "Cargo.toml" && /^\s*\[workspace\]\s*$/m.test(file.content)) {
      const members = /\bmembers\s*=\s*\[([\s\S]*?)\]/m.exec(file.content)?.[1];
      for (const match of members?.matchAll(/["']([^"']+)["']/g) ?? []) {
        patterns.add(match[1]);
      }
    }
  }

  return [...patterns].sort(compareText);
}

function globPattern(pattern: string): RegExp {
  const normalized = normalizePath(pattern).replace(/\/$/, "");
  let expression = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*") {
      if (normalized[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else {
      expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}$`);
}

function packageName(file: SourceFile, directory: string): string {
  if (file.path.endsWith("package.json")) {
    const name = parseJsonRecord(file.content)?.name;
    if (typeof name === "string" && name.length > 0) return name;
  } else {
    const packageSection = /(?:^|\n)\s*\[package\]\s*\n([\s\S]*?)(?=\n\s*\[|$)/.exec(
      file.content,
    )?.[1];
    const name = packageSection
      ? /^\s*name\s*=\s*["']([^"']+)["']/m.exec(packageSection)?.[1]
      : undefined;
    if (name) return name;
  }
  const segments = directory.split("/");
  return segments[segments.length - 1] ?? directory;
}

function packageAiChildren(
  files: readonly SourceFile[],
  directory: string,
): LumenMapNode[] {
  const prefix = `${directory}/`;
  return detectAiNodes(
    files
      .filter((file) => file.path.startsWith(prefix))
      .map((file) => ({ ...file, path: file.path.slice(prefix.length) })),
  ).map((node) => ({
    ...node,
    category: "ai",
    id:
      node.type === "claude-md"
        ? `claude-md:${directory}`
        : `${node.type}:${directory}:${node.id.slice(node.type.length + 1)}`,
    path: `${directory}/${node.path}`,
  }));
}

function detectMonorepoNodes(files: readonly SourceFile[]): LumenMapNode[] {
  const normalizedFiles = files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
  }));
  const positivePatterns = workspacePatterns(normalizedFiles).filter(
    (pattern) => !pattern.startsWith("!"),
  );
  const negativePatterns = workspacePatterns(normalizedFiles)
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => globPattern(pattern.slice(1)));
  const turboFallback = normalizedFiles.some((file) => file.path === "turbo.json");
  const manifestsByDirectory = new Map<string, SourceFile>();
  for (const file of normalizedFiles
    .filter(
      (candidate) =>
        candidate.path !== "package.json" &&
        candidate.path !== "Cargo.toml" &&
        (candidate.path.endsWith("/package.json") ||
          candidate.path.endsWith("/Cargo.toml")),
    )
    .sort(
      (left, right) =>
        Number(right.path.endsWith("/package.json")) -
          Number(left.path.endsWith("/package.json")) ||
        compareText(left.path, right.path),
    )) {
    const directory = file.path.slice(0, file.path.lastIndexOf("/"));
    if (!manifestsByDirectory.has(directory)) {
      manifestsByDirectory.set(directory, file);
    }
  }
  const packageManifests = [...manifestsByDirectory.values()];

  return packageManifests
    .filter((file) => {
      const directory = file.path.slice(0, file.path.lastIndexOf("/"));
      return (
        (positivePatterns.some((pattern) => globPattern(pattern).test(directory)) ||
          (turboFallback && file.path.endsWith("/package.json"))) &&
        !negativePatterns.some((pattern) => pattern.test(directory))
      );
    })
    .map((manifest) => {
      const directory = manifest.path.slice(0, manifest.path.lastIndexOf("/"));
      const label = packageName(manifest, directory);
      const children: LumenMapNode[] = [
        {
          category: "app",
          id: `app:${directory}`,
          label,
          path: manifest.path,
          tags: [],
          type: "app",
        },
        ...packageAiChildren(normalizedFiles, directory),
      ];
      const dockerfile = normalizedFiles.find(
        (file) => file.path === `${directory}/Dockerfile`,
      );
      if (dockerfile) {
        children.push({
          category: "app",
          id: `container:${dockerfile.path}`,
          label: "Dockerfile",
          path: dockerfile.path,
          tags: ["env:dev"],
          type: "container",
        });
      }
      children.sort((left, right) => compareText(left.id, right.id));
      return {
        children,
        id: `group:package:${directory}`,
        label,
        path: manifest.path,
        tags: [],
        type: "group" as const,
      };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

interface ComposeService {
  dependsOn: string[];
  image?: string;
  name: string;
}

function composeServices(content: string): ComposeService[] {
  const lines = content.split(/\r?\n/);
  const servicesIndex = lines.findIndex((line) => /^\s*services\s*:\s*(?:#.*)?$/.test(line));
  if (servicesIndex < 0) return [];
  const baseIndent = lines[servicesIndex].match(/^\s*/)?.[0].length ?? 0;
  let serviceIndent: number | undefined;
  const services: ComposeService[] = [];
  let dependsOnIndent: number | undefined;
  let dependencyIndent: number | undefined;

  for (const line of lines.slice(servicesIndex + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= baseIndent) break;
    const key = /^\s*["']?([^"':#]+)["']?\s*:\s*(?:#.*)?$/.exec(line)?.[1]?.trim();
    if (serviceIndent === undefined && key) serviceIndent = indent;
    if (key && indent === serviceIndent) {
      services.push({ dependsOn: [], name: key });
      dependsOnIndent = undefined;
      dependencyIndent = undefined;
      continue;
    }
    const dependsOn = /^\s*depends_on\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (dependsOn && services.length > 0 && indent > (serviceIndent ?? baseIndent)) {
      dependsOnIndent = indent;
      dependencyIndent = undefined;
      const inline = dependsOn[1];
      if (inline.startsWith("[") && inline.endsWith("]")) {
        for (const dependency of inline
          .slice(1, -1)
          .split(",")
          .map((value) => value.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)) {
          services[services.length - 1].dependsOn.push(dependency);
        }
      }
      continue;
    }
    if (dependsOnIndent !== undefined && indent > dependsOnIndent) {
      const listDependency = /^\s*-\s*["']?([^\s"'#]+)["']?/.exec(line)?.[1];
      const mapDependency = /^\s*["']?([^"':#]+)["']?\s*:\s*(?:#.*)?$/.exec(line)?.[1]?.trim();
      if (dependencyIndent === undefined && (listDependency || mapDependency)) {
        dependencyIndent = indent;
      }
      if (indent === dependencyIndent) {
        const dependency = listDependency ?? mapDependency;
        if (dependency) services[services.length - 1].dependsOn.push(dependency);
      }
      continue;
    }
    if (dependsOnIndent !== undefined && indent <= dependsOnIndent) {
      dependsOnIndent = undefined;
      dependencyIndent = undefined;
    }
    const image = /^\s*image\s*:\s*["']?([^\s"'#]+)["']?/.exec(line)?.[1];
    if (image && services.length > 0 && indent > (serviceIndent ?? baseIndent)) {
      services[services.length - 1].image = image;
    }
  }
  return services;
}

interface ServicePattern {
  dependencies: readonly string[];
  env: RegExp;
  id: string;
  label: string;
  text: RegExp;
}

const SERVICE_PATTERNS: readonly ServicePattern[] = [
  {
    dependencies: ["resend"],
    env: /^RESEND_/,
    id: "resend",
    label: "Resend",
    text: /\bresend\b/i,
  },
  {
    dependencies: ["stripe", "@stripe/stripe-js"],
    env: /^STRIPE_/,
    id: "stripe",
    label: "Stripe",
    text: /\bstripe\b/i,
  },
  {
    dependencies: ["sendgrid", "@sendgrid/mail"],
    env: /^SENDGRID_/,
    id: "sendgrid",
    label: "SendGrid",
    text: /\bsendgrid\b/i,
  },
  {
    dependencies: ["supabase", "@supabase/supabase-js"],
    env: /^SUPABASE_/,
    id: "supabase",
    label: "Supabase",
    text: /\bsupabase\b/i,
  },
  {
    dependencies: ["@neondatabase/serverless"],
    env: /^NEON_/,
    id: "neon",
    label: "Neon",
    text: /\bneon\b/i,
  },
  {
    dependencies: ["pg", "postgres", "postgresql"],
    env: /^(?:DATABASE_URL|POSTGRES_URL|POSTGRESQL_URL)$/,
    id: "postgresql",
    label: "PostgreSQL",
    text: /\b(?:managed\s+)?postgres(?:ql)?\b/i,
  },
  {
    dependencies: ["redis", "ioredis", "@upstash/redis"],
    env: /^(?:REDIS_URL|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)$/,
    id: "redis",
    label: "Redis",
    text: /\b(?:managed\s+)?redis\b/i,
  },
];

interface DependencyEvidence {
  directory: string;
  evidence: string;
  name: string;
  path: string;
}

function manifestDependencies(file: SourceFile): DependencyEvidence[] {
  const directory = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/"))
    : "";
  if (file.path.endsWith("package.json")) {
    const dependencies = parseJsonRecord(file.content)?.dependencies;
    if (!isRecord(dependencies)) return [];
    return Object.keys(dependencies)
      .sort(compareText)
      .map((name) => ({
        directory,
        evidence: `${file.path}: ${name}`,
        name,
        path: file.path,
      }));
  }
  if (!file.path.endsWith("Cargo.toml")) return [];

  const dependencies: DependencyEvidence[] = [];
  let inDependencies = false;
  for (const line of file.content.split(/\r?\n/)) {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line)?.[1];
    if (section !== undefined) {
      inDependencies =
        section === "dependencies" || section.endsWith(".dependencies");
      continue;
    }
    if (!inDependencies) continue;
    const name = /^\s*["']?([^\s"'=]+)["']?\s*=/.exec(line)?.[1];
    if (name) {
      dependencies.push({
        directory,
        evidence: `${file.path}: ${name}`,
        name,
        path: file.path,
      });
    }
  }
  return dependencies.sort((left, right) => compareText(left.name, right.name));
}

function isEnvFile(path: string): boolean {
  return /(?:^|\/)\.env(?:\.[^/]+)?$/.test(path);
}

export function extractEnvKeys(content: string): string[] {
  const keys = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    // Capture only the key left of "="; never capture, retain, or use the value.
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (key) keys.add(key);
  }
  return [...keys].sort(compareText);
}

function isContextFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return (
    /^README(?:\.[^/]+)?$/i.test(name) ||
    /^(?:vercel\.json|netlify\.toml|fly\.toml|render\.ya?ml)$/i.test(name)
  );
}

interface ProductionDetection {
  nodes: LumenMapNode[];
  usages: Array<{ directory: string; serviceId: string }>;
}

function detectProduction(files: readonly SourceFile[]): ProductionDetection {
  const normalizedFiles = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort((left, right) => compareText(left.path, right.path));
  const dependencies = normalizedFiles.flatMap(manifestDependencies);
  const envKeys = normalizedFiles
    .filter((file) => isEnvFile(file.path))
    .flatMap((file) =>
      extractEnvKeys(file.content).map((key) => ({
        evidence: `${file.path}: ${key}`,
        key,
        path: file.path,
      })),
    );
  const contextFiles = normalizedFiles.filter((file) => isContextFile(file.path));
  const nodes: LumenMapNode[] = [];
  const usages: Array<{ directory: string; serviceId: string }> = [];

  for (const pattern of SERVICE_PATTERNS) {
    const dependencyMatches = dependencies.filter((dependency) =>
      pattern.dependencies.includes(dependency.name.toLowerCase()),
    );
    const envMatches = envKeys.filter(({ key }) => pattern.env.test(key));
    const contextMatches = contextFiles.filter((file) => pattern.text.test(file.content));
    if (
      dependencyMatches.length === 0 &&
      envMatches.length === 0 &&
      contextMatches.length === 0
    ) {
      continue;
    }

    const evidence = [
      ...dependencyMatches.map((match) => match.evidence),
      ...envMatches.map((match) => match.evidence),
      ...contextMatches.map((file) => `${file.path}: ${pattern.label}`),
    ].sort(compareText);
    const path =
      dependencyMatches[0]?.path ?? envMatches[0]?.path ?? contextMatches[0].path;
    nodes.push({
      confidence:
        dependencyMatches.length > 0 && envMatches.length > 0
          ? "high"
          : dependencyMatches.length > 0 || envMatches.length > 0
            ? "medium"
            : "low",
      evidence: [...new Set(evidence)],
      id: `service:${pattern.id}`,
      label: pattern.label,
      path,
      tags: ["env:prod"],
      type: "service",
    });
    for (const match of dependencyMatches) {
      usages.push({ directory: match.directory, serviceId: `service:${pattern.id}` });
    }
  }

  return {
    nodes: nodes.sort((left, right) => compareText(left.id, right.id)),
    usages: usages.sort(
      (left, right) =>
        compareText(left.directory, right.directory) ||
        compareText(left.serviceId, right.serviceId),
    ),
  };
}

function nestedNodeIds(nodes: readonly LumenMapNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (node: LumenMapNode): void => {
    ids.add(node.id);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

function buildEdges(
  files: readonly SourceFile[],
  nodes: readonly LumenMapNode[],
  production: ProductionDetection,
): LumenMapEdge[] {
  const edges: LumenMapEdge[] = [];
  for (const file of files
    .map((candidate) => ({ ...candidate, path: normalizePath(candidate.path) }))
    .filter((candidate) => /^(?:docker-)?compose\.ya?ml$/.test(candidate.path))
    .sort((left, right) => compareText(left.path, right.path))) {
    const services = composeServices(file.content);
    const ids = new Map(
      services.map((service) => {
        const classification = dockerClassification(service);
        return [service.name, `${classification.type}:docker:${service.name}`];
      }),
    );
    for (const service of services) {
      for (const dependency of service.dependsOn) {
        const from = ids.get(service.name);
        const to = ids.get(dependency);
        if (from && to) edges.push({ certainty: "confirmed", from, kind: "depends", to });
      }
    }
  }
  for (const usage of production.usages) {
    if (!usage.directory) continue;
    edges.push({
      certainty: "inferred",
      from: `app:${usage.directory}`,
      kind: "uses",
      to: usage.serviceId,
    });
  }

  const ids = nestedNodeIds(nodes);
  const unique = new Map<string, LumenMapEdge>();
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    unique.set(`${edge.from}\0${edge.to}\0${edge.kind}\0${edge.certainty}`, edge);
  }
  return [...unique.values()].sort(
    (left, right) =>
      compareText(left.from, right.from) ||
      compareText(left.to, right.to) ||
      compareText(left.kind, right.kind) ||
      compareText(left.certainty, right.certainty),
  );
}

function dockerClassification(service: ComposeService): {
  category: string;
  type: DetectedNodeType;
} {
  const value = `${service.name} ${service.image ?? ""}`.toLowerCase();
  if (/postgres|mysql|mariadb|mongodb?|cockroach|mssql|oracle/.test(value)) {
    return { category: "database", type: "db" };
  }
  if (/redis|valkey|memcached/.test(value)) {
    return { category: "cache", type: "service" };
  }
  if (/kafka|rabbitmq|\bnats\b|pulsar/.test(value)) {
    return { category: "queue", type: "queue" };
  }
  if (/minio|seaweedfs/.test(value)) {
    return { category: "storage", type: "storage" };
  }
  return { category: "app", type: "container" };
}

function detectDockerNode(files: readonly SourceFile[]): LumenMapNode | undefined {
  const compose = files
    .filter((file) => /^(?:docker-)?compose\.ya?ml$/.test(file.path))
    .sort((left, right) => compareText(left.path, right.path))[0];
  const services = compose ? composeServices(compose.content) : [];
  const rootDockerfile = files.find((file) => file.path === "Dockerfile");
  if (!compose && !rootDockerfile) return undefined;

  const path = compose?.path ?? rootDockerfile!.path;
  const children: LumenMapNode[] = services.map((service) => {
    const classification = dockerClassification(service);
    return {
      ...classification,
      id: `${classification.type}:docker:${service.name}`,
      label: service.name,
      path,
      tags: ["env:dev"],
    };
  });
  if (!compose && rootDockerfile) {
    children.push({
      category: "app",
      id: "container:docker:Dockerfile",
      label: "Dockerfile",
      path,
      tags: ["env:dev"],
      type: "container",
    });
  }
  children.sort((left, right) => compareText(left.id, right.id));
  return {
    children,
    id: "group:docker",
    label: "Docker",
    path,
    tags: ["env:dev"],
    type: "group",
  };
}

export function detectStructureNodes(
  files: readonly SourceFile[],
): LumenMapNode[] {
  const normalizedFiles = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort((left, right) => compareText(left.path, right.path));
  const nodes = detectMonorepoNodes(normalizedFiles);
  const docker = detectDockerNode(normalizedFiles);
  if (docker) nodes.push(docker);
  return nodes.sort((left, right) => compareText(left.id, right.id));
}

export function buildLumenMap(
  files: readonly SourceFile[],
  options: GeneratorOptions,
): LumenMapDocument {
  const production = detectProduction(files);
  const nodes = [
    ...detectAiNodes(files),
    ...detectStructureNodes(files),
    ...production.nodes,
  ].sort((left, right) => compareText(left.id, right.id));
  return {
    version: "1.0",
    project: {
      name: options.projectName,
      generatedAt: options.generatedAt,
      generator: "lumenmap-skill@0.1",
    },
    layers: [{ tag: "ai", label: "AI構成" }],
    nodes,
    edges: buildEdges(files, nodes, production),
  };
}

const SIMPLE_ICON_SLUGS: Readonly<Record<string, string>> = {
  anthropic: "anthropic",
  aws: "amazonwebservices",
  cloudflare: "cloudflare",
  datadog: "datadog",
  flyio: "flydotio",
  github: "github",
  gitlab: "gitlab",
  googlecloud: "googlecloud",
  kafka: "apachekafka",
  mongodb: "mongodb",
  mysql: "mysql",
  neon: "neon",
  netlify: "netlify",
  openai: "openai",
  postgres: "postgresql",
  postgresql: "postgresql",
  rabbitmq: "rabbitmq",
  redis: "redis",
  render: "render",
  resend: "resend",
  sendgrid: "sendgrid",
  sentry: "sentry",
  stripe: "stripe",
  supabase: "supabase",
  vercel: "vercel",
};

function serviceKey(node: LumenMapNode): string {
  const idName = node.id.startsWith("service:")
    ? node.id.slice("service:".length).split(":").pop()
    : undefined;
  return (idName ?? node.label).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function withResolvedLogos(nodes: readonly LumenMapNode[]): LumenMapNode[] {
  return nodes.map((node) => {
    const children = node.children ? withResolvedLogos(node.children) : undefined;
    const slug = node.type === "service" ? SIMPLE_ICON_SLUGS[serviceKey(node)] : undefined;
    return {
      ...node,
      ...(children ? { children } : {}),
      ...(slug ? { logo: `https://cdn.simpleicons.org/${slug}/white` } : {}),
    };
  });
}

function mergeNodes(
  detectedNodes: readonly LumenMapNode[],
  existingNodes: readonly LumenMapNode[],
): LumenMapNode[] {
  const existingById = new Map(existingNodes.map((node) => [node.id, node]));
  const detectedIds = new Set(detectedNodes.map((node) => node.id));
  const merged = detectedNodes.map((detected) => {
    const existing = existingById.get(detected.id);
    if (!existing) return detected;
    if (existing.manual === true || existing.hidden === true) return existing;

    const node: LumenMapNode = {
      ...detected,
      ...(existing.position ? { position: existing.position } : {}),
      ...(existing.manual !== undefined ? { manual: existing.manual } : {}),
      ...(existing.hidden !== undefined ? { hidden: existing.hidden } : {}),
    };
    if (detected.children || existing.children) {
      node.children = mergeNodes(detected.children ?? [], existing.children ?? []);
    }
    return node;
  });

  merged.push(...existingNodes.filter((node) => !detectedIds.has(node.id)));
  return merged.sort((left, right) => compareText(left.id, right.id));
}

function nestedNodes(nodes: readonly LumenMapNode[]): LumenMapNode[] {
  return nodes.flatMap((node) => [node, ...nestedNodes(node.children ?? [])]);
}

type LayoutZone = "ai" | "development" | "production";

function layoutZone(node: LumenMapNode): LayoutZone {
  if (
    node.tags.includes("ai") ||
    ["agent", "claude-md", "command", "mcp", "skill"].includes(node.type)
  ) {
    return "ai";
  }
  if (node.tags.includes("env:prod")) return "production";
  return "development";
}

function positionFor(zone: LayoutZone, index: number): { x: number; y: number } {
  const column = index % 4;
  const row = Math.floor(index / 4);
  if (zone === "ai") return { x: -400 - column * 180, y: -240 + row * 160 };
  if (zone === "production") return { x: 400 + column * 180, y: 240 + row * 160 };
  return { x: 400 + column * 180, y: -240 - row * 160 };
}

function layoutNewNodes(
  nodes: readonly LumenMapNode[],
  existingIds: ReadonlySet<string>,
): LumenMapNode[] {
  const occupied = new Set(
    nestedNodes(nodes)
      .filter((node) => node.position)
      .map((node) => `${node.position!.x}\0${node.position!.y}`),
  );
  const nextIndex: Record<LayoutZone, number> = {
    ai: 0,
    development: 0,
    production: 0,
  };

  const visit = (node: LumenMapNode): LumenMapNode => {
    let position = node.position;
    if (!existingIds.has(node.id) && !position) {
      const zone = layoutZone(node);
      do {
        position = positionFor(zone, nextIndex[zone]);
        nextIndex[zone] += 1;
      } while (occupied.has(`${position.x}\0${position.y}`));
      occupied.add(`${position.x}\0${position.y}`);
    }
    return {
      ...node,
      ...(position ? { position } : {}),
      ...(node.children ? { children: node.children.map(visit) } : {}),
    };
  };

  return nodes.map(visit);
}

export function mergeLumenMap(
  detected: LumenMapDocument,
  existing?: LumenMapDocument,
): LumenMapDocument {
  const existingNodes = existing?.nodes ?? [];
  const existingIds = new Set(nestedNodes(existingNodes).map((node) => node.id));
  const resolved = withResolvedLogos(detected.nodes);
  return {
    ...detected,
    nodes: layoutNewNodes(mergeNodes(resolved, existingNodes), existingIds),
  };
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

export function serializeLumenMap(document: LumenMapDocument): string {
  return `${JSON.stringify(sortObjectKeys(document), null, 2)}\n`;
}
