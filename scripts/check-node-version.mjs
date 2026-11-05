#!/usr/bin/env node
/** Fail fast on Node 20 and below; Rakazo requires Node 22+ (undici and runtime). */
const major = Number(process.versions.node.split(".")[0] ?? 0);
if (major < 22) {
  console.error(
    `Node ${process.versions.node} is not supported. Use Node 22 or newer (see .nvmrc and package.json engines).`,
  );
  process.exit(1);
}
