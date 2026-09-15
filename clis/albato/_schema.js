const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const SECRET_VALUE_PATTERN = /\b(token|api[_-]?key|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi;
const PHONE_PATTERN = /(?:\+\d[\d().\s-]{7,}\d|\b(?:phone|tel|mobile)\s*[:=]\s*\d[\d().\s-]{6,}\d)/gi;
const MAX_VISIBLE_TEXT = 240;
const MAX_LIMIT = 100;

export const ALBATO_COMMAND_FIELDS = Object.freeze({
  automations: [
    'AutomationId', 'Name', 'Group', 'State', 'Trigger', 'Action', 'OperationsTotal', 'Operations24h',
  ],
  bundle: [
    'AutomationId', 'Name', 'Group', 'State', 'Canvas', 'StepsCount', 'Steps', 'BannerWarning',
  ],
  pause: [
    'AutomationId', 'Action', 'PreviousState', 'CurrentState', 'Success', 'VerifiedAt',
  ],
  start: [
    'AutomationId', 'Action', 'PreviousState', 'CurrentState', 'Success', 'VerifiedAt',
  ],
  history: [
    'RunId', 'AutomationId', 'OccurredAt', 'AutomationName', 'App', 'Result', 'Status',
  ],
  diagnose: [
    'AutomationId', 'ObservedAt', 'RunId', 'Status', 'ErrorClass', 'ErrorSummary', 'RepeatCount', 'Hint',
  ],
  retry: [
    'HistoryId', 'Status', 'Result', 'Retried', 'VerifiedAt',
  ],
  connections: [
    'App', 'ConnectionsCount', 'ActiveConnections', 'ErrorStatus', 'LastUpdated',
  ],
});

export function normalizeLimit(value, fallback = 25) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new TypeError('limit must be a positive integer.');
  }
  return Math.min(numeric, MAX_LIMIT);
}

export function normalizeAutomationId(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new TypeError('automation-id is required.');
    return undefined;
  }
  const id = String(value).trim();
  if (!/^\d{1,20}$/.test(id)) {
    throw new TypeError('automation-id must contain only digits.');
  }
  return id;
}

export function redactVisibleText(value, maxLength = MAX_VISIBLE_TEXT) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  const scrubbed = normalized
    .replace(EMAIL_PATTERN, '[email-redacted]')
    .replace(SECRET_VALUE_PATTERN, '$1=[secret-redacted]')
    .replace(PHONE_PATTERN, '[phone-redacted]')
    .replace(URL_PATTERN, '[url-redacted]');
  return scrubbed.length > maxLength ? `${scrubbed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : scrubbed;
}

export function historyStatusFromLines(lines, text = '') {
  const explicitFailure = lines.find((line) => /^(Error|Failed)$/i.test(String(line).trim()));
  if (explicitFailure) return explicitFailure;
  const explicitSuccess = lines.find((line) => /^(Success|Automation executed)$/i.test(String(line).trim()));
  if (explicitSuccess) return 'Success';
  if (/\bError\b/i.test(text)) return 'Error';
  if (/\b(Success|Automation executed)\b/i.test(text)) return 'Success';
  return '';
}

export function isHistoryCandidate(text) {
  return /\b(Error|Success|Failed|Automation executed)\b/i.test(String(text ?? ''));
}

export function classifyHistoryStatus({ app, status }) {
  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'success' || normalizedStatus === 'completed' || normalizedStatus === 'automation executed') {
    return 'success';
  }
  if (normalizedStatus !== 'error' && normalizedStatus !== 'failed') return 'unknown';

  const normalizedApp = String(app ?? '').trim().toLowerCase();
  if (/gmail|email|slack|telegram|twilio|webhook/.test(normalizedApp)) return 'destination_error';
  if (normalizedApp) return 'source_error';
  return 'unknown_error';
}

function diagnosticCopy(errorClass) {
  switch (errorClass) {
    case 'source_error':
      return {
        summary: 'The source application reported an error.',
        hint: 'Check the source connection access and the matching Albato history row; do not resend historical runs.',
      };
    case 'destination_error':
      return {
        summary: 'The destination application reported an error.',
        hint: 'Check the destination connection and recipient mapping before retrying a new controlled event.',
      };
    case 'success':
      return {
        summary: 'The visible history row reports success.',
        hint: 'This is not recipient-delivery proof; verify the intended destination independently.',
      };
    default:
      return {
        summary: 'The visible history row has an unclassified operational status.',
        hint: 'Inspect the matching Albato history row manually before taking any action.',
      };
  }
}

export function diagnoseHistoryRows(rows) {
  const normalized = rows.map((row) => ({
    ...row,
    errorClass: classifyHistoryStatus(row),
  }));
  const counts = new Map();
  for (const row of normalized) {
    const key = `${row.automationId ?? ''}:${row.errorClass}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const emitted = new Set();
  return normalized.flatMap((row) => {
    const key = `${row.automationId ?? ''}:${row.errorClass}`;
    if (emitted.has(key)) return [];
    emitted.add(key);
    const copy = diagnosticCopy(row.errorClass);
    return [{
      AutomationId: row.automationId ?? '',
      ObservedAt: row.occurredAt ?? '',
      RunId: row.runId ?? '',
      Status: row.status ?? '',
      ErrorClass: row.errorClass,
      ErrorSummary: copy.summary,
      RepeatCount: counts.get(key),
      Hint: copy.hint,
    }];
  });
}

export function normalizeHistoryId(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new TypeError('history-id is required.');
    return undefined;
  }
  const id = String(value).trim();
  if (!/^\d{1,20}$/.test(id)) {
    throw new TypeError('history-id must contain only digits.');
  }
  return id;
}

export function visibleHistoryRow(row, automationId, automationName = '', { includeLabels = false } = {}) {
  return {
    RunId: String(row.runId ?? row.RunId ?? ''),
    AutomationId: String(automationId ?? row.automationId ?? row.AutomationId ?? ''),
    OccurredAt: redactVisibleText(row.occurredAt ?? row.OccurredAt ?? ''),
    AutomationName: includeLabels ? redactVisibleText(automationName || row.automationName || row.AutomationName || '') : '',
    App: String(row.app ?? row.App ?? ''),
    Result: redactVisibleText(row.result ?? row.Result ?? ''),
    Status: redactVisibleText(row.status ?? row.Status ?? ''),
  };
}

export function visibleBundleRow(raw, { includeLabels = true } = {}) {
  return {
    AutomationId: String(raw.automationId ?? raw.AutomationId ?? ''),
    Name: includeLabels ? redactVisibleText(raw.name ?? raw.Name ?? '') : '',
    Group: includeLabels ? redactVisibleText(raw.group ?? raw.Group ?? '') : '',
    State: String(raw.state ?? raw.State ?? 'unknown'),
    Canvas: Boolean(raw.canvas ?? raw.Canvas),
    StepsCount: Number(raw.stepsCount ?? raw.StepsCount ?? (Array.isArray(raw.steps) ? raw.steps.length : 0)),
    Steps: includeLabels ? redactVisibleText(Array.isArray(raw.steps) ? raw.steps.join(' -> ') : (raw.Steps ?? '')) : '',
    BannerWarning: redactVisibleText(raw.bannerWarning ?? raw.BannerWarning ?? ''),
  };
}

export function visibleStateToggleRow(raw) {
  return {
    AutomationId: String(raw.automationId ?? raw.AutomationId ?? ''),
    Action: String(raw.action ?? raw.Action ?? ''),
    PreviousState: String(raw.previousState ?? raw.PreviousState ?? 'unknown'),
    CurrentState: String(raw.currentState ?? raw.CurrentState ?? 'unknown'),
    Success: Boolean(raw.success ?? raw.Success),
    VerifiedAt: String(raw.verifiedAt ?? raw.VerifiedAt ?? new Date().toISOString()),
  };
}

export function visibleRetryRow(raw) {
  return {
    HistoryId: String(raw.historyId ?? raw.HistoryId ?? ''),
    Status: String(raw.status ?? raw.Status ?? 'unknown'),
    Result: redactVisibleText(raw.result ?? raw.Result ?? ''),
    Retried: Boolean(raw.retried ?? raw.Retried),
    VerifiedAt: String(raw.verifiedAt ?? raw.VerifiedAt ?? new Date().toISOString()),
  };
}

export function visibleConnectionRow(raw, { includeLabels = false } = {}) {
  return {
    App: redactVisibleText(raw.app ?? raw.App ?? ''),
    ConnectionsCount: Number(raw.connectionsCount ?? raw.ConnectionsCount ?? 0),
    ActiveConnections: includeLabels ? redactVisibleText(raw.activeConnections ?? raw.ActiveConnections ?? '') : '',
    ErrorStatus: redactVisibleText(raw.errorStatus ?? raw.ErrorStatus ?? 'none'),
    LastUpdated: String(raw.lastUpdated ?? raw.LastUpdated ?? ''),
  };
}
