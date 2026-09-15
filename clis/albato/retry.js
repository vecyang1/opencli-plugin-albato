import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS, normalizeHistoryId } from './_schema.js';
import { retryHistoryItem } from './_ui.js';

export const retryCommand = cli({
  site: 'albato',
  name: 'retry',
  access: 'write',
  description: 'Retry a specific failed Albato history run with strict single-id scoping and readback verification.',
  example: 'opencli --profile <profile> albato retry --history-id 340526 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'history-id', type: 'string', required: true, help: 'Exact Albato history run ID to retry.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.retry,
  func: async (page, kwargs) => {
    const historyId = normalizeHistoryId(kwargs['history-id'], { required: true });
    const result = await retryHistoryItem(page, { historyId });
    return [result];
  },
});
