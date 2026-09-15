import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS, normalizeAutomationId } from './_schema.js';
import { toggleAutomationState } from './_ui.js';

export const pauseCommand = cli({
  site: 'albato',
  name: 'pause',
  access: 'write',
  description: 'Safely pause a running Albato automation with strict single-id scoping and readback verification.',
  example: 'opencli --profile <profile> albato pause --automation-id 387328 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'automation-id', type: 'string', required: true, help: 'Exact Albato automation ID to pause.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.pause,
  func: async (page, kwargs) => {
    const automationId = normalizeAutomationId(kwargs['automation-id'], { required: true });
    const result = await toggleAutomationState(page, { automationId, action: 'pause' });
    return [result];
  },
});
