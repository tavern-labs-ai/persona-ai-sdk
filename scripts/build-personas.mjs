/* Copies src/personas.mjs to the package root (the shipped loader artifact). */
import { copyFileSync, readdirSync } from "node:fs";

const ids = readdirSync(new URL("../personas", import.meta.url))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
console.log("personas:", ids.join(", "));
copyFileSync(
  new URL("../src/personas.mjs", import.meta.url),
  new URL("../personas.mjs", import.meta.url),
);
