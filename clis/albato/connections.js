import { cli, Strategy } from '@jackwener/opencli/registry';
import { ALBATO_COMMAND_FIELDS } from './_schema.js';
import { readConnectedApps } from './_ui.js';

export const connectionsCommand = cli({
  site: 'albato',
  name: 'connections',
  access: 'read',
  description: 'List connected apps, account counts, and operational health status on Albato.',
  example: 'opencli --profile <profile> albato connections -f json',
  domain: 'albato.com',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  navigateBefore: false,
  args: [
    { name: 'include-labels', type: 'boolean', required: false, default: false, help: 'Include visible connected account labels. Disabled by default.' },
  ],
  columns: ALBATO_COMMAND_FIELDS.connections,
  func: async (page, kwargs) => {
    const includeLabels = kwargs['include-labels'] === true;
    return await readConnectedApps(page, { includeLabels });
  },
});
