import { cli, Strategy } from '@jackwener/opencli/registry';
import { normalizeAutomationId, normalizeLimit, redactVisibleText, ALBATO_COMMAND_FIELDS } from './_schema.js';
import { gotoAlbato, readHistoryRows, visibleHistoryRow } from './_ui.js';

export const historyCommand = cli({
  site: 'albato',
  name: 'history',
  access: 'read',
  description: 'Read visible Albato run outcomes without exposing event payloads or retrying a run.',
  example: 'opencli --profile <profile> albato history --automation-id 385151 --limit 25 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'automation-id', type: 'string', required: false, help: 'Exact Albato automation ID. If omitted, reads global history across all automations.' },
    { name: 'limit', type: 'int', required: false, default: 25, help: 'Maximum visible rows to return (1-100).' },
    { name: 'include-labels', type: 'boolean', required: false, default: false, help: 'Include broadly redacted automation label text. Disabled by default.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.history,
  func: async (page, kwargs) => {
    const automationId = normalizeAutomationId(kwargs['automation-id'], { required: false });
    const limit = normalizeLimit(kwargs.limit);
    const includeLabels = kwargs['include-labels'] === true;
    const path = automationId ? `/app/bundle/history/${automationId}` : '/app/bundles/history';
    await gotoAlbato(page, path, 'Albato history');
    const title = (automationId && includeLabels)
      ? redactVisibleText(await page.evaluate('document.querySelector("h1")?.innerText || ""'))
      : '';
    return (await readHistoryRows(page))
      .slice(0, limit)
      .map((row) => visibleHistoryRow(row, automationId, title, { includeLabels }));
  },
});
