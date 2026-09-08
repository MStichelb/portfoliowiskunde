import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.resolve(projectRoot, "src", `${specifier.slice(2)}.ts`);
    return { shortCircuit: true, url: pathToFileURL(target).href };
  }
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    const target = fileURLToPath(new URL(specifier, context.parentURL)).replace(/\.js$/, ".ts");
    if (existsSync(target)) return { shortCircuit: true, url: pathToFileURL(target).href };
  }
  return nextResolve(specifier, context);
}
