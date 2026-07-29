import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildLumenMap,
  compareText,
  extractEnvKeys,
  mergeLumenMap,
  serializeLumenMap,
  type GeneratorOptions,
  type LumenMapDocument,
  type SourceFile,
} from "./detector";

async function readRelativeFile(
  projectRoot: string,
  relativePath: string,
): Promise<SourceFile | undefined> {
  try {
    const content = await readFile(resolve(projectRoot, relativePath), "utf8");
    return {
      content: /(?:^|\/)\.env(?:\.[^/]+)?$/.test(relativePath)
        ? extractEnvKeys(content)
            .map((key) => `${key}=`)
            .join("\n")
        : content,
      path: relativePath,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT" || code === "EISDIR") return undefined;
    throw error;
  }
}

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "build",
  "dist",
  "node_modules",
  "target",
]);

function isDetectionFile(relativePath: string): boolean {
  const segments = relativePath.split("/");
  const name = segments[segments.length - 1] ?? relativePath;
  return (
    name === ".mcp.json" ||
    name === "CLAUDE.md" ||
    name === "Cargo.toml" ||
    name === "Dockerfile" ||
    name.startsWith("Dockerfile.") ||
    name === "package.json" ||
    name === "pnpm-workspace.yaml" ||
    name === "pnpm-workspace.yml" ||
    name === "turbo.json" ||
    /^(?:README(?:\.[^/]+)?|vercel\.json|netlify\.toml|fly\.toml|render\.ya?ml)$/i.test(
      name,
    ) ||
    /^\.env(?:\.[^/]+)?$/.test(name) ||
    /^(?:docker-)?compose\.ya?ml$/.test(name) ||
    /(?:^|\/)\.claude\/(?:agents|commands)\/.+\.md$/.test(relativePath) ||
    /(?:^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/.test(relativePath) ||
    /(?:^|\/)\.claude\/settings(?:\.[^/]+)?\.json$/.test(relativePath) ||
    relativePath === "settings.json"
  );
}

async function detectionFilesBelow(
  projectRoot: string,
  relativeDirectory = "",
): Promise<SourceFile[]> {
  const directory = resolve(projectRoot, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: SourceFile[] = [];

  for (const entry of entries.sort((left, right) =>
    compareText(left.name, right.name),
  )) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
      files.push(...(await detectionFilesBelow(projectRoot, relativePath)));
    } else if (entry.isFile() && isDetectionFile(relativePath)) {
      const file = await readRelativeFile(projectRoot, relativePath);
      if (file) files.push(file);
    }
  }
  return files;
}

export async function collectDetectionFiles(
  projectRoot: string | URL,
): Promise<SourceFile[]> {
  const root =
    projectRoot instanceof URL ? fileURLToPath(projectRoot) : resolve(projectRoot);
  const files = await detectionFilesBelow(root);
  return [...new Map(files.map((file) => [file.path, file])).values()].sort(
    (left, right) => compareText(left.path, right.path),
  );
}

export async function generateFromDirectory(
  projectRoot: string | URL,
  options: GeneratorOptions,
  existingOutput = "lumenmap.json",
): Promise<LumenMapDocument> {
  const root =
    projectRoot instanceof URL ? fileURLToPath(projectRoot) : resolve(projectRoot);
  const detected = buildLumenMap(await collectDetectionFiles(root), options);
  const output = outputPathInside(root, existingOutput);
  let existing: LumenMapDocument | undefined;
  try {
    const content = await readFile(output, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!isLumenMapDocument(parsed)) throw new Error("schema mismatch");
    existing = parsed;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      const symptom = new Error(
        `既存の ${basename(output)} が不正なため上書きしません。内容を確認してください。`,
      );
      (symptom as Error & { cause?: unknown }).cause = error;
      throw symptom;
    }
  }
  return mergeLumenMap(detected, existing);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const NODE_TYPES = new Set([
  "agent",
  "app",
  "claude-md",
  "command",
  "container",
  "db",
  "group",
  "infra",
  "mcp",
  "queue",
  "service",
  "skill",
  "storage",
]);

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPosition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isNode(value: unknown, depth = 1): boolean {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" || value.id.length === 0 ||
    typeof value.type !== "string" || !NODE_TYPES.has(value.type) ||
    typeof value.label !== "string" || value.label.length === 0 ||
    (value.tags !== undefined &&
      (!isStringArray(value.tags) || new Set(value.tags).size !== value.tags.length)) ||
    (value.position !== undefined && !isPosition(value.position)) ||
    !isOptionalString(value.category) ||
    !isOptionalString(value.path) ||
    !isOptionalString(value.logo) ||
    !isOptionalString(value.confidence) ||
    (value.evidence !== undefined && !isStringArray(value.evidence)) ||
    (value.detail !== undefined && !isRecord(value.detail)) ||
    !isOptionalBoolean(value.manual) ||
    !isOptionalBoolean(value.hidden)
  ) {
    return false;
  }
  if (value.children === undefined) return true;
  return (
    depth < 3 &&
    Array.isArray(value.children) &&
    value.children.every((child) => isNode(child, depth + 1))
  );
}

function isLayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.tag === "string" && value.tag.length > 0 &&
    typeof value.label === "string" && value.label.length > 0
  );
}

function isEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.from === "string" && value.from.length > 0 &&
    typeof value.to === "string" && value.to.length > 0 &&
    typeof value.kind === "string" && value.kind.length > 0 &&
    (value.certainty === "confirmed" || value.certainty === "inferred") &&
    isOptionalBoolean(value.hidden)
  );
}

function isLumenMapDocument(value: unknown): value is LumenMapDocument {
  return (
    isRecord(value) &&
    typeof value.version === "string" &&
    isRecord(value.project) &&
    typeof value.project.name === "string" && value.project.name.length > 0 &&
    typeof value.project.generatedAt === "string" &&
    typeof value.project.generator === "string" && value.project.generator.length > 0 &&
    Array.isArray(value.layers) && value.layers.every(isLayer) &&
    Array.isArray(value.nodes) &&
    value.nodes.every((node) => isNode(node)) &&
    Array.isArray(value.edges) && value.edges.every(isEdge)
  );
}

interface CliArguments {
  generatedAt: string;
  output: string;
  projectName?: string;
  projectRoot: string;
}

function parseArguments(argv: readonly string[]): CliArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`引数は --key value 形式で指定してください: ${key ?? ""}`);
    }
    values.set(key, value);
  }

  return {
    generatedAt: values.get("--generated-at") ?? new Date().toISOString(),
    output: values.get("--output") ?? "lumenmap.json",
    projectName: values.get("--project-name"),
    projectRoot: values.get("--project-root") ?? ".",
  };
}

function outputPathInside(projectRoot: string, output: string): string {
  if (isAbsolute(output)) throw new Error("--output はプロジェクト内の相対パスで指定してください");
  const target = resolve(projectRoot, output);
  const fromRoot = relative(projectRoot, target);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("--output はプロジェクト外を指定できません");
  }
  return target;
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const root = resolve(args.projectRoot);
  const document = await generateFromDirectory(root, {
    generatedAt: args.generatedAt,
    projectName: args.projectName ?? basename(root),
  }, args.output);
  const output = outputPathInside(root, args.output);
  try {
    const previous = await readFile(output, "utf8");
    await writeFile(resolve(dirname(output), `.${basename(output)}.bak`), previous, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  await writeFile(output, serializeLumenMap(document), "utf8");
}

const entry = process.argv[1];
if (entry && pathToFileURL(resolve(entry)).href === import.meta.url) {
  await runCli(process.argv.slice(2));
}
