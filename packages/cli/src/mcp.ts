import type { PluginConfig } from './manifest.js';

export type McpRegion = 'eu' | 'us' | 'vpc';

export function mcpUrl(
  config: PluginConfig,
  region: McpRegion,
  vpcHost?: string
): string {
  const version = config.mcp?.pathVersion ?? '0.1.0';
  let apiHost: string;
  if (region === 'vpc' && vpcHost) {
    apiHost = vpcHost.replace(/\/$/, '');
  } else if (region === 'us') {
    apiHost = config.mcp?.regions?.us?.apiHost ?? 'https://api.us.luzmo.com';
  } else {
    apiHost = config.mcp?.regions?.eu?.apiHost ?? 'https://api.luzmo.com';
  }
  return `${apiHost}/${version}/mcp`;
}

export function luzmoMcpServerEntry(url: string): Record<string, unknown> {
  return {
    luzmo: {
      url,
      headers: {
        'X-Luzmo-Key': '${LUZMO_KEY}',
        'X-Luzmo-Token': '${LUZMO_TOKEN}'
      }
    }
  };
}

export function mergeMcpConfig(
  existing: Record<string, unknown>,
  entry: Record<string, unknown>
): Record<string, unknown> {
  const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
  return {
    ...existing,
    mcpServers: { ...servers, ...entry }
  };
}

export function removeLuzmoMcp(existing: Record<string, unknown>): Record<string, unknown> {
  const servers = { ...((existing.mcpServers as Record<string, unknown>) ?? {}) };
  delete servers.luzmo;
  return { ...existing, mcpServers: servers };
}
