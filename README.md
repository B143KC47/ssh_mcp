# SSH MCP Server

[![GitHub stars](https://img.shields.io/github/stars/B143KC47/ssh_mcp?style=flat-square)](https://github.com/B143KC47/ssh_mcp/stargazers)
[![CI](https://github.com/B143KC47/ssh_mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/B143KC47/ssh_mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-6e56cf?style=flat-square)](https://modelcontextprotocol.io/)
[![SSH](https://img.shields.io/badge/SSH-security--first-0f766e?style=flat-square)](https://www.openssh.com/)

**English** | [中文](README.zh-CN.md)

Secure SSH access for MCP clients. `ssh_mcp` lets Claude Desktop, VS Code Copilot, Augment, and other MCP-compatible agents run remote commands through a safety-first SSH proxy with OpenSSH config compatibility, connection pooling, and output guardrails.

## Project health

- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Open an issue](https://github.com/B143KC47/ssh_mcp/issues)
- [View CI runs](https://github.com/B143KC47/ssh_mcp/actions/workflows/ci.yml)

## Why developers pick this project

- **Use the SSH config you already know**: standard OpenSSH fields like `Host`, `HostName`, `User`, `Port`, `IdentityFile`, and `ProxyJump`
- **Safer than a raw shell bridge**: built-in dangerous command blocking, per-host allowlists/denylists, output caps, and secret redaction
- **Fast for multi-step agent sessions**: pooled SSH connections reduce reconnect overhead
- **Works with real MCP workflows**: designed for Claude Desktop, VS Code Copilot, Augment, and any MCP-compatible client
- **Flexible for teams**: merge project-level and user-level configs so shared hosts stay global while project overrides stay local

## Great fit for

- AI-assisted production troubleshooting
- Safe observability and read-only operations on remote servers
- DevOps and platform engineering copilots
- Internal tooling that needs SSH access without handing an agent unlimited shell freedom

## Quick start

### 1. Install and build

```bash
npm install
npm run build
```

### 2. Add the server to your MCP client

See the ready-to-copy examples in:

- `examples/mcp-config.claude.example.json`
- `examples/mcp-config.vscode.example.json`

Minimal Claude Desktop / Augment example:

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": [
        "/absolute/path/to/ssh-mcp-server/dist/index.js",
        "--project-root",
        "/path/to/your/project"
      ],
      "env": {}
    }
  }
}
```

Minimal VS Code MCP example:

```json
{
  "servers": {
    "ssh": {
      "command": "node",
      "args": [
        "/absolute/path/to/ssh-mcp-server/dist/index.js",
        "--project-root",
        "${workspaceFolder}"
      ]
    }
  }
}
```

### 3. Configure SSH hosts

Copy `examples/ssh.config.example` to `ssh.config` in your project root, or initialize one through the MCP tool:

```text
Use tool: ssh_init_config with scope="project"
```

Minimal example:

```sshconfig
Host my-server
  HostName 192.168.1.100
  User ubuntu
  Port 22
  IdentityFile ~/.ssh/id_rsa
  # mcp-ssh:denylist = rm -rf,mkfs,dd,shutdown,reboot
```

### 4. Try a few prompts in your MCP client

- "List all configured SSH hosts."
- "Test the SSH connection to `my-server`."
- "Run `uptime && df -h` on `my-server`."
- "Show me the merged SSH config for `my-server`."

## Core features

- **Dual-scope configuration**: project-level (`ssh.config`) + user-level (`~/.config/mcp-ssh/config`) with automatic merging
- **Connection pooling**: reuse SSH connections across commands with idle cleanup
- **Per-host security policy**: allowlists, denylists, max timeout, and max output size
- **Output management**: automatic truncation to protect LLM context windows
- **Sensitive data protection**: private keys and sensitive environment values are sanitized in output
- **OpenSSH compatibility**: keep using your normal host aliases and SSH habits

## Configuration

### Config file locations

| Scope | Path | Purpose |
|-------|------|---------|
| Project | `<project-root>/ssh.config` | Hosts specific to the current project |
| User | `~/.config/mcp-ssh/config` | Shared hosts across projects |

**Merge rule**: project-level settings override user-level settings for hosts with the same name.

### Security annotations

Add policies as comments inside a `Host` block:

```sshconfig
# mcp-ssh:denylist = cmd1,cmd2      # Block these command patterns
# mcp-ssh:allowlist = cmd1,cmd2     # Only allow these command patterns
# mcp-ssh:maxTimeoutMs = 30000      # Max execution timeout for this host
# mcp-ssh:maxOutputChars = 5000     # Max output characters for this host
```

### Authentication order

1. **Private key** from `IdentityFile`
2. **SSH agent** via `SSH_AUTH_SOCK` (Unix) or Pageant (Windows)
3. **Password** via environment variable `SSH_PASSWORD_<HOST>`

Example: for host `my-server`, set `SSH_PASSWORD_MY_SERVER=secret`.

## Why this is better than a plain SSH wrapper

| Plain remote exec bridge | SSH MCP Server |
|---|---|
| Often exposes a full shell with little policy control | Supports per-host allowlists / denylists |
| Reconnects for every agent step | Reuses pooled connections |
| Easy to overflow model context with huge outputs | Truncates output automatically |
| Custom host definitions | Works with familiar OpenSSH config syntax |
| Secrets may leak into logs | Sanitizes output and hides sensitive values |

## MCP tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `ssh_list_hosts` | List all available SSH hosts | — |
| `ssh_exec` | Execute a command on a remote host | `host`, `command`, `timeout_ms?` |
| `ssh_init_config` | Initialize SSH config file | `scope`, `project_root?`, `hosts?` |
| `ssh_get_config` | Get config for a specific host | `host` |
| `ssh_test_connection` | Test connectivity to a host | `host` |
| `ssh_disconnect` | Disconnect one host or all active sessions | `host?` |

## MCP resources

| URI | Description |
|-----|-------------|
| `ssh://hosts` | JSON list of all configured SSH hosts |

## Security-first defaults

- Dangerous commands such as `rm -rf /`, `mkfs`, `dd if=`, `shutdown`, and `reboot` are blocked by default
- Private key material and sensitive env values are redacted from outputs
- Commands are sanitized before execution
- Concurrent connection count and idle lifetime are limited

Recommended for production:

1. Prefer `IdentityFile` over password auth
2. Use `# mcp-ssh:allowlist` for production hosts
3. Add `ssh.config` to `.gitignore` if it contains sensitive hostnames
4. Enable `--strict-host-key` in production
5. Use SSH certificates or pinned `known_hosts` entries when possible

## CLI options

```text
ssh-mcp-server [options]

--project-root <path>     Project root directory (for project-level ssh.config)
--user-config <path>      Custom user config path (default: ~/.config/mcp-ssh/config)
--strict-host-key         Enable strict host key checking
--no-strict-host-key      Disable strict host key checking (default)
--timeout <ms>            Default command timeout in ms (default: 60000)
--max-output <chars>      Maximum output characters per stream (default: 10000)
--max-connections <n>     Maximum concurrent SSH connections (default: 5)
--idle-timeout <ms>       Connection idle timeout in ms (default: 600000)
```

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev -- --project-root .

# Build
npm run build

# Run the built server
npm start -- --project-root .

# Debug with MCP Inspector
npm run inspect
```

## Contributing

Issues and pull requests are welcome. If you want support for more MCP clients, stronger security policies, or better SSH ergonomics, open an issue and share the workflow you want to enable.

For contributor workflow details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Community

- Please follow the expectations in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- For security issues, use [SECURITY.md](SECURITY.md) instead of filing a public bug report

## License

MIT — see [LICENSE](LICENSE).
