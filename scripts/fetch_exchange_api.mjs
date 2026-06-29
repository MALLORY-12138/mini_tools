import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "data", "exchange-api");
const primaryBaseUrl =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1";
const fallbackBaseUrl = "https://latest.currency-api.pages.dev/v1";
const defaultBases = ["usd", "cny", "eur"];

const args = process.argv.slice(2);
const shouldFetchAll = args.includes("--all");
const requestedBases = args
  .filter((arg) => !arg.startsWith("--"))
  .flatMap((arg) => arg.split(","))
  .map((arg) => arg.trim().toLowerCase())
  .filter(Boolean);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toProjectPath = (filePath) =>
  path.relative(rootDir, filePath).split(path.sep).join("/");

async function fetchJson(relativePath) {
  const attempts = [
    `${primaryBaseUrl}/${relativePath}`,
    `${fallbackBaseUrl}/${relativePath}`,
  ];

  let lastError;
  for (const url of attempts) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return {
        url,
        data: await response.json(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to fetch ${relativePath}: ${lastError?.message ?? "unknown error"}`,
  );
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

await fs.mkdir(outputDir, { recursive: true });

const currenciesResult = await fetchJson("currencies.json");
const currenciesPath = path.join(outputDir, "currencies.json");
await writeJson(currenciesPath, currenciesResult.data);

const currencyCodes = Object.keys(currenciesResult.data).sort();
const bases = shouldFetchAll
  ? currencyCodes
  : requestedBases.length > 0
    ? requestedBases
    : defaultBases;

const unknownBases = bases.filter((base) => !currencyCodes.includes(base));
if (unknownBases.length > 0) {
  throw new Error(`Unknown currency code(s): ${unknownBases.join(", ")}`);
}

const ratesDir = path.join(outputDir, "currencies");
const fetched = [];

for (const [index, base] of bases.entries()) {
  const result = await fetchJson(`currencies/${base}.json`);
  const filePath = path.join(ratesDir, `${base}.json`);
  await writeJson(filePath, result.data);
  fetched.push({
    base,
    path: filePath,
    date: result.data.date,
    rateCount: Object.keys(result.data[base] ?? {}).length,
    source: result.url,
  });

  if (shouldFetchAll && index < bases.length - 1) {
    await wait(150);
  }
}

const manifest = {
  fetchedAt: new Date().toISOString(),
  api: {
    repository: "https://github.com/fawazahmed0/exchange-api",
    primaryBaseUrl,
    fallbackBaseUrl,
  },
  currencies: {
    count: currencyCodes.length,
    path: toProjectPath(currenciesPath),
  },
  rates: fetched.map((item) => ({
    ...item,
    path: toProjectPath(item.path),
  })),
};

const manifestPath = path.join(outputDir, "manifest.json");
await writeJson(manifestPath, manifest);

console.log(
  JSON.stringify(
    {
      currencyCount: currencyCodes.length,
      fetchedRateFiles: fetched.length,
      outputDir: toProjectPath(outputDir),
      manifestPath: toProjectPath(manifestPath),
    },
    null,
    2,
  ),
);
