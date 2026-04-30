import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { quoteEnvValue } from "./local-env.mjs";

const envPath = resolve(".env.local");
const defaults = {
  FIGMA_FILE_KEY: "2zA19y0kTx79oDOOfcNRJN",
  FIGMA_NODE_ID: "36:6797",
};

const token = process.env.FIGMA_ACCESS_TOKEN ?? (await readSecret("Figma access token: "));

if (!token.trim()) {
  console.error("No token provided. Nothing changed.");
  process.exit(1);
}

let existing = "";

try {
  existing = await readFile(envPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const next = upsertEnvValues(existing, {
  FIGMA_ACCESS_TOKEN: token.trim(),
  ...defaults,
});

await writeFile(envPath, next);

console.log("Figma access saved to .env.local");
console.log("Run `npm run figma:pull` to fetch the current design node.");

function upsertEnvValues(content, values) {
  const lines = content ? content.replace(/\s*$/, "\n").split(/\r?\n/) : [];
  const seen = new Set();
  const keys = new Set(Object.keys(values));
  const rewritten = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);

    if (!match || !keys.has(match[1])) {
      return line;
    }

    seen.add(match[1]);
    return `${match[1]}=${quoteEnvValue(values[match[1]])}`;
  });

  if (!content) {
    rewritten.push("# Local secrets. Do not commit this file.");
  }

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      rewritten.push(`${key}=${quoteEnvValue(value)}`);
    }
  }

  return `${rewritten.filter((line, index, array) => line || index < array.length - 1).join("\n")}\n`;
}

function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        input += chunk;
      });
      process.stdin.on("end", () => resolve(input.trim()));
      process.stdin.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
    };

    const onData = (chunk) => {
      for (const input of chunk.toString("utf8")) {
        if (input === "\u0003") {
          cleanup();
          reject(new Error("Interrupted"));
          return;
        }

        if (input === "\r" || input === "\n" || input === "\u0004") {
          cleanup();
          resolve(value);
          return;
        }

        if (input === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }

        value += input;
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
