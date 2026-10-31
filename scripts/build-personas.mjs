/* Copies the loader artifacts (src/personas.mjs, src/cache-warm.mjs) to the package root. */
import { copyFileSync, readdirSync } from "node:fs";

const ids = readdirSync(new URL("../personas", import.meta.url))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
console.log("personas:", ids.join(", "));
copyFileSync(
  new URL("../src/personas.mjs", import.meta.url),
  new URL("../personas.mjs", import.meta.url),
);
copyFileSync(
  new URL("../src/cache-warm.mjs", import.meta.url),
  new URL("../cache-warm.mjs", import.meta.url),
);
