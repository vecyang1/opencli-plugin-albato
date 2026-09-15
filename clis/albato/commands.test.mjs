import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ALBATO_COMMAND_FIELDS,
  classifyHistoryStatus,
  diagnoseHistoryRows,
  historyStatusFromLines,
  isHistoryCandidate,
  normalizeAutomationId,
  normalizeHistoryId,
  normalizeLimit,
  redactVisibleText,
  visibleBundleRow,
  visibleConnectionRow,
  visibleHistoryRow,
  visibleRetryRow,
  visibleStateToggleRow,
} from './_schema.js';

const root = new URL('.', import.meta.url);

describe('private Albato OpenCLI adapter contract', () => {
  it('registers all 8 commands with explicit access levels and schema contracts', () => {
    const readCommands = ['automations.js', 'history.js', 'diagnose.js', 'bundle.js', 'connections.js'];
    for (const filename of readCommands) {
      const source = readFileSync(new URL(filename, root), 'utf8');
      assert.match(source, /access:\s*['"]read['"]/);
      assert.doesNotMatch(source, /access:\s*['"]write['"]/);
      assert.match(source, /strategy:\s*Strategy\.UI/);
      assert.match(source, /browser:\s*true/);
    }

    const writeCommands = ['pause.js', 'start.js', 'retry.js'];
    for (const filename of writeCommands) {
      const source = readFileSync(new URL(filename, root), 'utf8');
      assert.match(source, /access:\s*['"]write['"]/);
      assert.doesNotMatch(source, /access:\s*['"]read['"]/);
      assert.match(source, /strategy:\s*Strategy\.UI/);
      assert.match(source, /browser:\s*true/);
    }

    assert.deepEqual(ALBATO_COMMAND_FIELDS.automations, [
      'AutomationId', 'Name', 'Group', 'State', 'Trigger', 'Action', 'OperationsTotal', 'Operations24h',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.bundle, [
      'AutomationId', 'Name', 'Group', 'State', 'Canvas', 'StepsCount', 'Steps', 'BannerWarning',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.pause, [
      'AutomationId', 'Action', 'PreviousState', 'CurrentState', 'Success', 'VerifiedAt',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.start, [
      'AutomationId', 'Action', 'PreviousState', 'CurrentState', 'Success', 'VerifiedAt',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.history, [
      'RunId', 'AutomationId', 'OccurredAt', 'AutomationName', 'App', 'Result', 'Status',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.diagnose, [
      'AutomationId', 'ObservedAt', 'RunId', 'Status', 'ErrorClass', 'ErrorSummary', 'RepeatCount', 'Hint',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.retry, [
      'HistoryId', 'Status', 'Result', 'Retried', 'VerifiedAt',
    ]);
    assert.deepEqual(ALBATO_COMMAND_FIELDS.connections, [
      'App', 'ConnectionsCount', 'ActiveConnections', 'ErrorStatus', 'LastUpdated',
    ]);
  });

  it('normalizes bounded limits without silently accepting invalid input', () => {
    assert.equal(normalizeLimit(undefined), 25);
    assert.equal(normalizeLimit('5'), 5);
    assert.equal(normalizeLimit(1000), 500);
    assert.throws(() => normalizeLimit('zero'));
    assert.throws(() => normalizeLimit(0));
  });

  it('redacts visible personal identifiers and long free-form fragments', () => {
    const text = 'Event description from vy@example.test https://hooks.example.test/secret +84 912 345 678 token=hidden has a very long payload '.repeat(20);
    const redacted = redactVisibleText(text);
    assert.doesNotMatch(redacted, /vy@example\.test/);
    assert.doesNotMatch(redacted, /https:\/\//);
    assert.doesNotMatch(redacted, /\+84 912 345 678/);
    assert.doesNotMatch(redacted, /token=hidden/);
    assert.ok(redacted.length <= 240);
  });

  it('classifies only operational error surfaces and groups repeatable history failures', () => {
    assert.equal(classifyHistoryStatus({ app: 'Google Calendar', status: 'Error' }), 'source_error');
    assert.equal(classifyHistoryStatus({ app: 'Gmail', status: 'Error' }), 'destination_error');
    assert.equal(classifyHistoryStatus({ app: 'Google Calendar', status: 'Success' }), 'success');

    const diagnostics = diagnoseHistoryRows([
      { runId: '3', automationId: '385151', occurredAt: '2026-07-24 01:06', app: 'Google Calendar', status: 'Error' },
      { runId: '2', automationId: '385151', occurredAt: '2026-07-24 01:01', app: 'Google Calendar', status: 'Error' },
      { runId: '1', automationId: '385151', occurredAt: '2026-07-24 00:56', app: 'Gmail', status: 'Success' },
    ]);

    assert.deepEqual(diagnostics.map((row) => [row.ErrorClass, row.RepeatCount]), [
      ['source_error', 2],
      ['success', 1],
    ]);
    assert.doesNotMatch(JSON.stringify(diagnostics), /description|payload|calendarId|token/i);
  });

  it('keeps a visible Automation executed row as a successful history outcome', () => {
    const visibleRow = [
      '340526',
      '24.07.2026 01:06 AM',
      'Google Calendar',
      'Automation executed',
      'Error',
    ];
    assert.equal(historyStatusFromLines(visibleRow, visibleRow.join(' ')), 'Error');

    const successRow = [
      '340525',
      '24.07.2026 01:01 AM',
      'Gmail',
      'Automation executed',
    ];
    assert.equal(historyStatusFromLines(successRow, successRow.join(' ')), 'Success');
    assert.equal(classifyHistoryStatus({ app: 'Gmail', status: historyStatusFromLines(successRow, successRow.join(' ')) }), 'success');

    const failedRow = ['340524', '24.07.2026 12:56 AM', 'Google Calendar', 'Failed'];
    assert.equal(isHistoryCandidate(failedRow.join(' ')), true);
    assert.equal(historyStatusFromLines(failedRow, failedRow.join(' ')), 'Failed');
  });

  it('validates automationId and historyId with strict digit-only requirements', () => {
    assert.equal(normalizeAutomationId('387328'), '387328');
    assert.equal(normalizeAutomationId(undefined), undefined);
    assert.throws(() => normalizeAutomationId('', { required: true }), /automation-id is required/);
    assert.throws(() => normalizeAutomationId('abc387328'), /automation-id must contain only digits/);

    assert.equal(normalizeHistoryId('340526'), '340526');
    assert.equal(normalizeHistoryId(undefined), undefined);
    assert.throws(() => normalizeHistoryId('', { required: true }), /history-id is required/);
    assert.throws(() => normalizeHistoryId('run-123'), /history-id must contain only digits/);
  });

  it('formats visible bundle details with sanitized step pipeline and warning banner', () => {
    const rawBundle = {
      automationId: '387328',
      name: 'Sync Orders from user@example.com to https://crm.example.com/api?key=xyz',
      group: 'E-commerce Group',
      state: 'running',
      canvas: true,
      steps: ['1. Gmail: Email received', 'Filter: Subject matches order', '2. HTTP Request: POST to endpoint'],
      bannerWarning: 'This automation is running, editing is prohibited. To make changes, please pause the automation.',
    };

    const formatted = visibleBundleRow(rawBundle, { includeLabels: true });
    assert.equal(formatted.AutomationId, '387328');
    assert.doesNotMatch(formatted.Name, /user@example\.com/);
    assert.doesNotMatch(formatted.Name, /key=xyz/);
    assert.equal(formatted.State, 'running');
    assert.equal(formatted.Canvas, true);
    assert.equal(formatted.StepsCount, 3);
    assert.match(formatted.Steps, /1\. Gmail: Email received -> Filter/);
    assert.match(formatted.BannerWarning, /This automation is running/);

    const stripped = visibleBundleRow(rawBundle, { includeLabels: false });
    assert.equal(stripped.Name, '');
    assert.equal(stripped.Group, '');
    assert.equal(stripped.Steps, '');
    assert.equal(stripped.StepsCount, 3);
    assert.equal(stripped.State, 'running');
  });

  it('formats state toggle mutations (pause/start) with two-sided state verification', () => {
    const pauseResult = visibleStateToggleRow({
      automationId: '387328',
      action: 'pause',
      previousState: 'running',
      currentState: 'stopped',
      success: true,
      verifiedAt: '2026-09-15T10:00:00.000Z',
    });
    assert.equal(pauseResult.AutomationId, '387328');
    assert.equal(pauseResult.Action, 'pause');
    assert.equal(pauseResult.PreviousState, 'running');
    assert.equal(pauseResult.CurrentState, 'stopped');
    assert.equal(pauseResult.Success, true);

    const startResult = visibleStateToggleRow({
      automationId: '387328',
      action: 'start',
      previousState: 'stopped',
      currentState: 'running',
      success: true,
      verifiedAt: '2026-09-15T10:05:00.000Z',
    });
    assert.equal(startResult.Action, 'start');
    assert.equal(startResult.CurrentState, 'running');
    assert.equal(startResult.Success, true);
  });

  it('formats retry mutations with single-history-id scoping', () => {
    const retryRow = visibleRetryRow({
      historyId: '340526',
      status: 'Retried',
      result: 'Retry triggered successfully.',
      retried: true,
      verifiedAt: '2026-09-15T10:00:00.000Z',
    });
    assert.equal(retryRow.HistoryId, '340526');
    assert.equal(retryRow.Status, 'Retried');
    assert.equal(retryRow.Retried, true);
  });

  it('formats connected apps and redacts connection labels when requested', () => {
    const rawConnection = {
      app: 'Gmail',
      connectionsCount: 5,
      activeConnections: 'contact@example.com, support@example.org',
      errorStatus: 'none',
      lastUpdated: '2026-09-15',
    };

    const formattedWithoutLabels = visibleConnectionRow(rawConnection, { includeLabels: false });
    assert.equal(formattedWithoutLabels.App, 'Gmail');
    assert.equal(formattedWithoutLabels.ConnectionsCount, 5);
    assert.equal(formattedWithoutLabels.ActiveConnections, '');

    const formattedWithLabels = visibleConnectionRow(rawConnection, { includeLabels: true });
    assert.doesNotMatch(formattedWithLabels.ActiveConnections, /contact@example\.com/);
    assert.match(formattedWithLabels.ActiveConnections, /\[email-redacted\]/);
  });

  it('parses automation cards with multi-step badges without badge numbers corrupting trigger or action', () => {
    // Simulates line extraction where a 3-step or 5-step badge emits a standalone number
    const rawCardLines = [
      'Ins_2 → Slack_social WWW25.06.25',
      '3', // step count badge
      'Instagram for Business',
      'Media posted in my account created',
      'Slack',
      'Send message to a public channel',
      'Operations: 643 total / 48 in 24 hours',
      'Pause',
    ];
    const semanticLines = rawCardLines.filter((line) => !/^(Operations:|Pause$|Start$|Test$|Create new automation$|^\d+$)/i.test(line));
    assert.equal(semanticLines[0], 'Ins_2 → Slack_social WWW25.06.25');
    assert.equal(semanticLines[1], 'Instagram for Business');
    assert.equal(semanticLines[2], 'Media posted in my account created');
    assert.notEqual(semanticLines[1], '3', 'Step badge number must never leak as trigger');
  });

  it('correctly maps history rows with service logo images to typed apps and classifications', () => {
    const rawGlobalRow = {
      runId: '340526',
      automationId: '',
      occurredAt: '15.09.2026 12:10 PM',
      automationName: 'Ins_MKT → Gmail vi@ 25.03.28',
      app: 'Instagram',
      result: 'Automation executed',
      status: 'Error',
    };
    const row = visibleHistoryRow(rawGlobalRow, undefined, undefined, { includeLabels: true });
    assert.equal(row.RunId, '340526');
    assert.equal(row.App, 'Instagram');
    assert.equal(row.AutomationName, 'Ins_MKT → Gmail vi@ 25.03.28');
    assert.equal(row.Status, 'Error');
    assert.equal(classifyHistoryStatus({ app: row.App, status: row.Status }), 'source_error');
  });

  it('parses connected apps strings with trailing expansion chevrons or nested counts', () => {
    const textSample = 'Data Storage 1 v';
    const match = textSample.match(/^([A-Za-z0-9_\s.-]+?)\s+(\d+)(?:\s+.*)?$/);
    assert.ok(match);
    assert.equal(match[1].trim(), 'Data Storage');
    assert.equal(parseInt(match[2], 10), 1);
  });
});

