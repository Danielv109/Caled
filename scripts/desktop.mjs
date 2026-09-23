import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const runtime = path.join(root, ".runtime", "Caled");
const lockFile = path.join(root, "product", "upstream.lock.json");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const exists = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );
const writeJson = (file, value) =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

/** VS Code settings allow comments and trailing commas. Never repair invalid user JSON silently. */
export function parseSettings(text) {
  if (typeof text !== "string" || text.length > 2_097_152)
    throw new Error("Settings file is too large.");
  let clean = "",
    string = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      next = text[i + 1];
    if (string) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') string = false;
    } else if (c === '"') {
      string = true;
      clean += c;
    } else if (c === "/" && next === "/") {
      clean += "  ";
      i++;
      while (i + 1 < text.length && !/[\r\n]/.test(text[i + 1])) {
        clean += " ";
        i++;
      }
    } else if (c === "/" && next === "*") {
      clean += "  ";
      i++;
      let ended = false;
      while (++i < text.length) {
        if (text[i] === "*" && text[i + 1] === "/") {
          clean += "  ";
          i++;
          ended = true;
          break;
        }
        clean += /[\r\n]/.test(text[i]) ? text[i] : " ";
      }
      if (!ended) throw new Error("Invalid settings: unterminated comment.");
    } else {
      clean += c === "\ufeff" && i === 0 ? " " : c;
    }
  }
  let normalized = "",
    quoted = false,
    escape = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      normalized += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') {
      quoted = true;
      normalized += c;
    } else if (c === "," && /^\s*[}\]]/.test(clean.slice(i + 1)))
      normalized += " ";
    else normalized += c;
  }
  let value;
  try {
    value = JSON.parse(normalized);
  } catch {
    throw new Error(
      "Invalid settings.json. Fix its syntax; your file has been preserved.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Settings must be a JSON object.");
  return { value, clean };
}

export function addSetting(text, key, value) {
  const parsed = parseSettings(text);
  if (Object.hasOwn(parsed.value, key)) return text;
  const end = parsed.clean.lastIndexOf("}");
  const prefix = parsed.clean.slice(0, end).trimEnd();
  const comma = prefix.endsWith("{") || prefix.endsWith(",") ? "" : ",";
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  // Place the comma before any trailing line comment, preserving every original comment.
  const last = parsed.clean.slice(0, end).search(/\s*$/);
  const result =
    text.slice(0, last) +
    comma +
    text.slice(last, end) +
    `${newline}  ${JSON.stringify(key)}: ${JSON.stringify(value)}${newline}` +
    text.slice(end);
  parseSettings(result);
  return result;
}

// Check both lexical and resolved parent paths so a junction cannot redirect writes.
export async function contained(target, boundary = root) {
  const base = await realpath(boundary);
  const absolute = path.resolve(target);
  const rel = path.relative(base, absolute);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`Unsafe target: ${absolute}`);
  let ancestor = absolute;
  while (!(await exists(ancestor))) ancestor = path.dirname(ancestor);
  const resolved = await realpath(ancestor);
  const resolvedRel = path.relative(base, resolved);
  if (resolvedRel.startsWith("..") || path.isAbsolute(resolvedRel))
    throw new Error(`Target crosses a junction: ${absolute}`);
  return absolute;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function loadLock() {
  const lock = await json(lockFile);
  if (
    lock.schemaVersion !== 1 ||
    lock.platform !== "win32-x64" ||
    !/^[a-f0-9]{64}$/.test(lock.sha256)
  ) {
    throw new Error(
      "Invalid product/upstream.lock.json. Refusing an unverified download.",
    );
  }
  if (
    path.basename(lock.asset) !== lock.asset ||
    !["VSCodium.exe", "Codium.exe"].includes(lock.executable) ||
    !lock.url.startsWith(
      "https://github.com/VSCodium/vscodium/releases/download/",
    )
  ) {
    throw new Error(
      "Only pinned official VSCodium release assets are supported.",
    );
  }
  return lock;
}

export async function download() {
  const lock = await loadLock();
  const archive = await contained(path.join(root, ".cache", lock.asset));
  await mkdir(path.dirname(archive), { recursive: true });
  if (await exists(archive)) {
    if ((await digest(archive)) !== lock.sha256)
      throw new Error(
        `Cached archive checksum mismatch: ${archive}. Move it aside and retry.`,
      );
    console.log(`Verified cached VSCodium ${lock.release}.`);
    return archive;
  }
  console.log(
    `Downloading official VSCodium ${lock.release} (${Math.round(lock.size / 1e6)} MB)...`,
  );
  const response = await fetch(lock.url, {
    headers: { "User-Agent": "Caled-bootstrap/0.1" },
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok || !response.body)
    throw new Error(`Download failed: HTTP ${response.status}`);
  const temporary = await contained(`${archive}.partial-${process.pid}`);
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(temporary, { flags: "wx" }),
  );
  if (
    (await digest(temporary)) !== lock.sha256 ||
    (await stat(temporary)).size !== lock.size
  ) {
    throw new Error(
      `SHA-256 or length mismatch. The untrusted archive was NOT extracted: ${temporary}`,
    );
  }
  await rename(temporary, archive);
  console.log(`SHA-256 verified: ${lock.sha256}`);
  return archive;
}

export async function bundleExtension(destination) {
  await contained(destination);
  const manifest = await json(path.join(root, "package.json"));
  if (
    manifest.name !== "caled" ||
    manifest.publisher !== "caled" ||
    !manifest.main
  )
    throw new Error("Invalid Caled extension manifest.");
  for (const file of [
    "dist/extension.js",
    "dist/index-worker.js",
    "media/caled.svg",
  ]) {
    if (!(await exists(path.join(root, file))))
      throw new Error(`Missing ${file}; run npm run build first.`);
  }
  await mkdir(destination, { recursive: true });
  const packaged = { ...manifest };
  delete packaged.scripts;
  delete packaged.devDependencies;
  delete packaged.dependencies; // The extension and worker are self-contained esbuild bundles.
  await writeJson(
    await contained(path.join(destination, "package.json")),
    packaged,
  );
  for (const folder of ["dist", "media"]) {
    await contained(path.join(destination, folder));
    await cp(path.join(root, folder), path.join(destination, folder), {
      recursive: true,
    });
  }
  for (const file of ["README.md", "LICENSE"]) {
    if (await exists(path.join(root, file)))
      await copyFile(
        path.join(root, file),
        await contained(path.join(destination, file)),
      );
  }
}

export async function brandProduct(productFile) {
  const product = await json(productFile);
  const overlay = await json(
    path.join(root, "product", "product.overlay.json"),
  );
  Object.assign(product, overlay);
  // A generic upstream updater would replace the integrated Caled build.
  delete product.updateUrl;
  delete product.downloadUrl;
  // Keep upstream metadata required during workbench service initialization.
  // The built-in chat is disabled through chat.disableAIFeatures, not by
  // removing defaultChatAgent (newer workbenches read it unconditionally).
  await writeJson(await contained(productFile), product);
}

async function unpack(archive, destination) {
  await contained(destination);
  await mkdir(destination, { recursive: true });
  // Paths are arguments, never interpolated into executable PowerShell code.
  const scriptFile = await contained(
    path.join(root, ".cache", "extract-caled.ps1"),
  );
  await writeFile(
    scriptFile,
    `param([string]$Archive, [string]$Destination, [string]$Workspace)\n$ErrorActionPreference = 'Stop'\n$base = [IO.Path]::GetFullPath($Workspace).TrimEnd('\\') + '\\'\n$target = [IO.Path]::GetFullPath($Destination).TrimEnd('\\') + '\\'\nif (-not $target.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw 'Extraction must stay inside the workspace.' }\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n$zip = [IO.Compression.ZipFile]::OpenRead($Archive)\ntry {\n  foreach ($entry in $zip.Entries) {\n    $entryPath = [IO.Path]::GetFullPath([IO.Path]::Combine($target, $entry.FullName))\n    if (-not $entryPath.StartsWith($target, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive entry escapes extraction directory.' }\n  }\n} finally { $zip.Dispose() }\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination\n`,
  );
  await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptFile,
    "-Archive",
    archive,
    "-Destination",
    destination,
    "-Workspace",
    root,
  ]);
}

export async function prepare() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("This desktop recipe currently supports Windows x64 only.");
  const lock = await loadLock();
  await contained(runtime);
  if (!(await exists(runtime))) {
    const archive = await download();
    const staging = await contained(
      path.join(root, ".runtime", `staging-${process.pid}-${Date.now()}`),
    );
    console.log("Extracting verified desktop archive...");
    await unpack(archive, staging);
    if (!(await exists(path.join(staging, lock.executable))))
      throw new Error(
        `Unexpected upstream archive: ${lock.executable} is absent.`,
      );
    await writeJson(path.join(staging, "caled-build.json"), {
      release: lock.release,
      sha256: lock.sha256,
      sourceCommit: lock.source.commit,
    });
    await rename(staging, runtime);
  } else {
    const provenance = await json(path.join(runtime, "caled-build.json")).catch(
      () => null,
    );
    if (provenance?.sha256 !== lock.sha256)
      throw new Error(
        "Existing runtime has a different or unknown version. Move .runtime/Caled aside before preparing this version; retain its data directory.",
      );
  }
  await brandProduct(path.join(runtime, "resources", "app", "product.json"));
  await bundleExtension(
    path.join(runtime, "resources", "app", "extensions", "caled"),
  );
  const settingsPath = await contained(
    path.join(runtime, "data", "user-data", "User", "settings.json"),
  );
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await mkdir(await contained(path.join(runtime, "data", "extensions")), {
    recursive: true,
  });
  if (!(await exists(settingsPath)))
    await copyFile(
      path.join(root, "product", "settings.defaults.json"),
      settingsPath,
    );
  // The signed upstream executable retains its original filename and resources.
  await writeFile(
    await contained(path.join(runtime, "Caled.cmd")),
    `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=\r\nset VSCODE_DEV=\r\nset "VSCODE_PORTABLE=%~dp0data"\r\nstart "Caled" "%~dp0${lock.executable}" %*\r\nendlocal\r\n`,
  );
  await verify();
  console.log(
    `Caled is prepared: ${runtime}\nStart with npm run desktop:start or Caled.cmd.`,
  );
}

export async function verify() {
  const lock = await loadLock();
  const app = path.join(runtime, "resources", "app");
  const product = await json(path.join(app, "product.json"));
  const manifest = await json(
    path.join(app, "extensions", "caled", "package.json"),
  );
  const provenance = await json(path.join(runtime, "caled-build.json"));
  if (
    product.nameShort !== "Caled" ||
    product.enableTelemetry !== false ||
    product.updateUrl
  )
    throw new Error("Caled product branding/privacy verification failed.");
  if (!product.defaultChatAgent?.chatExtensionId)
    throw new Error(
      "Required workbench metadata defaultChatAgent is missing. Restore it from the pinned upstream product.json.",
    );
  if (provenance.sha256 !== lock.sha256)
    throw new Error("Runtime version differs from pinned upstream.");
  if (manifest.name !== "caled" || manifest.publisher !== "caled")
    throw new Error("Built-in Caled extension is absent or invalid.");
  for (const file of [
    lock.executable,
    "Caled.cmd",
    "data/user-data/User/settings.json",
    "resources/app/extensions/caled/dist/extension.js",
    "resources/app/extensions/caled/dist/index-worker.js",
    "resources/app/extensions/caled/media/caled.svg",
  ]) {
    if (!(await exists(path.join(runtime, file))))
      throw new Error(`Missing runtime file: ${file}`);
  }
  const main = path.resolve(app, "extensions", "caled", manifest.main);
  await contained(main, path.join(app, "extensions", "caled"));
  if (!(await exists(main)))
    throw new Error(`Missing manifest entry point: ${main}`);
  for (const file of [
    "dist/extension.js",
    "dist/index-worker.js",
    "media/caled.svg",
  ]) {
    const local = path.join(root, file);
    if (
      (await exists(local)) &&
      (await digest(local)) !==
        (await digest(path.join(app, "extensions", "caled", file)))
    ) {
      throw new Error(
        `Bundled ${file} differs from this workspace. Run desktop:prepare again after building.`,
      );
    }
  }
  console.log(
    `Desktop verification passed: Caled ${manifest.version}, VSCodium ${lock.release}, built-in extension and portable profile.`,
  );
  return { runtime, version: manifest.version, upstream: lock.release };
}

async function start() {
  await verify();
  let settings;
  try {
    settings = parseSettings(
      await readFile(
        path.join(runtime, "data/user-data/User/settings.json"),
        "utf8",
      ),
    ).value;
  } catch (error) {
    console.warn(
      `Local AI settings could not be read: ${error.message} The editor will still open.`,
    );
  }
  if (
    settings &&
    (!settings["caled.provider"] || settings["caled.provider"] === "ollama") &&
    (!settings["caled.baseUrl"] ||
      /^http:\/\/(?:127\.0\.0\.1|localhost):11434\/?$/.test(
        settings["caled.baseUrl"],
      )) &&
    (await exists(path.join(root, ".runtime/ollama/ollama.exe")))
  ) {
    try {
      await (await import("./local-ai.mjs")).startLocalAI();
    } catch (error) {
      console.warn(
        `Local AI could not start: ${error.message}. The editor will still open.`,
      );
    }
  }
  const lock = await loadLock();
  const args = process.argv.slice(3);
  const environment = {
    ...process.env,
    VSCODE_PORTABLE: path.join(runtime, "data"),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.VSCODE_DEV;
  const child = spawn(
    path.join(runtime, lock.executable),
    args.length ? args : [root],
    {
      cwd: root,
      env: environment,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  console.log(`Caled launched (process ${child.pid}).`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const action = process.argv[2] ?? "verify";
  const actions = { prepare, start, verify, download };
  try {
    if (!actions[action])
      throw new Error(
        "Usage: node scripts/desktop.mjs prepare|start|verify|download",
      );
    await actions[action]();
  } catch (error) {
    console.error(`Caled desktop: ${error.message}`);
    process.exitCode = 1;
  }
}
