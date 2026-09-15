# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-15

### Added
- Initial release of `opencli-plugin-albato`.
- 8 standard commands covering the complete Albato automation lifecycle:
  - `opencli albato automations`: list automation cards with usage metrics and state.
  - `opencli albato bundle`: deep builder inspection, step pipeline parsing, and running protection banner.
  - `opencli albato pause`: pause running automation with two-sided live DOM readback verification.
  - `opencli albato start`: start stopped automation with two-sided live DOM readback verification.
  - `opencli albato history`: inspect execution history with service logo mapping.
  - `opencli albato diagnose`: cluster repeating failure classes with actionable repair hints.
  - `opencli albato retry`: precision retry of single execution by history ID.
  - `opencli albato connections`: list connected applications and account quantities with privacy redaction.
- Strict single-ID scoping on all mutation actions.
- Privacy redaction pipeline for visible personal emails, tokens, and webhook URLs.
- Automated test suite with 13/13 unit and contract tests passing.
