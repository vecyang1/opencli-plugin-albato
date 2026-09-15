# Private Albato OpenCLI adapter

This is a local, read-only operator adapter for the authenticated Albato web UI.

## Commands

```bash
opencli --profile <profile> albato automations --limit 25 -f json
opencli --profile <profile> albato history --automation-id <id> --limit 25 -f json
opencli --profile <profile> albato diagnose --automation-id <id> --limit 50 -f json
```

`automations` reads visible card state. `history` reads visible run outcomes. `diagnose` groups visible outcome classes and offers safe next-step hints. None of them changes Albato state, retries a run, or resends an event. By default, user-authored names and labels are omitted; pass `--include-labels` only when the local operator deliberately needs broadly redacted label text.

## Safety and verification

The adapter never reads cookies, local storage, tokens, connection links, calendar IDs, raw event data, mail bodies, or URL query strings. Its output is limited to operational labels and redacted summaries.

Run `opencli doctor` before a real command. `opencli validate albato` and `node --test commands.test.mjs` validate the local adapter only; they do not prove that an OpenCLI Browser Bridge is connected, that Albato is signed in, or that an automation reached its final recipient.

Do not install a Browser Bridge solely for this adapter unless the account owner explicitly approves it.
