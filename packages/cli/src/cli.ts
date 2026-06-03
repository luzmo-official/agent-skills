import { Command } from 'commander';
import { runAdd } from './commands/add.js';
import { runDoctor } from './commands/doctor.js';
import { runList } from './commands/list.js';
import { runRemove } from './commands/remove.js';
import { runUpdate } from './commands/update.js';
import { loadPluginConfig } from './manifest.js';
import { runWizard } from './wizard.js';
import { cwd } from 'node:process';

const program = new Command();

program
  .name('agent-skills')
  .description('Install Luzmo agent skills and optional MCP configuration')
  .version(loadPluginConfig().version);

program
  .command('add')
  .description('Install skills (interactive wizard when no flags)')
  .option(
    '--tool <tools>',
    'comma-separated: cursor,claude-code,windsurf,codex,antigravity,copilot,universal'
  )
  .option('--skills <skills>', 'comma-separated skill ids or "all"')
  .option('--scope <scope>', 'project or global', 'project')
  .option('--ref <ref>', 'fetch skills from GitHub branch/tag instead of bundled copy')
  .option('--with-mcp', 'register hosted Luzmo MCP server')
  .option('--region <region>', 'eu, us, or vpc', 'eu')
  .option('--mcp-url <url>', 'custom MCP URL (overrides --region)')
  .option('--vpc-host <url>', 'VPC API host when --region vpc')
  .option('--yes', 'skip interactive wizard')
  .option('--dry-run', 'print paths without writing')
  .action(async (opts) => {
    await runAdd({
      tool: opts.tool?.split(',').map((s: string) => s.trim()),
      skills: opts.skills?.split(',').map((s: string) => s.trim()),
      scope: opts.scope,
      ref: opts.ref,
      withMcp: opts.withMcp,
      region: opts.region,
      mcpUrl: opts.mcpUrl,
      vpcHost: opts.vpcHost,
      yes: Boolean(opts.yes || opts.tool || opts.skills),
      dryRun: opts.dryRun
    });
  });

program.command('list').action(async () => runList({}));
program
  .command('remove')
  .requiredOption('--tool <tools>', 'comma-separated tool ids')
  .option('--skills <skills>', 'skills to remove (default: all)')
  .option('--scope <scope>', 'project or global', 'project')
  .option('--mcp', 'remove MCP entry too')
  .action(async (opts) => {
    await runRemove({
      tool: opts.tool.split(',').map((s: string) => s.trim()),
      skills: opts.skills?.split(',').map((s: string) => s.trim()),
      scope: opts.scope,
      mcp: opts.mcp
    });
  });
program.command('update').option('--ref <ref>').action(async (opts) => runUpdate({ ref: opts.ref, yes: true }));
program.command('doctor').action(async () => runDoctor({}));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const w = await runWizard(cwd());
    await runAdd({
      tool: w.tools,
      skills: w.skills,
      scope: w.scope,
      withMcp: w.withMcp,
      region: w.region,
      vpcHost: w.vpcHost,
      yes: true
    });
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
