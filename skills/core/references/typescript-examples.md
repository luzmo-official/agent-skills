# TypeScript Examples

TypeScript-annotated code examples for type-safe Luzmo integration.

## Authorization Token Response

```typescript
interface LuzmoAuthorizationToken {
  id: string;           // Embed key (authKey)
  token: string;        // Embed token (authToken)
  expiry?: string;      // RFC 3339 timestamp
  role?: 'viewer' | 'designer' | 'owner';
}

// Usage
const auth: LuzmoAuthorizationToken = await client.create('authorization', {
  type: 'embed',
  role: 'viewer',
  username: user.id,
  name: user.name,
  email: user.email,
  access: {
    dashboards: [{ id: dashboardId, rights: 'read' }],
  },
});
```

## Authorization Request

```typescript
interface AccessControl {
  dashboards?: Array<{ id: string; rights: 'read' | 'use' | 'modify' | 'own' }>;
  datasets?: Array<{ id: string; rights: 'read' | 'use' | 'modify' | 'own' }>;
  collections?: Array<{ id: string; inheritRights: 'read' | 'use' | 'modify' | 'own' }>;
}

interface CreateAuthorizationParams {
  type: 'embed' | 'api';
  role?: 'viewer' | 'designer' | 'owner';
  username: string;
  name?: string;
  email?: string;
  expiry?: string;  // RFC 3339 timestamp
  access?: AccessControl;
  suborganization?: string;
  parameter_overrides?: Record<string, any>;
  filters?: Array<{
    clause: string;
    origin: string;
    securable_id: string;
    column_id: string;
    expression: string;
    value: any;
  }>;
  account_overrides?: Record<string, Record<string, any>>;
  iq?: {
    context?: string;
  };
  environment?: 'production' | 'acceptance' | 'development' | 'qa' | null;
  hidden_columns?: string[];
  feature_overrides?: string[];
}
```

## Flex Chart Slot Configuration

```typescript
// These can also be imported from the framework-specific packages: @luzmo/react-embed, @luzmo/ngx-embed, @luzmo/vue-embed
import { VizItemType, VizItemSlot, VizItemOptions } from '@luzmo/embed';

interface ChartConfig {
  type: VizItemType;
  // Consult https://developer.luzmo.com/flex/charts/{chart-type}.md before
  // narrowing slots & options: slot containers and names are chart-specific.
  slots: VizItemSlot[];
  options?: VizItemOptions;
}
```

## SDK Client Initialization

```typescript
import Luzmo from '@luzmo/nodejs-sdk';

interface LuzmoClientConfig {
  api_key: string;
  api_token: string;
  host?: string;
}

const config: LuzmoClientConfig = {
  api_key: process.env.LUZMO_API_KEY!,
  api_token: process.env.LUZMO_API_TOKEN!,
  host: process.env.LUZMO_API_HOST || 'https://api.luzmo.com',
};

const client = new Luzmo(config);
```

## API Response Structure

```typescript
interface LuzmoAPIResponse<T> {
  data?: T[];
  count?: number;
  limit?: number;
  offset?: number;
}

// Usage
const response: LuzmoAPIResponse<Dashboard> = await client.get('securable', {
  find: { where: { type: 'dashboard' } }
});

const dashboards = response.data || [];
```
