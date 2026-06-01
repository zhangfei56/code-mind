import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CompilerOptions,
  LanguageService,
  LanguageServiceHost,
  NavigationTree,
  SourceFile,
} from "typescript";
import { resolvePathInWorkspace } from "@code-mind/workspace";

type TypeScriptModule = typeof import("typescript");

export interface LspLocation {
  path: string;
  line: number;
  character: number;
  preview?: string;
}

export interface LspSymbol {
  name: string;
  kind: string;
  line: number;
  character: number;
  children?: LspSymbol[];
}

function loadTypeScript(workspaceRoot: string): TypeScriptModule | undefined {
  const candidates = [
    join(workspaceRoot, "package.json"),
    join(process.cwd(), "package.json"),
    fileURLToPath(new URL("../../../package.json", import.meta.url)),
  ];
  for (const packageJsonPath of candidates) {
    try {
      const requireFrom = createRequire(packageJsonPath);
      return requireFrom("typescript") as TypeScriptModule;
    } catch {
      continue;
    }
  }
  return undefined;
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
}

function flattenNavigationTree(
  ts: TypeScriptModule,
  sourceFile: SourceFile,
  node: NavigationTree,
): LspSymbol {
  const span = node.spans[0] ?? node.nameSpan ?? { start: 0, length: 0 };
  const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, span.start);
  const entry: LspSymbol = {
    name: node.text,
    kind: node.kind,
    line: line + 1,
    character: character + 1,
  };
  if (node.childItems && node.childItems.length > 0) {
    entry.children = node.childItems.map((child) =>
      flattenNavigationTree(ts, sourceFile, child),
    );
  }
  return entry;
}

function createLanguageService(
  ts: TypeScriptModule,
  workspaceRoot: string,
  absolutePath: string,
): LanguageService {
  const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json");
  let compilerOptions: CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
    skipLibCheck: true,
  };
  let rootNames = [absolutePath];

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      workspaceRoot,
    );
    compilerOptions = parsed.options;
    rootNames = parsed.fileNames.length > 0 ? parsed.fileNames : rootNames;
    if (!rootNames.includes(absolutePath)) {
      rootNames = [...rootNames, absolutePath];
    }
  }

  const servicesHost: LanguageServiceHost = {
    getScriptFileNames: () => rootNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName: string) => {
      if (!existsSync(fileName)) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(readFileSync(fileName, "utf8"));
    },
    getCurrentDirectory: () => workspaceRoot,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  return ts.createLanguageService(servicesHost, ts.createDocumentRegistry());
}

function lineCharToPosition(
  ts: TypeScriptModule,
  sourceFile: SourceFile,
  line: number,
  character: number,
): number {
  const safeLine = Math.max(1, line);
  const safeChar = Math.max(1, character);
  return ts.getPositionOfLineAndCharacter(sourceFile, safeLine - 1, safeChar - 1);
}

function formatOffsetLocation(
  ts: TypeScriptModule,
  workspaceRoot: string,
  fileName: string,
  offset: number,
): LspLocation {
  const source = ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
  );
  const { line, character } = ts.getLineAndCharacterOfPosition(source, offset);
  return {
    path: toRelativePath(workspaceRoot, fileName),
    line: line + 1,
    character: character + 1,
  };
}

export function createTypeScriptLanguageService(
  workspaceRoot: string,
  relativePath: string,
): {
  ts: TypeScriptModule;
  languageService: LanguageService;
  absolutePath: string;
} | undefined {
  const ts = loadTypeScript(workspaceRoot);
  if (!ts) {
    return undefined;
  }
  const absolutePath = resolvePathInWorkspace(workspaceRoot, relativePath);
  return {
    ts,
    languageService: createLanguageService(ts, workspaceRoot, absolutePath),
    absolutePath,
  };
}

export function getDocumentSymbols(
  workspaceRoot: string,
  relativePath: string,
): LspSymbol[] | undefined {
  const service = createTypeScriptLanguageService(workspaceRoot, relativePath);
  if (!service) {
    return undefined;
  }
  const tree = service.languageService.getNavigationTree(service.absolutePath);
  if (!tree) {
    return [];
  }
  const sourceFile = service.languageService
    .getProgram()
    ?.getSourceFile(service.absolutePath);
  if (!sourceFile) {
    return [];
  }
  if (tree.childItems && tree.childItems.length > 0) {
    return tree.childItems.map((child) =>
      flattenNavigationTree(service.ts, sourceFile, child),
    );
  }
  return [flattenNavigationTree(service.ts, sourceFile, tree)];
}

export function findDefinition(
  workspaceRoot: string,
  relativePath: string,
  line: number,
  character: number,
): LspLocation[] | undefined {
  const service = createTypeScriptLanguageService(workspaceRoot, relativePath);
  if (!service) {
    return undefined;
  }
  const sourceFile = service.languageService
    .getProgram()
    ?.getSourceFile(service.absolutePath);
  if (!sourceFile) {
    return [];
  }
  const position = lineCharToPosition(service.ts, sourceFile, line, character);
  const definitions = service.languageService.getDefinitionAtPosition(
    service.absolutePath,
    position,
  );
  if (!definitions) {
    return [];
  }
  return definitions.map((definition) =>
    formatOffsetLocation(service.ts, workspaceRoot, definition.fileName, definition.textSpan.start),
  );
}

export function findReferences(
  workspaceRoot: string,
  relativePath: string,
  line: number,
  character: number,
): LspLocation[] | undefined {
  const service = createTypeScriptLanguageService(workspaceRoot, relativePath);
  if (!service) {
    return undefined;
  }
  const sourceFile = service.languageService
    .getProgram()
    ?.getSourceFile(service.absolutePath);
  if (!sourceFile) {
    return [];
  }
  const position = lineCharToPosition(service.ts, sourceFile, line, character);
  const references = service.languageService.findReferences(
    service.absolutePath,
    position,
  );
  if (!references) {
    return [];
  }
  const locations: LspLocation[] = [];
  for (const ref of references) {
    for (const entry of ref.references) {
      if (entry.isDefinition) {
        continue;
      }
      locations.push(
        formatOffsetLocation(service.ts, workspaceRoot, entry.fileName, entry.textSpan.start),
      );
    }
  }
  return locations;
}
