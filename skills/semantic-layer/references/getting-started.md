# Getting started

## Guide the user

- Start from the request and the evidence already available.
- Match the user's technical level without asking them to pick a communication mode.
- Ask only for missing information that changes the work; group a few related questions when that is easier.
- Continue independent work while waiting. Never infer authorization from silence.
- Handle JSON, technical IDs, hashes and commands yourself, and explain decisions in business terms.

## Investigate first, then ask only what remains unknown

For a text draft or translation, the supplied meaning and languages may be enough. Do not require credentials, company research, profiling or IQ runs.

For a live review:

1. **Reuse what you have:** the customer's identity, requested datasets, audience, languages and earlier artifacts. Search the documentation sources available in this environment for definitions of the in-scope fields before asking the owner. For an audit, research first-party public material only where it helps establish vocabulary or likely questions, and label the results as hypotheses.
2. **Initialize the private workspace** with `init.mjs` and link its `.env`. The user fills `LUZMO_API_HOST`, `LUZMO_API_KEY` and `LUZMO_API_TOKEN` locally; the API Tokens page of their Luzmo instance shows the API host URL.
   - Never request or inspect secret values.
   - If the user already filled the workspace `.env` and asked for the review, use those credentials without asking again. Otherwise wait until the user confirms setup is ready.
3. **Discover datasets only if the selection is missing.** Present names and relevant distinctions, not raw IDs. Do not ask the user to reconfirm datasets or languages they already chose. Website languages are suggestions, not proof of the product's reporting languages.
4. **Choose a bounded data context** only when a material question needs live investigation ([workflow](workflow.md#2-choose-a-useful-profiling-target-and-data-context)). When IQ evaluation is requested, choose the IQ caller separately ([IQ evaluation](iq-evaluation.md#choose-who-asks-the-questions)).

## When Luzmo refuses the token

A 401 proves only that authentication was refused, not which cause is right. Check:

- the API host against the API Tokens page;
- that the credential pair is complete;
- expiry, revocation and IP restrictions.

An unrecognized pair may look anonymous; the scripts stop before continuing with that access. Never switch credential types as a fallback.

Then:

- Have the user repair or replace the pair locally, never by sending it in chat.
- Check a refreshed Embed pair again with [embed credentials](embed-credentials.md).
- After a failed write, read the recovery report before retrying ([publishing](publishing.md)).
- A refreshed IQ credential pair needs a new IQ baseline: comparisons are conservatively bound to the original pair.
