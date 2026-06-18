# Common Mistakes

Each pitfall below includes the error you'll see, why it fails, a frequency marker ([WARNING] VERY COMMON / [WARNING] COMMON / [WARNING] OCCASIONAL), and where to escalate.

**[ERROR] Using REST-style HTTP verbs ([WARNING] VERY COMMON):**
```javascript
fetch('/api/dashboard', { method: 'GET' })     // Wrong
fetch('/api/dashboard', { method: 'PUT' })     // Wrong
fetch('/api/dashboard', { method: 'DELETE' })  // Wrong
```
You'll see: `404 Not Found`, `405 Method Not Allowed`, or unexpected empty responses.
**Why this fails:** Luzmo's API is POST-only with the operation in the body — there is no GET/PUT/PATCH/DELETE handler.
**[OK] Always use POST with action field:**
```javascript
fetch('/api/securable', { 
  method: 'POST',
  body: JSON.stringify({ action: 'get', ... })  // Correct
})
```
**See also:** `api-actions.md`.

**[ERROR] Using "search" as an action ([WARNING] VERY COMMON):**
```javascript
{ action: "search", find: {...} }  // Wrong - "search" doesn't exist
```
You'll see: `Action 'search' not found`.
**Why this fails:** Luzmo uses `get` for both single-resource fetches and list/search operations — `search` is not a valid action.
**[OK] Use "get" for searching:**
```javascript
{ action: "get", find: {...} }  // Correct
```

**[ERROR] Exposing API credentials in frontend ([WARNING] COMMON — SECURITY CRITICAL):**
```javascript
// [ERROR] NEVER do this in client-side code
const client = new Luzmo({
  api_key: "your-api-key",
  api_token: "your-api-token"
})
```
You'll see: nothing immediately — the breach is invisible until credentials are scraped.
**Why this fails:** API credentials grant full org-wide read/write/delete access. Leaked credentials let an attacker delete all dashboards, exfiltrate all data, and rotate other users' access.
**[OK] Generate embed tokens server-side:**
```javascript
// [OK] Server: generate token
const auth = await client.create('authorization', {...})

// [OK] Client: use only the embed token
<luzmo-embed-dashboard
  authKey={auth.id}
  authToken={auth.token}
/>
```

**[ERROR] Wrong included model property names ([WARNING] COMMON):**
```javascript
response.data[0].Columns  // Wrong
response.data[0].Account  // Wrong
```
You'll see: `undefined` when destructuring; the data IS in the response but under a different key.
**Why this fails:** Luzmo serializes included associations as lowercase plural — `Column` → `columns`, `Account` → `accounts`, regardless of how you named them in the `include` array.
**[OK] Use lowercase plural:**
```javascript
response.data[0].columns  // Correct
response.data[0].accounts // Correct
```
**See also:** `api-actions.md` for the full include-naming table.
