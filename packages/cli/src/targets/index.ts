import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstallScope, TargetAdapter } from './types.js';

function projectSkills(base: string, skillId: string): string {
  return join(base, skillId);
}

const cursor: TargetAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  detect: (d) => exists(join(d, '.cursor')),
  skillsDir: (d, s) =>
    s === 'global' ? join(homedir(), '.cursor', 'skills') : join(d, '.cursor', 'skills'),
  mcpConfigPath: (d, s) =>
    s === 'global' ? join(homedir(), '.cursor', 'mcp.json') : join(d, '.cursor', 'mcp.json')
};

const claudeCode: TargetAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  detect: (d) => exists(join(d, '.claude')),
  skillsDir: (d, s) =>
    s === 'global' ? join(homedir(), '.claude', 'skills') : join(d, '.claude', 'skills'),
  mcpConfigPath: (d, s) =>
    s === 'global' ? join(homedir(), '.claude', 'mcp.json') : join(d, '.mcp.json')
};

const windsurf: TargetAdapter = {
  id: 'windsurf',
  displayName: 'Windsurf',
  detect: (d) => exists(join(d, '.windsurf')),
  skillsDir: (d, s) =>
    s === 'global'
      ? join(homedir(), '.codeium', 'windsurf', 'skills')
      : join(d, '.windsurf', 'skills'),
  mcpConfigPath: (d, s) =>
    s === 'global'
      ? join(homedir(), '.codeium', 'windsurf', 'mcp_config.json')
      : join(d, '.windsurf', 'mcp_config.json')
};

const codex: TargetAdapter = {
  id: 'codex',
  displayName: 'Codex',
  detect: (d) => exists(join(d, '.codex')) || exists(join(d, '.agents')),
  skillsDir: (d, s) =>
    s === 'global' ? join(homedir(), '.agents', 'skills') : join(d, '.agents', 'skills'),
  mcpConfigPath: (d, s) =>
    s === 'global' ? join(homedir(), '.codex', 'mcp.json') : join(d, '.codex', 'mcp.json'),
  async postInstall({ projectDir, scope, skillIds }) {
    const { patchAgentsMd } = await import('../agents-md.js');
    await patchAgentsMd(projectDir, scope, skillIds);
  }
};

// Google Antigravity auto-discovers workspace skills from .agents/skills/
// (back-compat .agent/skills/) and global skills from ~/.gemini/config/skills/.
// Its MCP config is global-only at ~/.gemini/config/mcp_config.json.
// Docs: https://antigravity.google/docs/skills and /docs/mcp
const antigravity: TargetAdapter = {
  id: 'antigravity',
  displayName: 'Google Antigravity',
  detect: (d) => exists(join(d, '.agents')) || exists(join(d, '.agent')),
  skillsDir: (d, s) =>
    s === 'global' ? join(homedir(), '.gemini', 'config', 'skills') : join(d, '.agents', 'skills'),
  mcpConfigPath: () => join(homedir(), '.gemini', 'config', 'mcp_config.json')
};

const copilot: TargetAdapter = {
  id: 'copilot',
  displayName: 'GitHub Copilot',
  detect: (d) => exists(join(d, '.github')),
  skillsDir: (d, s) =>
    s === 'global'
      ? join(homedir(), '.config', 'Code', 'User', 'copilot', 'skills')
      : join(d, '.github', 'copilot', 'skills'),
  mcpConfigPath: (d, s) =>
    s === 'global'
      ? join(homedir(), '.config', 'Code', 'User', 'mcp.json')
      : join(d, '.vscode', 'mcp.json')
};

const universal: TargetAdapter = {
  id: 'universal',
  displayName: 'Universal (.agents)',
  detect: () => true,
  skillsDir: (d, s) =>
    s === 'global' ? join(homedir(), '.agents', 'skills') : join(d, '.agents', 'skills'),
  mcpConfigPath: (d, s) =>
    s === 'global' ? join(homedir(), '.agents', 'mcp.json') : join(d, '.agents', 'mcp.json')
};

const exists = existsSync;

export const TARGETS: TargetAdapter[] = [
  cursor,
  claudeCode,
  windsurf,
  codex,
  antigravity,
  copilot,
  universal
];

export function getTarget(id: string): TargetAdapter {
  const t = TARGETS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tool: ${id}. Choose: ${TARGETS.map((x) => x.id).join(', ')}`);
  return t;
}

export function detectTargets(projectDir: string): string[] {
  return TARGETS.filter((t) => t.id !== 'universal' && t.detect(projectDir)).map((t) => t.id);
}

export { projectSkills };
