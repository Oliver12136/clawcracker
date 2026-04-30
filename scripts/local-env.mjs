import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const envFiles = [".env.local", ".env"];

export async function loadLocalEnv(cwd = process.cwd()) {
  for (const file of envFiles) {
    const path = resolve(cwd, file);
    let content;

    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    for (const [key, value] of parseEnv(content)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function parseEnv(content) {
  const entries = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equals = line.indexOf("=");

    if (equals === -1) {
      continue;
    }

    const key = line.slice(0, equals).trim();
    const rawValue = line.slice(equals + 1).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    entries.push([key, unquoteEnvValue(rawValue)]);
  }

  return entries;
}

export function quoteEnvValue(value) {
  return JSON.stringify(value);
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0];
    const inner = value.slice(1, -1);

    if (quote === '"') {
      return inner.replace(/\\(["\\nrt])/g, (_, escaped) => {
        switch (escaped) {
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          default:
            return escaped;
        }
      });
    }

    return inner;
  }

  return value.replace(/\s+#.*$/, "");
}
