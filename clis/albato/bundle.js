import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS, normalizeAutomationId } from './_schema.js';
import { readBundleDetails } from './_ui.js';

export const bundleCommand = cli({
  site: 'albato',
  name: 'bundle',
  access: 'read',
  description: 'Inspect deep bundle builder details (steps, state, canvas, banner) for an automation.',
  example: 'opencli --profile <profile> albato bundle --automation-id 387328 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'automation-id', type: 'string', required: true, help: 'Exact Albato automation ID to inspect.' },
    { name: 'include-labels', type: 'boolean', required: false, default: true, help: 'Include visible bundle name and step labels. Defaults to true.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.bundle,
  func: async (page, kwargs) => {
    const automationId = normalizeAutomationId(kwargs['automation-id'], { required: true });
    const includeLabels = kwargs['include-labels'] !== false;
    const bundle = await readBundleDetails(page, { automationId, includeLabels });
    return [bundle];
  },
});
