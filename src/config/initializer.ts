import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { getProjectConfigPath, getDefaultUserConfigPath } from './merger.js';

/**
 * Template for a new project-level ssh.config file
 */
function projectConfigTemplate(hosts?: string[]): string {
  const hostEntries = hosts && hosts.length > 0
    ? hosts.map(h => `
Host ${h}
  # HostName <ip-or-hostname>
  # User <username>
  # Port 22
  # IdentityFile ~/.ssh/id_rsa
  # mcp-ssh:denylist = rm -rf,mkfs,dd,shutdown,reboot
`).join('\n')
    : `
Host my-server
  HostName 192.168.1.100
  User ubuntu
  Port 22
  IdentityFile ~/.ssh/id_rsa
  # mcp-ssh:denylist = rm -rf,mkfs,dd,shutdown,reboot
`;

  return `# SSH MCP Server - Project Configuration
# ==========================================
# This file defines SSH hosts available for this specific project.
# It uses standard OpenSSH config syntax.
#
# Project-level settings override user-level settings (~/.config/mcp-ssh/config)
# for hosts with the same name.
#
# Security annotations (comments parsed by MCP SSH Server):
#   # mcp-ssh:denylist = cmd1,cmd2   - Block these command patterns
#   # mcp-ssh:allowlist = cmd1,cmd2  - Only allow these command patterns
#   # mcp-ssh:maxTimeoutMs = 30000   - Max execution timeout
#   # mcp-ssh:maxOutputChars = 5000  - Max output characters
#
${hostEntries}
`;
}

/**
 * Template for user-level config
 */
function userConfigTemplate(): string {
  return `# SSH MCP Server - User Configuration
# ==========================================
# This file defines SSH hosts shared across all projects.
# It uses standard OpenSSH config syntax.
#
# Project-level configs (ssh.config in project root) can override
# these settings for hosts with the same name.
#
# Security annotations (comments parsed by MCP SSH Server):
#   # mcp-ssh:denylist = cmd1,cmd2   - Block these command patterns
#   # mcp-ssh:allowlist = cmd1,cmd2  - Only allow these command patterns
#

# Example host
# Host dev-server
#   HostName dev.example.com
#   User developer
#   Port 22
#   IdentityFile ~/.ssh/id_ed25519
#   # mcp-ssh:denylist = rm -rf /,mkfs,dd if=,shutdown,reboot
`;
}

/**
 * Initialize a project-level ssh.config file
 * @returns The path to the created config file, or null if it already exists
 */
export function initProjectConfig(projectRoot: string, hosts?: string[]): string | null {
  const configPath = getProjectConfigPath(projectRoot);

  if (existsSync(configPath)) {
    return null; // Already exists
  }

  const content = projectConfigTemplate(hosts);
  writeFileSync(configPath, content, 'utf-8');
  return configPath;
}

/**
 * Initialize user-level config if it doesn't exist
 * @returns The path to the created config file, or null if it already exists
 */
export function initUserConfig(customPath?: string): string | null {
  const configPath = customPath || getDefaultUserConfigPath();

  if (existsSync(configPath)) {
    return null;
  }

  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = userConfigTemplate();
  writeFileSync(configPath, content, 'utf-8');
  return configPath;
}
