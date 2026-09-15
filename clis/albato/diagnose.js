import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS, diagnoseHistoryRows, normalizeAutomationId, normalizeLimit } from './_schema.js';
import { gotoAlbato, readHistoryRows } from './_ui.js';

export const diagnoseCommand = cli({
  site: 'albato',
  name: 'diagnose',
  access: 'read',
  description: 'Summarize repeated visible Albato history outcomes with safe repair hints; never retries or resends.',
  example: 'opencli --profile <profile> albato diagnose --automation-id 385151 --limit 50 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'automation-id', type: 'string', required: true, help: 'Exact Albato automation ID.' },
    { name: 'limit', type: 'int', required: false, default: 25, help: 'Maximum visible history rows to inspect (1-100).' },
  ],
  columns: ALBATO_COMMAND_FIELDS.diagnose,
  func: async (page, kwargs) => {
    const automationId = normalizeAutomationId(kwargs['automation-id'], { required: true });
    const limit = normalizeLimit(kwargs.limit);
    await gotoAlbato(page, `/app/bundle/history/${automationId}`, 'Albato diagnosis');
    const rows = (await readHistoryRows(page)).slice(0, limit).map((row) => ({ ...row, automationId }));
    return diagnoseHistoryRows(rows);
  },
});
