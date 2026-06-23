#!/usr/bin/env node
/**
 * connect-datasource.js
 * Connect an external data source to Luzmo by either reusing an existing
 * account or creating a new one, then registering tables as Luzmo datasets.
 *
 * Flow:
 *   A. Use existing account: --account-id <id>
 *   B. List accounts and pick one: --list-accounts [--provider <p>]
 *   C. Create new account: --provider + connection flags
 *
 * After resolving the account, the script continues with:
 *   2. getDataprovider – list available tables/views
 *   3. createDataprovider – register selected tables as Luzmo datasets
 *
 * Usage:
 *   # List all existing accounts (optionally filtered by provider)
 *   node connect-datasource.js --list-accounts
 *   node connect-datasource.js --list-accounts --provider postgresql
 *
 *   # Reuse an existing account by ID
 *   node connect-datasource.js --account-id <uuid> --provider postgresql --tables orders,customers
 *
 *   # Create a new account
 *   node connect-datasource.js --provider postgresql --host db.example.com \
 *     --port 5432 --database mydb --user readonly --password-env DB_PASSWORD \
 *     --tables orders,customers
 *
 * Required env vars:
 *   LUZMO_API_KEY, LUZMO_API_TOKEN
 *
 * Optional env vars:
 *   LUZMO_API_HOST  (default: https://api.luzmo.com)
 */

const https = require("https");
const http = require("http");
const url = require("url");

const API_BASE = process.env.LUZMO_API_HOST || "https://api.luzmo.com";
const API_KEY = process.env.LUZMO_API_KEY;
const API_TOKEN = process.env.LUZMO_API_TOKEN;

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      // Boolean flags (no value follows)
      if (key === "list-accounts" || key === "help") {
        result[key] = true;
      } else {
        result[key] = args[i + 1];
        i++;
      }
    }
  }
  return result;
}

function ensureApiCredentials() {
  if (!API_KEY || !API_TOKEN) {
    console.error("Error: LUZMO_API_KEY and LUZMO_API_TOKEN must be set.");
    process.exit(1);
  }
}

function resolveSourceCredential(args) {
  if (args.password) {
    console.error(
      "Error: --password is not supported because it can expose source credentials through the process list and shell history. Set the credential in an environment variable and pass --password-env <ENV_VAR>."
    );
    process.exit(1);
  }

  if (args["password-env"]) {
    const envName = args["password-env"];
    const value = process.env[envName];
    if (!value) {
      console.error(`Error: environment variable "${envName}" is not set.`);
      process.exit(1);
    }
    return value;
  }

  console.error(
    "Error: --password-env <ENV_VAR> is required when creating a new account. The script does not accept plaintext source credentials."
  );
  process.exit(1);
}

function post(resource, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      key: API_KEY,
      token: API_TOKEN,
      version: "0.1.0",
      ...body,
    });
    // The Luzmo REST API is versioned in the path: https://api.luzmo.com/0.1.0/<resource>.
    // Without the /0.1.0 segment the request hits a non-existent route and returns HTTP 404.
    const parsed = url.parse(`${API_BASE}/0.1.0/${resource}`);
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

/**
 * Retrieve existing accounts from Luzmo, optionally filtered by provider.
 * Returns an array of account objects.
 */
async function listAccounts(provider) {
  const find = {
    attributes: ["id", "name", "provider", "host", "scope", "active"],
    ...(provider ? { where: { provider } } : {}),
  };
  const resp = await post("account", { action: "get", find });
  return resp.rows || resp.data || [];
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(`
Usage:
  # List existing accounts (optionally filtered by provider)
  node connect-datasource.js --list-accounts [--provider <provider>]

  # Reuse an existing account by ID and import tables
  node connect-datasource.js --account-id <uuid> --provider <provider> [--tables <t1,t2>]

  # Create a new account and import tables
  node connect-datasource.js \\
    --provider <provider>   e.g. postgresql, mysql, bigquery, snowflake \\
    --host <host>           database host \\
    --port <port>           database port \\
    --database <db>         database/schema name \\
    --user <user>           database username \\
    --password-env <name>   env var containing database password or source token \\
    --name <name>           friendly connection name (optional) \\
    --tables <t1,t2>        comma-separated table names to import (imports all if omitted)

Required env vars: LUZMO_API_KEY, LUZMO_API_TOKEN
Optional env var:  LUZMO_API_HOST (default: https://api.luzmo.com)
Credential note: keep database passwords and SaaS tokens in server-side env vars.
This script rejects --password. Use --password-env so source credentials never appear in shell history.
    `);
    process.exit(0);
  }

  ensureApiCredentials();

  // --- Mode A: just list accounts and exit ---
  if (args["list-accounts"]) {
    console.log(`\nFetching existing accounts${args.provider ? ` for provider "${args.provider}"` : ""}...`);
    const accounts = await listAccounts(args.provider);
    if (accounts.length === 0) {
      console.log("No accounts found.");
    } else {
      console.log(`\nFound ${accounts.length} account(s):\n`);
      accounts.forEach((a, i) => {
        const host = a.host ? ` | host: ${a.host}` : "";
        const scope = a.scope ? ` | scope: ${a.scope}` : "";
        const status = a.active === false ? " [inactive]" : "";
        console.log(`  [${i}] ${a.id}  provider: ${a.provider}  name: ${a.name}${host}${scope}${status}`);
      });
    }
    process.exit(0);
  }

  // --- Resolve account ID ---
  let accountId = args["account-id"];

  if (accountId) {
    // --- Mode B: use provided account ID ---
    console.log(`\nUsing existing account: ${accountId}`);

    // Validate the account exists
    const resp = await post("account", {
      action: "get",
      find: { where: { id: accountId }, attributes: ["id", "name", "provider"] },
    });
    const rows = resp.rows || resp.data || [];
    if (rows.length === 0) {
      console.error(`Error: account "${accountId}" not found.`);
      process.exit(1);
    }
    const account = rows[0];
    console.log(`  Name: ${account.name}  Provider: ${account.provider}`);

    // If provider not supplied, infer it from the account
    if (!args.provider) {
      args.provider = account.provider;
      console.log(`  Inferred provider: ${args.provider}`);
    }
  } else {
    // --- Mode C: create a new account ---
    if (!args.provider) {
      console.error("Error: --provider is required when creating a new account.");
      console.error("Run with --list-accounts to see existing accounts, or --help for usage.");
      process.exit(1);
    }

    console.log(`\nStep 1: Creating account for provider "${args.provider}"...`);
    const sourceCredential = resolveSourceCredential(args);
    const accountResponse = await post("account", {
      action: "create",
      properties: {
        name: args.name || `${args.provider} connection`,
        provider: args.provider,
        host: args.host,
        port: args.port ? parseInt(args.port) : undefined,
        identifier: args.user,
        token: sourceCredential,
        scope: args.database,
      },
    });

    if (!accountResponse.id) {
      console.error("Failed to create account:", JSON.stringify(accountResponse, null, 2));
      process.exit(1);
    }
    accountId = accountResponse.id;
    console.log(`  Account created: ${accountId}`);
  }

  // --- Step 2: List available tables/views ---
  const stepLabel = args["account-id"] ? "Step 2" : "Step 2";
  console.log(`\n${stepLabel}: Fetching available tables and views...`);
  const providerResponse = await post("dataprovider", {
    action: "get",
    find: {
      provider: args.provider,
      account_id: accountId,
    },
  });

  const available = providerResponse.data || providerResponse;
  if (!Array.isArray(available) || available.length === 0) {
    console.log("No tables found. Check connection details.");
    console.log("Response:", JSON.stringify(providerResponse, null, 2));
    process.exit(0);
  }

  console.log("\nAvailable tables/views:");
  available.forEach((t, i) => {
    const name = t.table || t.name || JSON.stringify(t);
    console.log(`  [${i}] ${name}`);
  });

  // --- Step 3: Register selected tables ---
  const tableFilter = args.tables
    ? args.tables.split(",").map((t) => t.trim())
    : null;

  const toImport = tableFilter
    ? available.filter((t) => tableFilter.includes(t.table || t.name))
    : available;

  if (toImport.length === 0) {
    console.log(
      `\nNo matching tables found for filter: ${args.tables}. Available: ${available.map((t) => t.table || t.name).join(", ")}`
    );
    process.exit(0);
  }

  console.log(
    `\nStep 3: Importing ${toImport.length} table(s) as Luzmo datasets...`
  );

  const datasetIds = [];
  for (const table of toImport) {
    const tableName = table.table || table.name;
    console.log(`  Importing table: ${tableName}`);
    const result = await post("dataprovider", {
      action: "create",
      properties: {
        provider: args.provider,
        account_id: accountId,
        tables: [{ table: tableName, schema: table.schema || "public" }],
      },
    });
    const datasetId = result.id || (result.data && result.data[0] && result.data[0].id);
    if (datasetId) {
      console.log(`    Dataset created: ${datasetId}`);
      datasetIds.push({ table: tableName, datasetId });
    } else {
      console.warn(`    Warning: unexpected response for ${tableName}:`, JSON.stringify(result));
    }
  }

  console.log("\nDone! Datasets created:");
  datasetIds.forEach(({ table, datasetId }) =>
    console.log(`  ${table}: ${datasetId}`)
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
