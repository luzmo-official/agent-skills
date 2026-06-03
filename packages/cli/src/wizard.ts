import * as p from '@clack/prompts';
import { loadSkillsManifest } from './manifest.js';
import { detectTargets, TARGETS } from './targets/index.js';
import type { InstallScope } from './targets/types.js';
import type { McpRegion } from './mcp.js';

export interface WizardResult {
  tools: string[];
  skills: string[];
  scope: InstallScope;
  withMcp: boolean;
  region: McpRegion;
  vpcHost?: string;
}

function skillOptionsFromManifest(): { value: string; label: string }[] {
  const manifest = loadSkillsManifest();
  const options: { value: string; label: string }[] = [
    { value: 'all', label: 'All skills (recommended)' }
  ];
  for (const skill of manifest.skills) {
    const suffix = skill.required ? ' (required base)' : '';
    const desc = skill.description ? ` — ${skill.description}` : '';
    options.push({
      value: skill.id,
      label: `${skill.id}${suffix}${desc}`
    });
  }
  return options;
}

export async function runWizard(projectDir: string): Promise<WizardResult> {
  p.intro('Luzmo agent skills');

  const detected = detectTargets(projectDir);
  const toolChoice = await p.multiselect({
    message: 'Which tools should I configure?',
    options: TARGETS.filter((t) => t.id !== 'universal').map((t) => ({
      value: t.id,
      label: t.displayName,
      hint: detected.includes(t.id) ? 'detected' : undefined
    })),
    initialValues: detected.length ? detected : ['cursor']
  });
  if (p.isCancel(toolChoice)) process.exit(0);

  const manifest = loadSkillsManifest();
  const defaultSkills = ['all'];
  const skillsChoice = await p.multiselect({
    message: 'Which skills?',
    options: skillOptionsFromManifest(),
    initialValues: defaultSkills
  });
  if (p.isCancel(skillsChoice)) process.exit(0);

  const scope = (await p.select({
    message: 'Install scope',
    options: [
      { value: 'project', label: 'Project (recommended)' },
      { value: 'global', label: 'Global (all projects)' }
    ],
    initialValue: 'project'
  })) as InstallScope;
  if (p.isCancel(scope)) process.exit(0);

  const withMcp = await p.confirm({
    message: 'Also register the hosted Luzmo MCP server? (opt-in)',
    initialValue: false
  });
  if (p.isCancel(withMcp)) process.exit(0);

  let region: McpRegion = 'eu';
  let vpcHost: string | undefined;
  if (withMcp) {
    const regionChoice = await p.select({
      message: 'Luzmo API region',
      options: [
        { value: 'eu', label: 'EU — api.luzmo.com' },
        { value: 'us', label: 'US — api.us.luzmo.com' },
        { value: 'vpc', label: 'Custom VPC' }
      ]
    });
    if (p.isCancel(regionChoice)) process.exit(0);
    region = regionChoice as McpRegion;
    if (region === 'vpc') {
      const host = await p.text({
        message: 'VPC API host (e.g. https://api.acme.luzmo.com)',
        placeholder: 'https://api.<vpc>.luzmo.com'
      });
      if (p.isCancel(host)) process.exit(0);
      vpcHost = host;
    }
  }

  const skills = (skillsChoice as string[]).includes('all')
    ? ['all']
    : (skillsChoice as string[]);

  return {
    tools: toolChoice as string[],
    skills,
    scope,
    withMcp: Boolean(withMcp),
    region,
    vpcHost
  };
}
