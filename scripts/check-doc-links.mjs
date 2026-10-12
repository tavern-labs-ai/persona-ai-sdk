import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const files = await findMarkdown(root);
const missing = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  const targets = [
    ...matches(content, /\]\((?!https?:\/\/|mailto:|#)([^)#]+)(?:#[^)]*)?\)/g),
    ...matches(content, /href="(?!https?:\/\/|mailto:|#)([^"#]+)(?:#[^"]*)?"/g),
  ];
  for (const rawTarget of targets) {
    const target = rawTarget.replace(/^<|>$/g, "");
    try {
      await access(resolve(dirname(file), decodeURIComponent(target)));
    } catch {
      missing.push(`${file.slice(root.length + 1)} -> ${target}`);
    }
  }
}

if (missing.length > 0) {
  console.error(
    `Broken local documentation links:\n${missing.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} Markdown files; all local links resolve.`);
}

async function findMarkdown(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await findMarkdown(path)));
    else if (entry.isFile() && extname(entry.name) === ".md") results.push(path);
  }
  return results;
}

function matches(content, pattern) {
  return [...content.matchAll(pattern)].map((match) => match[1]);
}
