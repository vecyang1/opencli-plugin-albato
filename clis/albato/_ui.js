import { CommandExecutionError } from '@jackwener/opencli/errors';
import {
  historyStatusFromLines,
  isHistoryCandidate,
  redactVisibleText,
  visibleBundleRow,
  visibleStateToggleRow,
  visibleRetryRow,
  visibleConnectionRow,
  visibleHistoryRow,
} from './_schema.js';

export { visibleHistoryRow };

export const ALBATO_ORIGIN = 'https://albato.com';

function unwrapBridgePayload(payload) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && 'session' in payload && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

function ensureArray(payload, label) {
  const value = unwrapBridgePayload(payload);
  if (!Array.isArray(value)) throw new CommandExecutionError(`${label} returned malformed visible browser data.`);
  return value;
}

function ensureObject(payload, label) {
  const value = unwrapBridgePayload(payload);
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new CommandExecutionError(`${label} returned malformed visible browser data.`);
  }
  return value;
}

export async function waitForElement(page, selector, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const found = await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (found) return true;
    } catch {}
    if (typeof page?.sleep === 'function') {
      await page.sleep(0.3);
    } else if (typeof page?.wait === 'function') {
      await page.wait(0.3);
    } else {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

export async function gotoAlbato(page, path, label) {
  if (!page || typeof page.goto !== 'function' || typeof page.evaluate !== 'function') {
    throw new CommandExecutionError(`${label} requires an OpenCLI Browser Bridge page with navigation and visible-DOM access.`);
  }
  const currentUrl = String(await page.evaluate('location.href').catch(() => ''));
  const targetRoute = path.split('?')[0];
  const targetUrl = `${ALBATO_ORIGIN}${path}`;

  // If the browser is already on the exact requested pathname, avoid reloading
  let alreadyOnRoute = false;
  try {
    const currentParsed = new URL(currentUrl);
    const targetParsed = new URL(targetUrl);
    alreadyOnRoute = (currentParsed.pathname === targetParsed.pathname) && !currentUrl.includes('about:blank');
  } catch {
    alreadyOnRoute = false;
  }
  if (!alreadyOnRoute) {
    await page.goto(targetUrl, { waitUntil: 'none' });
    if (typeof page?.sleep === 'function') {
      await page.sleep(1.5);
    } else if (typeof page?.wait === 'function') {
      await page.wait(1.5);
    } else {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const state = ensureObject(await page.evaluate(`(() => ({
    title: document.title || '',
    text: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 800)
  }))()`), label);
  if (/log in|sign in|create account/i.test(`${state.title} ${state.text}`)) {
    throw new CommandExecutionError('Albato is not signed in in the selected Browser Bridge profile. Sign in normally, then retry.');
  }
}

export async function readAutomationCards(page) {
  await waitForElement(page, 'a[href*="/app/bundle/edit/"], .al-bundle-card_view_base, .al-bundle-card', 8000);

  return ensureArray(await page.evaluate(`(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const cards = [];
    const seen = new Set();

    const idRegex = new RegExp('/app/bundle/(?:edit|history)/(\\\\d+)');
    const digitsRegex = new RegExp('\\\\b\\\\d{4,}\\\\b');
    const pauseRegex = new RegExp('\\\\bPause\\\\b', 'i');
    const startRegex = new RegExp('\\\\bStart\\\\b', 'i');
    const opsRegex = new RegExp('Operations:\\\\s*(\\\\d+)\\\\s+total\\\\s*\\\\/\\\\s*(\\\\d+)\\\\s+in\\\\s+24\\\\s+hours', 'i');

    const cardNodes = Array.from(document.querySelectorAll('.al-bundle-card.al-bundle-card_view_base, .al-bundle-card:not(.al-bundle-card_view_empty)'));
    for (const card of cardNodes) {
      let automationId = '';
      const editLink = card.querySelector('a[href*="/app/bundle/edit/"], a[href*="/app/bundle/history/"]');
      if (editLink) {
        const href = editLink.getAttribute('href') || '';
        const match = href.match(idRegex);
        if (match) automationId = match[1];
      }
      if (!automationId) {
        const idInput = card.querySelector('input[type="checkbox"], .al-checkbox__real, label.al-checkbox__label');
        const rawId = idInput?.id || idInput?.name || idInput?.getAttribute('for') || '';
        const match = rawId.match(digitsRegex);
        if (match) automationId = match[0];
      }
      if (!automationId || seen.has(automationId)) continue;
      seen.add(automationId);

      const titleEl = card.querySelector('.al-bundle-card-header__title, [class*="header__title"], h2, h3');
      const name = clean(titleEl?.getAttribute('title') || titleEl?.innerText || '');

      const cardText = clean(card.innerText || '');
      const controls = card.querySelector('.al-bundle-card__controls');
      const controlText = clean(controls?.innerText || cardText);
      let state = 'unknown';
      if (pauseRegex.test(controlText)) {
        state = 'running';
      } else if (startRegex.test(controlText)) {
        state = 'stopped';
      }

      const steps = Array.from(card.querySelectorAll('ul.al-bundle-card-steps__list > li.al-bundle-card-steps__step, .al-bundle-card-steps__step'));
      let trigger = '';
      let action = '';
      if (steps.length > 0) {
        const tApp = steps[0].querySelector('div:first-child .al-tooltip__inner[title]')?.getAttribute('title') || '';
        const tEvt = steps[0].querySelector('.al-bundle-card-steps__text [title]')?.getAttribute('title') || steps[0].querySelector('.al-bundle-card-steps__text')?.innerText || '';
        trigger = clean(tEvt || tApp);
      }
      if (steps.length > 1) {
        const aApp = steps[1].querySelector('div:first-child .al-tooltip__inner[title]')?.getAttribute('title') || '';
        const aEvt = steps[1].querySelector('.al-bundle-card-steps__text [title]')?.getAttribute('title') || steps[1].querySelector('.al-bundle-card-steps__text')?.innerText || '';
        action = clean(aEvt || aApp);
      }

      const opsEl = card.querySelector('.al-bundle-card__meta');
      const opsText = clean(opsEl?.innerText || cardText);
      const opsMatch = opsText.match(opsRegex);
      const operationsTotal = opsMatch ? opsMatch[1] : '0';
      const operations24h = opsMatch ? opsMatch[2] : '0';

      cards.push({
        automationId,
        name,
        state,
        trigger,
        action,
        operationsTotal,
        operations24h,
      });
    }

    if (cards.length === 0) {
      for (const link of Array.from(document.querySelectorAll('a[href*="/app/bundle/edit/"]'))) {
        const match = (link.getAttribute('href') || '').match(idRegex);
        if (!match || seen.has(match[1])) continue;
        let card = link;
        while (card.parentElement && !opsRegex.test(card.innerText || '')) card = card.parentElement;
        const lines = String(card.innerText || '').split('\\n').map(clean).filter(Boolean);
        if (!lines.length) continue;
        seen.add(match[1]);
        const text = clean(card.innerText);
        const ops = text.match(opsRegex);
        const semanticLines = lines.filter((line) => !/^(Operations:|Pause$|Start$|Test$|Create new automation$|^\\d+$)/i.test(line));
        cards.push({
          automationId: match[1],
          name: semanticLines[0] || '',
          state: pauseRegex.test(text) ? 'running' : (startRegex.test(text) ? 'stopped' : 'unknown'),
          trigger: semanticLines[1] || '',
          action: semanticLines[2] || '',
          operationsTotal: ops?.[1] || '',
          operations24h: ops?.[2] || '',
        });
      }
    }

    return cards;
  })()`), 'Albato automations');
}

export async function readHistoryRows(page) {
  await waitForElement(page, '.al-bundle-history-table__row_type_event-head, .al-bundle-history-table__row_all-bundles-page', 10000);

  return ensureArray(await page.evaluate(`(() => {
    const historyStatusFromLines = ${historyStatusFromLines.toString()};
    const isHistoryCandidate = ${isHistoryCandidate.toString()};
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const rows = [];
    const seen = new Set();

    const tableRows = Array.from(document.querySelectorAll('.al-bundle-history-table__row_type_event-head, .al-bundle-history-table__row_all-bundles-page:not(.al-bundle-history-table__row_type_table-head):not(.al-bundle-history-table__row_step-position_head)'));
    for (const tr of tableRows) {
      const idCell = tr.querySelector('.al-bundle-history-table__cell_type_id');
      const nameCell = tr.querySelector('.al-bundle-history-table__cell_type_name');
      const dateCell = tr.querySelector('.al-bundle-history-table__cell_type_date');
      const serviceCell = tr.querySelector('.al-bundle-history-table__cell_type_service');
      const resultCell = tr.querySelector('.al-bundle-history-table__cell_type_result');
      const statusCell = tr.querySelector('.al-bundle-history-table__cell_type_status');

      const automationId = clean(idCell?.innerText || '');
      const runId = automationId;
      const automationName = clean(nameCell?.getAttribute('title') || nameCell?.innerText || '');
      const occurredAt = clean(dateCell?.innerText || '');

      let app = '';
      const img = serviceCell?.querySelector('img');
      if (img) {
        const rawAlt = img.getAttribute('alt') || img.getAttribute('title') || '';
        if (/gmail/i.test(rawAlt)) app = 'Gmail';
        else if (/instagram/i.test(rawAlt)) app = 'Instagram';
        else if (/slack/i.test(rawAlt)) app = 'Slack';
        else if (/telegram/i.test(rawAlt)) app = 'Telegram';
        else if (/notion/i.test(rawAlt)) app = 'Notion';
        else if (/webhook/i.test(rawAlt)) app = 'Webhook';
        else if (/form/i.test(rawAlt)) app = 'Google Forms';
        else if (/sheet/i.test(rawAlt)) app = 'Google Sheets';
        else if (/calendar/i.test(rawAlt)) app = 'Google Calendar';
        else app = rawAlt;
      }
      if (!app) {
        const sText = clean(serviceCell?.innerText || '');
        if (/Google Calendar/i.test(sText)) app = 'Google Calendar';
        else if (/Gmail/i.test(sText)) app = 'Gmail';
        else if (/Slack/i.test(sText)) app = 'Slack';
        else if (/Telegram/i.test(sText)) app = 'Telegram';
        else if (/Notion/i.test(sText)) app = 'Notion';
        else if (/Webhook/i.test(sText)) app = 'Webhook';
      }

      const result = clean(resultCell?.innerText || (/Automation executed/i.test(tr.innerText) ? 'Automation executed' : ''));
      let status = clean(statusCell?.innerText || '');
      if (!status) {
        status = /\\bError\\b/i.test(tr.innerText) ? 'Error' : (/\\bSuccess\\b/i.test(tr.innerText) ? 'Success' : '');
      }

      const key = [runId, occurredAt, app, status, automationName].join('|');
      if (occurredAt && status && !seen.has(key)) {
        seen.add(key);
        rows.push({ runId, automationId, occurredAt, app, result, status, automationName });
      }
    }

    if (rows.length === 0) {
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const candidates = new Set();
      for (const node of Array.from(document.querySelectorAll('body *')).filter(visible)) {
        const text = clean(node.innerText);
        if (!isHistoryCandidate(text) || text.length > 1000) continue;
        const lines = String(node.innerText || '').split('\\n').map(clean).filter(Boolean);
        if (lines.length >= 3 && lines.length <= 16) candidates.add(node);
      }
      for (const node of candidates) {
        const text = clean(node.innerText);
        const lines = String(node.innerText || '').split('\\n').map(clean).filter(Boolean);
        const runId = lines.find((line) => /^\\d{4,}$/.test(line)) || '';
        const occurredAt = lines.find((line) => /\\d{2}\\.\\d{2}\\.\\d{4}|\\d{4}-\\d{2}-\\d{2}/.test(line)) || '';
        const status = historyStatusFromLines(lines, text);
        const appText = lines.find((line) => /Google Calendar|Gmail|Slack|Telegram|Webhook|Email|Notion|Instagram/i.test(line)) || '';
        const app = /Google Calendar/i.test(appText) ? 'Google Calendar'
          : (/Gmail/i.test(appText) ? 'Gmail'
            : (/Slack/i.test(appText) ? 'Slack'
              : (/Telegram/i.test(appText) ? 'Telegram'
                : (/Notion/i.test(appText) ? 'Notion'
                  : (/Instagram/i.test(appText) ? 'Instagram'
                    : (/Webhook/i.test(appText) ? 'Webhook' : (/Email/i.test(appText) ? 'Email' : '')))))));
        const result = /Automation executed/i.test(text) ? 'Automation executed' : '';
        const key = [runId, occurredAt, app, status].join('|');
        if (!runId || !status || seen.has(key)) continue;
        seen.add(key);
        rows.push({ runId, occurredAt, app, result, status });
      }
    }

    return rows;
  })()`), 'Albato history');
}

export function visibleAutomationRow(card, { includeLabels = false } = {}) {
  return {
    AutomationId: card.automationId,
    Name: includeLabels ? redactVisibleText(card.name) : '',
    Group: '',
    State: card.state,
    Trigger: includeLabels ? redactVisibleText(card.trigger) : '',
    Action: includeLabels ? redactVisibleText(card.action) : '',
    OperationsTotal: card.operationsTotal,
    Operations24h: card.operations24h,
  };
}

export async function readBundleDetails(page, { automationId, includeLabels = true } = {}) {
  await gotoAlbato(page, `/app/bundle/edit/${automationId}`, 'Albato bundle builder');
  await waitForElement(page, '.al-bundle-editor, .react-flow__nodes, .al-step-card-wrapper-pro-mode, [class*="step"], [class*="bundle"]', 4000);

  const raw = ensureObject(await page.evaluate(`(() => {
    const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim();
    const bodyText = clean(document.body?.innerText || '');
    
    // Automation Name / Breadcrumb
    const headerEl = document.querySelector('.al-bundle-editor__col_header, [class*="col_header"]');
    const headerText = clean(headerEl?.innerText || '');
    const nameMatch = headerText.split(/\\s+ID:\\s*|\\s+Group:\\s*/)[0].replace(/^(?:Automations\\s+)?(?:Canvas\\s+)?/i, '').trim();
    const h1 = clean(document.querySelector('h1')?.innerText || '');
    const title = clean(document.title || '');
    const name = nameMatch || h1 || title;
    
    // Group
    const groupMatch = headerText.match(/Group:\\s*([^\\n]+)/) || bodyText.match(/(?:Group|Folder):\\s*([^\\n]+)/i);
    const group = groupMatch ? clean(groupMatch[1]).split(/\\s+This automation|\\s+Automation timing/)[0].trim() : '';

    // State determination
    let state = 'unknown';
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const pauseBtn = buttons.find(b => /\\bPause\\b/i.test(clean(b.innerText)));
    const startBtn = buttons.find(b => /\\bStart\\b/i.test(clean(b.innerText)));
    if (pauseBtn) {
      state = 'running';
    } else if (startBtn) {
      state = 'stopped';
    } else if (/\\bThis automation is running\\b/i.test(bodyText)) {
      state = 'running';
    } else if (/\\bThis automation is stopped|paused\\b/i.test(bodyText)) {
      state = 'stopped';
    }

    // Canvas toggle
    const canvasToggle = document.querySelector('.al-toggle__input') || Array.from(document.querySelectorAll('input[type="checkbox"], [role="switch"], button')).find(el => {
      const parent = el.closest('div.flex, div, label, span') || el;
      return /\\bCanvas\\b/i.test(clean(parent.parentElement?.innerText || parent.innerText));
    });
    const canvas = canvasToggle ? (canvasToggle.checked ?? /active|checked|true/i.test(canvasToggle.getAttribute('aria-checked') || canvasToggle.className || '')) : false;

    // Warning Banner
    let bannerWarning = '';
    const banners = Array.from(document.querySelectorAll('[class*="alert"], [class*="warning"], [class*="banner"], [class*="notice"]'));
    for (const b of banners) {
      const txt = clean(b.innerText);
      if (/running|prohibited|pause|stopped|warning/i.test(txt) && txt.length > 5 && txt.length < 300) {
        bannerWarning = txt;
        break;
      }
    }
    if (!bannerWarning && /This automation is running[^.]*\\./i.test(bodyText)) {
      const m = bodyText.match(/(This automation is running[^.]*\\.)/i);
      if (m) bannerWarning = m[1];
    }

    // Steps
    const stepOrderLabels = Array.from(document.querySelectorAll('.wl-step-order-label')).map(el => clean(el.innerText)).filter(Boolean);
    let steps = [];
    if (stepOrderLabels.length > 0) {
      steps = stepOrderLabels;
    } else {
      const stepElements = Array.from(document.querySelectorAll('.react-flow__node, .al-step-card-wrapper-pro-mode, [class*="step-card"], [class*="node-step"]'))
        .concat(Array.from(document.querySelectorAll('[class*="step"], [class*="node"], [class*="block"], [class*="card"]')))
        .filter(el => {
          const txt = clean(el.innerText);
          return /^\\d+\\.\\s*[A-Za-z]|(?:Gmail|Google|Webhook|Filter|Router|HTTP|Telegram|Slack|Email):/i.test(txt) && txt.length < 150;
        });
      if (stepElements.length > 0) {
        const seen = new Set();
        for (const el of stepElements) {
          const t = clean(el.innerText);
          if (!seen.has(t)) {
            seen.add(t);
            steps.push(t);
          }
        }
      } else {
        const stepMatches = bodyText.match(/\\d+\\.\\s*([A-Za-z0-9_\\s]+:[^\\n]+)/g);
        if (stepMatches) {
          steps = stepMatches.map(clean);
        }
      }
    }

    return {
      automationId: '${automationId}',
      name,
      group,
      state,
      canvas: Boolean(canvas),
      stepsCount: steps.length,
      steps,
      bannerWarning,
    };
  })()`), 'Albato bundle details');

  return visibleBundleRow(raw, { includeLabels });
}

export async function toggleAutomationState(page, { automationId, action }) {
  if (action !== 'pause' && action !== 'start') {
    throw new CommandExecutionError(`Invalid action "${action}". Must be "pause" or "start".`);
  }
  await gotoAlbato(page, `/app/bundle/edit/${automationId}`, `Albato ${action} automation`);
  await waitForElement(page, 'button, [role="button"], .al-button', 4000);

  const result = ensureObject(await page.evaluate(`(async () => {
    const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim();
    const targetAction = '${action}';
    
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const pauseBtn = buttons.find(b => /\\bPause\\b/i.test(clean(b.innerText)));
    const startBtn = buttons.find(b => /\\bStart\\b/i.test(clean(b.innerText)));
    
    let previousState = pauseBtn ? 'running' : (startBtn ? 'stopped' : 'unknown');
    
    if (targetAction === 'pause') {
      if (previousState === 'stopped') {
        return {
          automationId: '${automationId}',
          action: 'pause',
          previousState: 'stopped',
          currentState: 'stopped',
          success: true,
          verifiedAt: new Date().toISOString(),
        };
      }
      if (!pauseBtn) {
        throw new Error('Pause button not found on automation edit page.');
      }
      pauseBtn.click();
    } else if (targetAction === 'start') {
      if (previousState === 'running') {
        return {
          automationId: '${automationId}',
          action: 'start',
          previousState: 'running',
          currentState: 'running',
          success: true,
          verifiedAt: new Date().toISOString(),
        };
      }
      if (!startBtn) {
        throw new Error('Start button not found on automation edit page.');
      }
      startBtn.click();
    }

    await new Promise(r => setTimeout(r, 800));
    const modalButtons = Array.from(document.querySelectorAll('[role="dialog"] button, .modal button, [class*="modal"] button, [class*="dialog"] button'));
    const confirmBtn = modalButtons.find(b => /^(Yes|Confirm|Pause|Start|OK)$/i.test(clean(b.innerText)));
    if (confirmBtn) {
      confirmBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }

    await new Promise(r => setTimeout(r, 1200));
    const refreshedButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const newPauseBtn = refreshedButtons.find(b => /\\bPause\\b/i.test(clean(b.innerText)));
    const newStartBtn = refreshedButtons.find(b => /\\bStart\\b/i.test(clean(b.innerText)));
    const currentState = newPauseBtn ? 'running' : (newStartBtn ? 'stopped' : 'unknown');

    const expectedState = targetAction === 'pause' ? 'stopped' : 'running';
    const success = currentState === expectedState;

    return {
      automationId: '${automationId}',
      action: targetAction,
      previousState,
      currentState,
      success,
      verifiedAt: new Date().toISOString(),
    };
  })()`), `Albato toggle automation state`);

  return visibleStateToggleRow(result);
}

export async function retryHistoryItem(page, { historyId }) {
  await gotoAlbato(page, '/app/bundles/history', 'Albato history retry');
  await waitForElement(page, '.al-bundle-history-table__row, [class*="history-item"], table, tr', 4000);

  const result = ensureObject(await page.evaluate(`(async () => {
    const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim();
    const targetId = '${historyId}';

    const rows = Array.from(document.querySelectorAll('tr, [role="row"], [class*="table-row"], [class*="history-item"], .al-bundle-history-table__row'));
    let targetRow = rows.find(r => clean(r.innerText).includes(targetId));

    if (!targetRow) {
      const candidates = Array.from(document.querySelectorAll('body *')).filter(el => {
        const txt = clean(el.innerText);
        return txt.includes(targetId) && (txt.includes('Error') || txt.includes('Failed') || txt.includes('executed'));
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => (a.innerText.length || 0) - (b.innerText.length || 0));
        targetRow = candidates[0];
      }
    }

    if (!targetRow) {
      throw new Error('History row with ID ' + targetId + ' was not found on visible history page.');
    }

    const rowText = clean(targetRow.innerText);
    const isError = /Error|Failed/i.test(rowText);
    if (!isError && /Automation executed|Success/i.test(rowText)) {
      return {
        historyId: targetId,
        status: 'Success',
        result: 'Row is already successful; retry skipped.',
        retried: false,
        verifiedAt: new Date().toISOString(),
      };
    }

    const retryBtn = Array.from(targetRow.querySelectorAll('button, a, [role="button"], svg, [class*="retry"], [class*="refresh"], [class*="reload"], [class*="resend"]'))
      .find(el => {
        const title = el.getAttribute('title') || el.getAttribute('aria-label') || clean(el.innerText);
        const cls = el.className?.baseVal || el.className || '';
        return /retry|resend|reload|refresh|repeat/i.test(title + ' ' + cls) || el.tagName.toLowerCase() === 'svg' || el.querySelector('svg');
      });

    if (!retryBtn) {
      throw new Error('Retry button not found for history item ' + targetId);
    }

    const clickTarget = retryBtn.closest('button, a, [role="button"]') || retryBtn;
    clickTarget.click();

    await new Promise(r => setTimeout(r, 600));
    const modalButtons = Array.from(document.querySelectorAll('[role="dialog"] button, .modal button, [class*="modal"] button'));
    const confirmBtn = modalButtons.find(b => /^(Yes|Confirm|Retry|Resend|OK)$/i.test(clean(b.innerText)));
    if (confirmBtn) {
      confirmBtn.click();
    }

    await new Promise(r => setTimeout(r, 1200));

    return {
      historyId: targetId,
      status: 'Retried',
      result: 'Retry triggered successfully.',
      retried: true,
      verifiedAt: new Date().toISOString(),
    };
  })()`), 'Albato history retry');

  return visibleRetryRow(result);
}

export async function readConnectedApps(page, { includeLabels = false } = {}) {
  await gotoAlbato(page, '/app/settings', 'Albato connected apps');
  await waitForElement(page, 'a[href*="/app/settings/"], [class*="sidebar"], [class*="app-item"], nav li', 4000);

  const rawApps = ensureArray(await page.evaluate(`(() => {
    const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const apps = [];
    const seen = new Set();

    const items = Array.from(document.querySelectorAll('a[href*="/app/settings/"], [class*="menu-item"], [class*="sidebar"] li, [class*="app-item"], nav li, [class*="service-item"]')).filter(visible);
    
    for (const item of items) {
      const text = clean(item.innerText);
      if (!text || text.length > 80) continue;
      const match = text.match(/^([A-Za-z0-9_\\s.-]+?)\\s+(\\d+)(?:\\s+.*)?$/);
      if (match) {
        const appName = match[1].trim();
        const count = parseInt(match[2], 10);
        if (!seen.has(appName) && !/^(all|total|apps)$/i.test(appName)) {
          seen.add(appName);
          apps.push({
            app: appName,
            connectionsCount: count,
            activeConnections: '',
            errorStatus: 'none',
            lastUpdated: new Date().toISOString().slice(0, 10),
          });
        }
      }
    }

    if (apps.length === 0) {
      const allText = clean(document.body?.innerText || '');
      const genericMatches = Array.from(allText.matchAll(/\\b(Data Storage|Asana|Brevo|Gmail|Google Forms|Slack|Telegram|Webhook|Email|OpenAI|Trello|HubSpot|Notion)\\s+(\\d+)\\b/gi));
      for (const m of genericMatches) {
        const appName = m[1];
        const count = parseInt(m[2], 10);
        if (!seen.has(appName)) {
          seen.add(appName);
          apps.push({
            app: appName,
            connectionsCount: count,
            activeConnections: '',
            errorStatus: 'none',
            lastUpdated: new Date().toISOString().slice(0, 10),
          });
        }
      }
    }

    return apps;
  })()`), 'Albato connected apps');

  return rawApps.map(row => visibleConnectionRow(row, { includeLabels }));
}

export {
  visibleBundleRow,
  visibleStateToggleRow,
  visibleRetryRow,
  visibleConnectionRow,
};
