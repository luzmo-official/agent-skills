import * as p from '@clack/prompts';
import { cwd } from 'node:process';
import {
  loadPluginConfig,
  loadSkillsManifest,
  resolveSkillIds
} from '../manifest.js';
import { resolveSkillSource } from '../source.js';
import { getTarget, TARGETS } from '../targets/index.js';
import { installMcp, installSkills } from '../install.js';
import {
  readLockfile,
  upsertLockEntry,
  writeLockfile,
  type LuzmoSkillsLockfile
} from '../lockfile.js';
import type { McpRegion } from '../mcp.js';
import type { InstallScope } from '../targets/types.js';
import { runWizard } from '../wizard.js';

export interface AddOptions {
  tool?: string[];
  skills?: string[];
  scope?: InstallScope;
  ref?: string;
  withMcp?: boolean;
  region?: McpRegion;
  mcpUrl?: string;
  vpcHost?: string;
  yes?: boolean;
  dryRun?: boolean;
  projectDir?: string;
}

export async function runAdd(opts: AddOptions): Promise<void> {
  const projectDir = opts.projectDir ?? cwd();
  let tools = opts.tool ?? [];
  let skillList = opts.skills ?? [];
  let scope: InstallScope = opts.scope ?? 'project';
  let withMcp = opts.withMcp ?? false;
  let region: McpRegion = opts.region ?? 'eu';
  let vpcHost = opts.vpcHost;

  if (!opts.yes && tools.length === 0) {
    const w = await runWizard(projectDir);
    tools = w.tools;
    skillList = w.skills;
    scope = w.scope;
    withMcp = w.withMcp;
    region = w.region;
    vpcHost = w.vpcHost;
  }

  if (tools.length === 0) tools = ['universal'];
  if (skillList.length === 0) skillList = ['all'];

  const manifest = loadSkillsManifest();
  const pluginConfig = loadPluginConfig();
  const skillIds = resolveSkillIds(skillList, manifest);
  const source = await resolveSkillSource(opts.ref);

  try {
    for (const toolId of tools) {
      const target = getTarget(toolId);
      const paths = installSkills({
        skillsRoot: source.skillsRoot,
        skillIds,
        target,
        projectDir,
        scope: scope,
        dryRun: opts.dryRun
      });
      if (withMcp || opts.mcpUrl) {
        if (opts.mcpUrl) {
          // custom URL — write directly
          const { luzmoMcpServerEntry: entryFn, mergeMcpConfig: merge } = await import('../mcp.js');
          const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
          const { join } = await import('node:path');
          const mcpPath = target.mcpConfigPath(projectDir, scope);
          let existing: Record<string, unknown> = {};
          if (existsSync(mcpPath)) {
            existing = JSON.parse(readFileSync(mcpPath, 'utf8')) as Record<string, unknown>;
          }
          const merged = merge(existing, entryFn(opts.mcpUrl));
          if (!opts.dryRun) {
            mkdirSync(join(mcpPath, '..'), { recursive: true });
            writeFileSync(mcpPath, JSON.stringify(merged, null, 2) + '\n');
          }
        } else {
          installMcp(target, projectDir, scope, pluginConfig, region, vpcHost, opts.dryRun);
        }
      }
      if (target.postInstall && !opts.dryRun) {
        await target.postInstall({ projectDir, scope, skillIds });
      }
      p.log.success(`${target.displayName}: ${paths.length} skill(s) → ${paths[0]?.replace(/\/[^/]+$/, '') ?? 'n/a'}`);
    }

    if (!opts.dryRun && scope === 'project') {
      let lock: LuzmoSkillsLockfile = readLockfile(projectDir) ?? {
        version: '1',
        packageVersion: pluginConfig.version,
        entries: []
      };
      for (const toolId of tools) {
        lock = upsertLockEntry(lock, {
          tool: toolId,
          scope,
          skills: skillIds,
          ...(withMcp
            ? {
                mcp: {
                  region,
                  url: opts.mcpUrl ?? `region:${region}`,
                  vpcHost
                }
              }
            : {})
        });
      }
      writeLockfile(projectDir, lock);
    }

    if (withMcp) {
      p.note(
        'Export credentials before using MCP:\n  export LUZMO_KEY="your-api-key"\n  export LUZMO_TOKEN="your-api-token"',
        'MCP auth'
      );
    }
  } finally {
    source.cleanup?.();
  }
}
