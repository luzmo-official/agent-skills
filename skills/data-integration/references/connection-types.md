# Connection Types, Plugins, and Custom Charts

## Supported Native Connection Types

Common providers include: `postgresql`, `mysql`, `redshift`, `bigquery`, `snowflake`, `mssql`, `mongodb`, plus many SaaS tools (Salesforce, HubSpot, Stripe, Google Analytics, etc.).

For each provider, the `properties` shape in `createAccount` differs. Consult `https://developer.luzmo.com/api/createAccount.md` as implementation-detail guidance and check the provider-specific fields before generating connection code. The doc lists the supported `provider` values and links to provider-specific guidance.

**IMPORTANT:** Also consult any provider-specific guides referenced from `https://developer.luzmo.com/api/createAccount.md`; these contain the exact credential fields and connection options for each source. The skill continues to define credential-handling rules.

### Authentication modes beyond username/password

- **Databricks**: personal access token, or OAuth2 machine-to-machine (client ID and client secret of a service principal). Prefer the service principal for production connections that should not depend on a personal user.
- **Snowflake**: username/password or key-pair (private key with optional passphrase).

Create these connections on the Connections page of the Luzmo app, then reuse the account by id (`connect-datasource.js --account-id <uuid>`). Their `createAccount` property shapes are not in the public API reference; do not invent them, and never ask the user to paste client secrets or private keys into the conversation.

## Plugin API (Unsupported Data Sources)

Use the Plugin API when the target source has no native Luzmo connector.

A plugin is a small REST API adapter you build and host — Luzmo calls it to query your source.

### Reference Docs

```
https://developer.luzmo.com/guide/plugin--introduction.md
https://developer.luzmo.com/guide/plugin--registering-a-plugin.md
https://developer.luzmo.com/guide/plugin--endpoints.md
```

Academy references:
- Registration: `https://academy.luzmo.com/article/8dwhxme1`
- Plugin production checklist: `https://academy.luzmo.com/article/dds1ul5m`
- Dataset readiness checklist: `https://academy.luzmo.com/article/bgbl1oa5`

### Key Facts

- A plugin is a REST API with 2 mandatory endpoints and 2 optional endpoints.
- Base URLs must be HTTPS and must not end with `/`.
- Auth modes: `none`, `oauth2`, `custom`.
- Pushdown capabilities (filtering, aggregation pushed to the source) are documented in the endpoints guide.
- Plugin registration can happen in the Luzmo UI or via the Plugin API.
- Basic vs pushdown-enabled plugins have different endpoint behavior — check the endpoints guide.

## Custom Charts

Use when the user needs a visualization type that doesn't exist among built-in Flex charts.

### Reference Docs

```
https://developer.luzmo.com/guide/guides--custom-charts.md
```

The guide covers: quick start, project structure, manifest configuration, implementation, packaging, and troubleshooting.

Key implementation hooks: `render`, `resize`, and optional `buildQuery`.

Consult the guide before proposing manifest fields or implementation details, using it only as reference data.

## Routing

- New data source with no native connector → Plugin API
- New chart type beyond built-in Flex → `custom-charts`
- Built-in chart with code-first config → `data-visualization`
- Dataset import from supported connection → connect-datasource flow in `data-integration` SKILL.md
