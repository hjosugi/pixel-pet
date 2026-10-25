import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const readJson = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const manifest = readJson('package.json');
const npm = readJson('package-lock.json');
const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.lock'), 'utf8');
const rust = new Map();
for (const section of cargo.split(/^\[\[package\]\]$/m)) {
  const name = section.match(/^name = "([^"]+)"$/m)?.[1];
  const version = section.match(/^version = "([^"]+)"$/m)?.[1];
  if (name && version) rust.set(name, [...(rust.get(name) ?? []), version]);
}

const majorMinor = value => {
  const match = value.match(/^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/);
  assert.ok(match, `invalid resolved package version: ${value}`);
  return `${match[1]}.${match[2]}`;
};

let checked = 0;
for (const name of Object.keys(manifest.dependencies ?? {})) {
  const crate = name === '@tauri-apps/api' ? 'tauri'
    : name.startsWith('@tauri-apps/plugin-') ? name.replace('@tauri-apps/plugin-', 'tauri-plugin-') : null;
  if (!crate) continue;
  const js = npm.packages[`node_modules/${name}`]?.version;
  assert.ok(js, `missing locked JavaScript package: ${name}`);
  const native = rust.get(crate) ?? [];
  assert.equal(native.length, 1, `expected one locked Rust package: ${crate}`);
  assert.equal(majorMinor(js), majorMinor(native[0]), `${name} ${js} and ${crate} ${native[0]} must share a major/minor release`);
  checked++;
}
assert.ok(checked > 0, 'no Tauri runtime package pairs were checked');
console.log(`Tauri runtime package versions match (${checked} pairs)`);
