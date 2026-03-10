# Security Policy

Security is a core feature of this project, not a decorative checkbox.

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` | ✅ |
| older commits / forks | ⚠️ best effort only |

## How to report a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Preferred order:

1. Use GitHub private vulnerability reporting if it is enabled for this repository
2. If private reporting is unavailable, contact the maintainer privately through GitHub instead of posting details publicly

## What to include

Please include as much of the following as possible:

- affected version or commit
- vulnerability type and impact
- reproduction steps or proof of concept
- whether the issue can leak secrets, bypass command controls, or affect host verification
- any suggested mitigation or fix

## Response targets

- initial acknowledgement: within 72 hours when possible
- triage update: within 7 days when possible
- fix timeline: depends on severity and reproducibility

## In scope examples

- command policy bypasses
- secret exposure in logs or tool output
- unsafe host verification behavior
- authentication flaws
- sandbox or boundary escape behavior in server tooling

## Out of scope examples

- vulnerabilities in a user's own SSH server configuration
- insecure credentials stored by a user outside this repository
- already-public information without a concrete project impact