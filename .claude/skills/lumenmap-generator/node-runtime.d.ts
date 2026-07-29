declare module "node:fs/promises" {
  interface DirectoryEntry {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<DirectoryEntry[]>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function rm(
    path: string,
    options: { force: boolean; recursive: boolean },
  ): Promise<void>;
  export function writeFile(
    path: string,
    data: string,
    encoding: "utf8",
  ): Promise<void>;
}

declare module "node:process" {
  const process: {
    argv: string[];
    cwd(): string;
  };
  export default process;
}

declare module "node:path" {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: URL): string;
  export function pathToFileURL(path: string): URL;
}
