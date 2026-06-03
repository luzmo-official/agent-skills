#!/usr/bin/env node
/**
 * push-data.js
 * Push data to a Luzmo dataset in batches, respecting the 10,000-row API limit.
 * Supports CSV, XLSX, and JSON (array of arrays) input formats.
 *
 * Usage:
 *   node push-data.js --file data.csv --format csv --mode replace
 *   node push-data.js --dataset-id "<uuid>" --file data.xlsx --format xlsx --mode append
 *   node push-data.js --dataset-id "<uuid>" --file data.json --format json --mode replace
 *
 * Options:
 *   --file          Path to input file (required)
 *   --format        csv | xlsx | json  (required)
 *   --mode          replace (default) | append
 *   --dataset-id    Existing dataset UUID (omit to create a new dataset)
 *   --name          Dataset name for new datasets (default: filename)
 *   --batch-size    Rows per batch (default: 10000, max: 10000)
 *
 * Required env vars: LUZMO_API_KEY, LUZMO_API_TOKEN
 * Optional env var:  LUZMO_API_HOST (default: https://api.luzmo.com)
 *
 * Dependencies:
 *   npm install xlsx  (only needed for --format xlsx)
 */

const https = require("https");
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const API_BASE = process.env.LUZMO_API_HOST || "https://api.luzmo.com";
const API_KEY = process.env.LUZMO_API_KEY;
const API_TOKEN = process.env.LUZMO_API_TOKEN;
const BATCH_SIZE = 10000;

if (!API_KEY || !API_TOKEN) {
  console.error("Error: LUZMO_API_KEY and LUZMO_API_TOKEN must be set.");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { mode: "replace", "batch-size": BATCH_SIZE };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    result[key] = args[i + 1];
  }
  return result;
}

function post(resource, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      key: API_KEY,
      token: API_TOKEN,
      version: "0.1.0",
      ...body,
    });
    const parsed = url.parse(`${API_BASE}/${resource}`);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) =>
    line.split(",").map((cell) => {
      const trimmed = cell.trim();
      const num = Number(trimmed);
      return trimmed !== "" && !isNaN(num) ? num : trimmed.replace(/^"|"$/g, "");
    })
  );
}

function parseXlsx(filePath) {
  let XLSX;
  try {
    XLSX = require("xlsx");
  } catch {
    console.error('XLSX format requires the "xlsx" package: npm install xlsx');
    process.exit(1);
  }
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1 });
}

function parseJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) {
    console.error("JSON file must be an array of arrays (first row = column names).");
    process.exit(1);
  }
  return raw;
}

async function pushBatch(datasetId, rows, mode) {
  const body = {
    action: "create",
    properties: {
      content: { data: rows },
      options: { mode },
    },
  };
  if (datasetId) {
    body.find = { id: datasetId };
  }
  return post("data", body);
}

async function main() {
  const args = parseArgs();

  if (args.help || !args.file || !args.format) {
    console.log(`
Usage:
  node push-data.js --file <path> --format <csv|xlsx|json> [options]

Options:
  --file          Path to input file (required)
  --format        csv | xlsx | json (required)
  --mode          replace (default) | append
  --dataset-id    Existing dataset UUID (omit to create a new dataset)
  --name          Dataset name for new datasets (default: filename)
  --batch-size    Rows per batch (default/max: 10000)

Required env vars: LUZMO_API_KEY, LUZMO_API_TOKEN
Optional env var:  LUZMO_API_HOST (default: https://api.luzmo.com)
    `);
    process.exit(0);
  }

  let rows;
  const fmt = args.format.toLowerCase();
  if (fmt === "csv") rows = parseCsv(args.file);
  else if (fmt === "xlsx") rows = parseXlsx(args.file);
  else if (fmt === "json") rows = parseJson(args.file);
  else {
    console.error(`Unsupported format: ${fmt}. Use csv, xlsx, or json.`);
    process.exit(1);
  }

  if (rows.length < 2) {
    console.error("File must contain at least a header row and one data row.");
    process.exit(1);
  }

  const batchSize = Math.min(parseInt(args["batch-size"]) || BATCH_SIZE, BATCH_SIZE);
  const header = rows[0];
  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;
  const batches = Math.ceil(totalRows / batchSize);

  console.log(`\nFile: ${args.file}`);
  console.log(`Rows: ${totalRows} (excl. header) | Batches: ${batches} | Mode: ${args.mode}`);

  let datasetId = args["dataset-id"] || null;
  const isFirstBatch = true;

  for (let i = 0; i < batches; i++) {
    const batchRows = dataRows.slice(i * batchSize, (i + 1) * batchSize);
    const payload = i === 0 ? [header, ...batchRows] : [header, ...batchRows];
    const batchMode = i === 0 ? args.mode : "append";

    process.stdout.write(`  Batch ${i + 1}/${batches} (${batchRows.length} rows)... `);

    const result = await pushBatch(datasetId, payload, batchMode);

    if (i === 0 && !datasetId) {
      datasetId = result.id || (result.data && result.data[0] && result.data[0].id);
      if (datasetId) {
        console.log(`created dataset ${datasetId}`);
      } else {
        console.log("done (no id in response)");
      }
    } else {
      console.log("done");
    }
  }

  console.log(`\nFinished. ${totalRows} rows pushed to dataset: ${datasetId || "(unknown)"}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
