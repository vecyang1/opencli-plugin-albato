# opencli-plugin-albato

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![OpenCLI](https://img.shields.io/badge/OpenCLI->=1.8.6-black.svg)](https://github.com/jackwener/opencli)
[![Node.js](https://img.shields.io/badge/Node.js->=22.5.0-green.svg)](https://nodejs.org/)

Production-grade [Albato](https://albato.com) automation lifecycle adapter for [OpenCLI](https://github.com/jackwener/opencli). Enables agentic inspection, step-by-step pipeline parsing, two-sided state verification (`pause`/`start`), deadloop retry storm diagnosis, targeted historical retry, and connected apps auditing.

---

## The Golden Boundary Principle

> **Core Invariant**: *If an automation flow is executing reliably on Albato, DO NOT refactor it.*

Albato provides long-term persistent OAuth authorizations (e.g. 1-year Gmail/Outlook/Sheets tokens) without the 7-day token expiration and Google Cloud Console review overhead of self-hosted apps. Use Albato as an **Authenticated Edge Ingress**, and forward events via Outgoing Webhook into downstream core orchestrators (such as self-hosted n8n). Only refactor deadloops, credential expirations, or empty skeleton drafts.

---

## Command Matrix (8 Standard Commands)

| Command | Access Level | Target Endpoint | Description |
| :--- | :--- | :--- | :--- |
| `opencli albato automations` | `read` | `/app/bundle?lang=en` | Lists automation cards with ID, name, status, trigger/action, and 24h/total usage. |
| `opencli albato bundle` | `read` | `/app/bundle/edit/:id` | Deep inspection of builder pipeline steps, Canvas mode, and running protection banners. |
| `opencli albato pause` | `write` | `/app/bundle/edit/:id` | Pauses running automation with **two-sided live DOM readback verification**. |
| `opencli albato start` | `write` | `/app/bundle/edit/:id` | Starts stopped automation with **two-sided live DOM readback verification**. |
| `opencli albato history` | `read` | `/app/bundles/history` | Structured history runs with service logo extraction and success/failure status. |
| `opencli albato diagnose` | `read` | `/app/bundles/history` | Clusters repeating failure classes (`source_error`, `destination_error`) with repair hints. |
| `opencli albato retry` | `write` | `/app/bundles/history` | Precision retry of a failed execution by `--history-id`. |
| `opencli albato connections` | `read` | `/app/settings` | Connected applications, account quantities, and health checks with privacy redaction. |

---

## Safety & Security Invariants

1. **Strict Single-ID Scoping**: Mutations (`pause`, `start`, `retry`) mandate explicit, numeric `--automation-id` or `--history-id`. Bulk state changes and wildcard replays are strictly prohibited.
2. **Two-Sided State Verification**: `pause` and `start` actions click the console trigger, then wait and re-read the live DOM to verify state transition (`running` ↔ `stopped`) before reporting success.
3. **Data Redaction & Sanitization**: All outputs automatically scrub visible personal email addresses, authorization tokens, phone numbers, and webhook secrets.

---

## Installation & Usage

### 1. Install to OpenCLI
```bash
git clone https://github.com/vecyang1/opencli-plugin-albato.git
cd opencli-plugin-albato
npm run install-adapters
```

### 2. Run Commands
```bash
# List all automations
opencli albato automations --limit 20

# Inspect a specific bundle pipeline
opencli albato bundle --automation-id 387328

# Diagnose repeating errors
opencli albato diagnose --automation-id 340526

# Safely pause an automation with readback verification
opencli albato pause --automation-id 340526
```

---

## Testing

```bash
# Run unit and contract tests
npm test
```

---

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0-or-later) - see the [LICENSE](LICENSE) file for details.
