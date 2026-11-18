# Embed credentials

Read this as soon as the user says an Embed key and token pair is in `.env`, and whenever a script stops on Embed access.

## Contents

- [Check Embed credentials before using them](#check-embed-credentials-before-using-them)

## Check Embed credentials before using them

**What the scripts check.** Every script that sends requests with the `LUZMO_EMBED_` pair (`iq.mjs --mode run` with `iq_authentication: "embed"`, and `profile.mjs --execute` or `inspect.mjs` with Embed authentication) first asks each dataset in scope for one raw row with that token. It stops before sending anything else when:

- the token is refused;
- the token has no access to a dataset, only `read` access (IQ and free queries need `use`), or unconfirmed access;
- a dataset returns 0 rows, for profiling and inspection only. IQ runs may continue with accessible empty datasets to test no-data behaviour.

**Do not wait for that stop.** Run `embed-access.mjs` as soon as the user says the Embed pair is in `.env`, and again whenever a script stops this way ([commands](commands.md#embed-token-checks)). It:

- repeats the row checks;
- reads the token's own configuration: access list, token filters and parameter overrides (connection overrides cannot be read back);
- reads the embed filters on the selected datasets, and whether the API token belongs to an organization owner;
- drafts the Authorization request in `artifacts/embed-authorization-request.json`, with a placeholder for every end-user-specific value and one `parameter_overrides` entry per parameter the datasets' embed filters use.

Never fall back to the API token.

**When the check finds a problem**, tell the user in plain words which datasets their end user cannot open and which show that user no data, with the likely cause from the hints. Then let them choose with the questions tool:

1. **Create a new end-user token with the API token.** Offer this only when the check reports that the API token belongs to an organization owner; when the role is unknown, ask the user first.
   - Write `embed-authorization.json` in the workspace from `suggested_properties`.
   - Ask the user to confirm every value, as a small related batch where useful: the end user (`username`, `name`, `email`), their tenant (`suborganization`), the datasets granted, each `parameter_overrides` value and the expiry (24 hours unless set).
   - Offer the current token's values from `embed-access.json` as defaults where they exist. Never invent a tenant or parameter value.
   - Run `embed-access.mjs --mode create`, show the printed plan, get explicit confirmation of exactly those values, then run it with `--execute --plan-sha256 <printed-hash>`.
   - Creating a token adds or updates that end user in Luzmo and replaces the Embed pair in `.env` without showing it; the script then checks the new token.
   - Tokens that need connection overrides (`account_overrides`) hold database credentials: leave those to the customer's developer.
2. **Have their developer create it.** Recommend this when the API token is not an organization owner's, or when connection overrides are involved. Give a ready-to-forward message with the request from `embed-authorization-request.json`, explaining:
   - what each placeholder means;
   - that the tenant and parameter values must be the ones the application uses for that end user;
   - that the request is sent server-side with an organization owner's API key and token;
   - that the resulting key and token go in the two `LUZMO_EMBED_` lines of `.env`, never in chat or email.

Continue only after access is confirmed for the intended use. A standalone access check reports 0 rows as not ready for profiling; an IQ run explicitly allows that state for no-data tests.
