# SSH MCP Server

A **Model Context Protocol (MCP)** server that provides SSH remote command execution capabilities. It enables AI agents to discover, connect to, and execute commands on remote SSH hosts through a standardized MCP interface.

## Features

- **Dual-scope configuration**: Project-level (`ssh.config`) and user-level (`~/.config/mcp-ssh/config`) SSH configs with automatic merging
- **Connection pooling**: Reuse SSH connections across multiple commands with automatic idle cleanup
- **Command security**: Built-in dangerous command blacklist + configurable per-host allow/deny lists
- **Output management**: Automatic output truncation to prevent LLM context overflow
- **Sensitive data protection**: Private keys never exposed in tool outputs; passwords via env vars only
- **Standard SSH config syntax**: Uses OpenSSH config format — `Host`, `HostName`, `User`, `Port`, `IdentityFile`, etc.

## Quick Start

### 1. Install

```bash
npm install
npm run build
```

### 2. Configure SSH hosts

Create a project-level config (`ssh.config` in your project root):

```sshconfig
Host my-server
  HostName 192.168.1.100
  User ubuntu
  Port 22
  IdentityFile ~/.ssh/id_rsa
  # mcp-ssh:denylist = rm -rf,mkfs,dd,shutdown,reboot
```

Or initialize via the MCP tool:

```
Use tool: ssh_init_config with scope="project"
```

### 3. Add to MCP client

#### Claude Desktop / Augment

Add to your MCP settings (`claude_desktop_config.json` or equivalent):

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["path/to/ssh-mcp-server/dist/index.js", "--project-root", "/path/to/your/project"],
      "env": {}
    }
  }
}
```

#### Using npx (development)

```json
{
  "mcpServers": {
    "ssh": {
      "command": "npx",
      "args": ["tsx", "path/to/ssh-mcp-server/src/index.ts", "--project-root", "."]
    }
  }
}
```

## Configuration

### Config file locations

| Scope | Path | Purpose |
|-------|------|---------|
| Project | `<project-root>/ssh.config` | Hosts specific to this project |
| User | `~/.config/mcp-ssh/config` | Shared hosts across all projects |

**Merge rule**: Project-level settings override user-level settings for hosts with the same name.

### SSH config syntax

Standard OpenSSH config syntax is supported:

```sshconfig
# Project-level ssh.config
Host prod-db
  HostName db.prod.example.com
  User deploy
  Port 22
  IdentityFile ~/.ssh/deploy_key
  ConnectTimeout 10
  ServerAliveInterval 60
  # mcp-ssh:denylist = DROP TABLE,rm -rf /,mkfs

Host staging
  HostName staging.example.com
  User developer
  IdentityFile ~/.ssh/id_ed25519
  # mcp-ssh:allowlist = ls,cat,grep,find,ps,top,df,du,free,uptime
```

### Security annotations

Add security policies as comments within Host blocks:

```sshconfig
# mcp-ssh:denylist = cmd1,cmd2      # Block these command patterns
# mcp-ssh:allowlist = cmd1,cmd2     # Only allow these patterns (overrides denylist)
# mcp-ssh:maxTimeoutMs = 30000      # Max execution timeout for this host
# mcp-ssh:maxOutputChars = 5000     # Max output characters for this host
```

### Authentication

The server tries authentication methods in this order:

1. **Private key** — from `IdentityFile` in SSH config
2. **SSH Agent** — `SSH_AUTH_SOCK` (Unix) or Pageant (Windows)
3. **Password** — from environment variable `SSH_PASSWORD_<HOST>` (uppercase, special chars → `_`)

Example: For host `my-server`, set `SSH_PASSWORD_MY_SERVER=secret`.

## CLI Options

```
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

## MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `ssh_list_hosts` | List all available SSH hosts | — |
| `ssh_exec` | Execute a command on a remote host | `host`, `command`, `timeout_ms?` |
| `ssh_init_config` | Initialize SSH config file | `scope` (project/user), `project_root?`, `hosts?` |
| `ssh_get_config` | Get config for a specific host | `host` |
| `ssh_test_connection` | Test connectivity to a host | `host` |
| `ssh_disconnect` | Disconnect session(s) | `host?` |

## MCP Resources

| URI | Description |
|-----|-------------|
| `ssh://hosts` | JSON list of all configured SSH hosts |

## Security

### Built-in protections

- **Command blacklist**: Dangerous commands blocked by default (`rm -rf /`, `mkfs`, `dd if=`, `shutdown`, `reboot`, fork bombs, firewall flush, credential file reads)
- **Output sanitization**: Private keys and sensitive env vars redacted from output
- **No credential exposure**: Private key paths shown truncated; passwords never in tool results
- **Connection limits**: Max concurrent connections (default: 5) with idle timeout
- **Input sanitization**: Null bytes stripped from commands

### Recommendations

1. Always use `IdentityFile` (key-based auth) over passwords
2. Use per-host `# mcp-ssh:allowlist` for production servers
3. Add `ssh.config` to `.gitignore` if it contains sensitive hostnames
4. Enable `--strict-host-key` in production environments
5. Use SSH certificates or `known_hosts` pinning for host verification

## Architecture

```
┌─────────────────────────────────────────────┐
│ MCP Client (Claude/Augment/IDE)             │
│  ↕ JSON-RPC 2.0 over stdio                 │
├─────────────────────────────────────────────┤
│ MCP Server Layer                            │
│  ├─ Tool handlers (ssh_exec, etc.)          │
│  ├─ Resource handlers (ssh://hosts)         │
│  └─ Logging notifications                  │
├─────────────────────────────────────────────┤
│ Config Layer                                │
│  ├─ Parser (ssh-config lib)                 │
│  ├─ Merger (project + user, project wins)   │
│  └─ Security policies (allowlist/denylist)  │
├─────────────────────────────────────────────┤
│ SSH Layer                                   │
│  ├─ Connection Pool (ssh2 Client)           │
│  ├─ Command Executor (exec channels)        │
│  └─ Output truncation & sanitization        │
└─────────────────────────────────────────────┘
```

## Development

```bash
# Install deps
npm install

# Run in dev mode
npm run dev -- --project-root .

# Build
npm run build

# Run built version
npm start -- --project-root .

# Debug with MCP Inspector
npm run inspect
```

## License

MIT
