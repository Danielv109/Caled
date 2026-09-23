import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundleExtension, contained, root, run } from './desktop.mjs';
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unsupported package version.');
const staging = await contained(path.join(root, 'artifacts', `vsix-${manifest.version}-${Date.now()}`));
await mkdir(staging, { recursive: true });
await bundleExtension(path.join(staging, 'extension'));
await writeFile(path.join(staging, 'extension.vsixmanifest'), `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata><Identity Language="en-US" Id="caled" Version="${manifest.version}" Publisher="caled"/><DisplayName>Caled AI</DisplayName><Description xml:space="preserve">Local AI coding assistant with reviewed edits.</Description><Tags>AI,local,ollama</Tags><Categories>Machine Learning</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.96.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties><License>extension/LICENSE</License></Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>`);
await writeFile(path.join(staging, '[Content_Types].xml'), '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="map" ContentType="application/json"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="ico" ContentType="image/x-icon"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>');
const destination = await contained(path.join(root, 'artifacts', `caled-${manifest.version}-${Date.now()}.vsix`));
const script = await contained(path.join(root, '.cache', 'package-extension.ps1'));
await mkdir(path.dirname(script), { recursive: true });
await writeFile(script, `param([string]$Source, [string]$Destination)\n$ErrorActionPreference = 'Stop'\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::CreateFromDirectory($Source, $Destination)\n`);
await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Source', staging, '-Destination', destination]);
console.log(`VSIX created: ${destination}`);
