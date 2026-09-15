import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS, normalizeAutomationId } from './_schema.js';
import { toggleAutomationState } from './_ui.js';

export const startCommand = cli({
  site: 'albato',
  name: 'start',
  access: 'write',
  description: 'Safely start a stopped Albato automation with strict single-id scoping and readback verification.',
  example: 'opencli --profile <profile> albato start --automation-id 387328 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'automation-id', type: 'string', required: true, help: 'Exact Albato automation ID to start.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.start,
  func: async (page, kwargs) => {
    const automationId = normalizeAutomationId(kwargs['automation-id'], { required: true });
    const result = await toggleAutomationState(page, { automationId, action: 'start' });
    return [result];
  },
});
