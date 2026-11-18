# Preparing the customer review

## Prepare the customer review

1. **Seed from the immutable capture** with the requested resource scope. Complete each in-scope assessment, evidence and outcome; keep excluded resources visibly separate. Fields: [proposal-format.md](proposal-format.md#fields-to-fill). Checks: [review-and-evaluation.md](review-and-evaluation.md).
2. **Compare meanings** across all locales, original context, expressions and earlier relevant work.
   - Explain useful knowledge that was removed or moved.
   - Resolve material warnings; phrase checks alone cannot establish correctness.
   - Keep calculation defects, uncertainties, duplicates and recommendations as separate follow-ups.
3. **Write for the reviewer.**
   - Set `review_language` to the user's language for agent-authored explanations. Fixed HTML and Markdown interface labels stay English; this setting does not translate them.
   - Quote metadata, customer names and test questions in their own languages.
   - Write findings, owner questions and next actions as short business-language sentences. Put expressions and technical IDs in collapsed `technical_details`.
4. **Render and surface.** Run `review.mjs`, inspect the generated HTML and preview, then [surface the page](#surfacing-the-review) with a concise verdict, counts, material concerns and the next action.
   - Do not ask whether the user wants it rendered.
   - Collect feedback in chat. The page neither publishes nor approves changes.

## What the page shows

- It opens with the verdict and a prioritized "Check these first" list, then word-level diffs of descriptions and changed AI context, filters, numbered resources, and collapsed technical evidence, expression facts and baseline comparison.
- Metadata is grouped by dataset, with AI rules and agents and IQ views when available.
- Updated and held items are prominent. Reviewed items with no update needed stay hidden until the reader ticks "Also show reviewed items (no update needed)"; AI rules and agents have their own checkbox.
- "Print or save as PDF" prints every view with details expanded, but only the items currently shown. Hidden no-update items stay out of the printout unless the reviewer ticks the matching "Also show reviewed …" checkbox first; active search, dataset and language filters also apply.
- Readiness lines, baseline details and machine warnings stay in `review.md` and the artifacts. The page has no chat instructions or feedback forms.

Fill the page well:

- Write assessments that explain the concrete benefit or sufficiency for each resource, not boilerplate.
- Put anything reviewers must see in `review_summary.purpose`, `highlights` and especially `limitations`. Never rely on `review.md` to disclose a material limitation. A focused scope and its excluded-resource count are shown automatically.
- Evidence is text or `{summary, source, reference}`; `source` is a title or `{title, url/path}`. Dashboard evidence includes `dashboard_id` for links. Cite only evidence you actually inspected; never invent benefits or sources.
- App links use the optional `LUZMO_APP_HOST`; otherwise `api.*` becomes `app.*`. The page's address field changes links in that browser tab only.
- Keep exact JSON out of the business-facing page.

## Surfacing the review

Surfacing the review is the agent's job, not the user's. The user should reach the rendered page, not its source, in one click. The HTML is self-contained (styles and script inline), so open the file directly. Use the first option the host supports:

1. The host's built-in browser or file preview pane.
2. An inline file card that renders the HTML.
3. The OS default browser when the agent runs on the user's machine (`start "" "<path>"`, `open`, `xdg-open`).
4. A `file://` link to `review.html`.

Then:

- Confirm the page actually rendered. Some hosts open `file://` links as source code; if so, try the next option.
- Give a clickable Markdown link in chat to the `file://` URL that `review.mjs` prints, such as `[Open the review](file:///C:/work/luzmo-semantic-layer-review-artifacts/artifacts/review.html)`. Never paste a raw URL as plain text, in backticks or in a code block.
- Only if the host cannot open local files at all: tell the user, then serve the artifacts folder on 127.0.0.1 only (for example `python -m http.server --bind 127.0.0.1 8765`) and link `http://127.0.0.1:8765/review.html`. Never bind it to other interfaces such as `0.0.0.0` or a LAN address. Stop the server once the review is done.

Keep it private: the review contains customer metadata and possibly sensitive AI context. Get the user's consent before any external hosting.
