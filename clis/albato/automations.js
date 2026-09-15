import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS, normalizeAutomationId, normalizeLimit } from './_schema.js';
import { gotoAlbato, readAutomationCards, visibleAutomationRow } from './_ui.js';

export const automationsCommand = cli({
  site: 'albato',
  name: 'automations',
  access: 'read',
  description: 'List visible Albato automations with operational state only; never changes an automation.',
  example: 'opencli --profile <profile> albato automations --limit 25 -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  defaultWindowMode: 'foreground',
  navigateBefore: false,
  args: [
    { name: 'automation-id', type: 'string', required: false, help: 'Exact Albato automation ID to retain.' },
    { name: 'limit', type: 'int', required: false, default: 25, help: 'Maximum visible rows to return (1-100).' },
    { name: 'include-labels', type: 'boolean', required: false, default: false, help: 'Include broadly redacted visible labels. Disabled by default.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.automations,
  func: async (page, kwargs) => {
    const automationId = normalizeAutomationId(kwargs['automation-id']);
    const limit = normalizeLimit(kwargs.limit);
    const includeLabels = kwargs['include-labels'] === true;
    await gotoAlbato(page, '/app/bundle?lang=en', 'Albato automations');
    const cards = await readAutomationCards(page);
    return cards
      .filter((card) => !automationId || card.automationId === automationId)
      .slice(0, limit)
      .map((card) => visibleAutomationRow(card, { includeLabels }));
  },
});
