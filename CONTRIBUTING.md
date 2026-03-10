# Contributing to SSH MCP Server

Thanks for considering a contribution.

## Best ways to contribute

- Report bugs with clear reproduction steps
- Propose new MCP workflows or SSH safety features
- Improve docs, examples, and onboarding
- Submit focused pull requests with one clear goal

## Before you start

1. Search existing issues and pull requests first
2. For larger changes, open an issue to discuss the use case
3. Keep security and backwards compatibility in mind

## Local development

```bash
npm install
npm run build
npm run dev -- --project-root .
```

## Project expectations

- Preserve the security-first design of the server
- Keep MCP tool names stable unless there is a strong reason to change them
- Prefer standard OpenSSH behavior over custom configuration formats
- Update both `README.md` and `README.zh-CN.md` when user-facing behavior changes
- Update examples when configuration or setup steps change

## Pull request checklist

- [ ] The change solves one clear problem
- [ ] `npm run build` passes
- [ ] User-facing changes are documented
- [ ] New config or workflow behavior is reflected in examples
- [ ] Security implications were considered

## Reporting security issues

Please do **not** open public issues for vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md).

## Code review style

Smaller, focused pull requests are reviewed faster. If a change is large, explain:

- the user problem
- the design tradeoffs
- the security implications
- how you verified the result