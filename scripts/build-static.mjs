import { copyFile, mkdir, readdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const topLevelFiles = ["index.html", "styles.css", "app.js"];
const ignoredNames = new Set([".DS_Store"]);

async function copyDir(sourceUrl, targetUrl) {
  await mkdir(targetUrl, { recursive: true });

  for (const entry of await readdir(sourceUrl, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) continue;

    const source = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, sourceUrl);
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, targetUrl);

    if (entry.isDirectory()) {
      await copyDir(source, target);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(source, target);
    }
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of topLevelFiles) {
  await copyFile(new URL(file, root), new URL(file, dist));
}

await copyDir(new URL("assets/", root), new URL("assets/", dist));
