export type InstallScope = 'project' | 'global';

export interface TargetAdapter {
  id: string;
  displayName: string;
  detect(projectDir: string): boolean;
  skillsDir(projectDir: string, scope: InstallScope): string;
  mcpConfigPath(projectDir: string, scope: InstallScope): string;
  /** Optional post-install (e.g. AGENTS.md for Codex) */
  postInstall?(ctx: PostInstallContext): Promise<void>;
}

export interface PostInstallContext {
  projectDir: string;
  scope: InstallScope;
  skillIds: string[];
}
