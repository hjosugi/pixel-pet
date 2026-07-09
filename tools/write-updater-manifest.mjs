#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

function usage() {
  console.error(`Usage:
  node tools/write-updater-manifest.mjs \\
    --version 0.2.1 \\
    --out latest.json \\
    --notes "Release notes" \\
    --platform linux-x86_64=https://example.com/app.AppImage.tar.gz,path/to/app.AppImage.tar.gz.sig

Repeat --platform for each supported target.`);
}

function readArgs(argv) {
  const values = { platforms: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const name = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    i += 1;
    if (name === "platform") {
      values.platforms.push(value);
    } else {
      values[name] = value;
    }
  }
  return values;
}

function parsePlatform(value) {
  const separator = value.indexOf("=");
  if (separator < 1) {
    throw new Error(`Invalid platform entry: ${value}`);
  }

  const target = value.slice(0, separator);
  const payload = value.slice(separator + 1);
  const comma = payload.lastIndexOf(",");
  if (comma < 1) {
    throw new Error(`Platform entry must be URL,SIG_PATH: ${value}`);
  }

  const url = payload.slice(0, comma);
  const signaturePath = payload.slice(comma + 1);
  const signature = readFileSync(signaturePath, "utf8").trim();
  if (!signature) {
    throw new Error(`Signature file is empty: ${signaturePath}`);
  }

  return [target, { url, signature }];
}

try {
  const args = readArgs(process.argv.slice(2));
  if (!args.version || !args.out || args.platforms.length === 0) {
    usage();
    process.exit(1);
  }

  const platforms = Object.fromEntries(args.platforms.map(parsePlatform));
  const manifest = {
    version: args.version,
    notes: args.notes ?? "",
    pub_date: args.pub_date ?? new Date().toISOString(),
    platforms,
  };

  writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${args.out} with ${Object.keys(platforms).length} platform(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  usage();
  process.exit(1);
}
