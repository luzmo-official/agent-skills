# Luzmo SDK Setup Reference

Detailed installation and initialization for each official Luzmo SDK. Read this when the user needs to wire up a specific backend or frontend SDK.

## Backend SDKs (Server-Side ONLY)

Backend SDKs use API credentials (`LUZMO_API_KEY`, `LUZMO_API_TOKEN`) directly. They must NEVER run in a browser.

Consult per-language **call forms** for `createAuthorization` and other endpoints (HTML, no `.md` suffix):

`https://developer.luzmo.com/api/createAuthorization/call/{js|python|java|dotnet|curl|php}`

### Node.js — `@luzmo/nodejs-sdk`

```bash
npm install @luzmo/nodejs-sdk
```

Call form: https://developer.luzmo.com/api/createAuthorization/call/js

### Python — `luzmo-sdk`

```bash
pip install luzmo-sdk
```

Call form: https://developer.luzmo.com/api/createAuthorization/call/python

### PHP — `luzmo/luzmo-sdk-php`

```bash
composer require luzmo/luzmo-sdk-php
```

Call form: https://developer.luzmo.com/api/createAuthorization/call/php

### Java — `com.luzmo:sdk`

Add to `pom.xml`:
```xml
<dependency>
    <groupId>com.luzmo</groupId>
    <artifactId>sdk</artifactId>
    <version>LATEST</version>
</dependency>
```

Call form: https://developer.luzmo.com/api/createAuthorization/call/java

### C# — `LuzmoSDK`

```bash
dotnet add package LuzmoSDK
```

Call form: https://developer.luzmo.com/api/createAuthorization/call/dotnet

### cURL

Call form: https://developer.luzmo.com/api/createAuthorization/call/curl

## Frontend SDKs (Use Embed Tokens, NOT API Credentials)

Frontend SDKs accept `authKey` (the embed token's `id`) and `authToken` (the embed token's `token`) — never the raw API credentials.

### Vanilla JS / Web Components — `@luzmo/embed`

```bash
npm install @luzmo/embed
```

```html
<luzmo-embed-dashboard
  auth-key="<embed-key>"
  auth-token="<embed-token>"
  dashboard-id="<uuid>"
></luzmo-embed-dashboard>
```

### React — `@luzmo/react-embed`

```bash
npm install @luzmo/react-embed
```

```jsx
import { LuzmoDashboardComponent } from '@luzmo/react-embed';

<LuzmoDashboardComponent
  authKey={embedKey}
  authToken={embedToken}
  dashboardId="..."
/>
```

### Angular — `@luzmo/ngx-embed`

```bash
npm install @luzmo/ngx-embed
```

Import `NgxLuzmoDashboardModule` and use `<luzmo-dashboard>`.

### Vue — `@luzmo/vue-embed`

```bash
npm install @luzmo/vue-embed
```

Register globally or per-component and use `<luzmo-dashboard>`.

### React Native — `@luzmo/react-native-embed`

```bash
npm install @luzmo/react-native-embed
```

NOTE: IQ Chat/Answer components are NOT supported in React Native — only standard dashboards/charts.

## Never Mix

- Don't use a backend SDK in the browser — it expects API credentials and would leak them.
- Don't use a frontend SDK on the server alone for API calls — backend SDKs are designed for the POST/action shape and credential handling.

## When in Doubt

Consult the up-to-date install/usage docs:
- `https://developer.luzmo.com/guide/dashboard-embedding--embed-into-application.md`
- `https://developer.luzmo.com/guide/flex--introduction--installation-instructions.md`

**IMPORTANT:** Also consult any framework-specific guides those docs reference.
