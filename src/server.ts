import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SSHConfigMerger, getDefaultUserConfigPath, getProjectConfigPath, initProjectConfig, initUserConfig } from './config/index.js';
import { SSHConnectionPool } from './ssh/client.js';
import { executeCommand } from './ssh/executor.js';
import { validateCommand, sanitizeOutput, sanitizeInput } from './security/index.js';
import { formatExecResult } from './utils/output.js';
import { logger } from './utils/logger.js';
import type { ServerOptions, SSHConfigPaths } from './config/types.js';

/**
 * Create and configure the SSH MCP Server with all tools and resources.
 */
export function createSSHMcpServer(options: ServerOptions = {}): McpServer {
  // ── Configuration ──────────────────────────────────────────────────
  const projectRoot = options.projectRoot;
  const userConfigPath = options.userConfigPath || getDefaultUserConfigPath();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  const maxOutputChars = options.maxOutputChars ?? 10_000;

  const configPaths: SSHConfigPaths = {
    userConfig: userConfigPath,
    projectConfig: projectRoot ? getProjectConfigPath(projectRoot) : undefined,
  };

  // Initialize config merger and load
  const configMerger = new SSHConfigMerger(configPaths);
  try {
    configMerger.load();
  } catch (err) {
    logger.warn('Failed to load SSH configs on startup, will retry on first use', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Initialize connection pool
  const pool = new SSHConnectionPool({
    maxConnections: options.maxConnections ?? 5,
    idleTimeoutMs: options.idleTimeoutMs ?? 600_000,
    strictHostKey: options.strictHostKey ?? false,
  });

  // ── MCP Server ─────────────────────────────────────────────────────
  const server = new McpServer({
    name: 'ssh-mcp-server',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: { listChanged: false },
      resources: {},
      logging: {},
    },
  });

  // ── Tool: ssh_list_hosts ───────────────────────────────────────────
  server.tool(
    'ssh_list_hosts',
    'List all available SSH hosts from merged configuration (project + user level)',
    {},
    async () => {
      try {
        configMerger.reload();
        const hosts = configMerger.getAllHosts();

        if (hosts.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No SSH hosts configured.\n\n' +
                `User config: ${configPaths.userConfig} (${configMerger.hasUserConfig() ? 'exists' : 'not found'})\n` +
                `Project config: ${configPaths.projectConfig || 'N/A'} (${configMerger.hasProjectConfig() ? 'exists' : 'not found'})\n\n` +
                'Use ssh_init_config to create a configuration file.',
            }],
          };
        }

        const lines = hosts.map(h => {
          const c = h.config;
          const connected = pool.isConnected(c.host) ? ' [connected]' : '';
          return `- **${c.host}**${connected} → ${c.hostname || '(no hostname)'}:${c.port || 22} ` +
            `(user: ${c.user || 'default'}, source: ${h.source})`;
        });

        const summary = [
          `### SSH Hosts (${hosts.length} configured)`,
          '',
          ...lines,
          '',
          `User config: ${configPaths.userConfig}`,
          `Project config: ${configPaths.projectConfig || 'N/A'}`,
        ].join('\n');

        return { content: [{ type: 'text' as const, text: summary }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error listing hosts: ${msg}` }], isError: true };
      }
    }
  );

  // ── Tool: ssh_exec ─────────────────────────────────────────────────
  server.tool(
    'ssh_exec',
    'Execute a command on a remote SSH host. The host must be defined in the SSH configuration.',
    {
      host: z.string().describe('SSH host alias from the configuration'),
      command: z.string().describe('Command to execute on the remote host'),
      timeout_ms: z.number().optional().describe('Command timeout in milliseconds (default: 60000)'),
    },
    async ({ host, command, timeout_ms }) => {
      try {
        // Reload config to pick up changes
        configMerger.reload();

        // Resolve host
        const hostEntry = configMerger.getHost(host);
        if (!hostEntry) {
          const available = configMerger.getHostNames();
          return {
            content: [{
              type: 'text' as const,
              text: `Host "${host}" not found in SSH configuration.\n` +
                `Available hosts: ${available.length > 0 ? available.join(', ') : '(none)'}`,
            }],
            isError: true,
          };
        }

        // Sanitize command
        const sanitizedCommand = sanitizeInput(command);

        // Validate command against security policy
        const policy = configMerger.getSecurityPolicy(host);
        const validation = validateCommand(sanitizedCommand, policy);
        if (!validation.allowed) {
          logger.warn('Command blocked by security policy', { host, command: sanitizedCommand, reason: validation.reason });
          return {
            content: [{
              type: 'text' as const,
              text: `Command blocked: ${validation.reason}`,
            }],
            isError: true,
          };
        }

        // Connect (or reuse existing connection)
        logger.info('Executing command', { host, command: sanitizedCommand });
        const client = await pool.connect(hostEntry.config);
        pool.touch(hostEntry.config, 1);

        // Execute
        const effectiveTimeout = (() => {
          const policyMax = policy?.maxTimeoutMs;
          const requested = timeout_ms ?? defaultTimeoutMs;
          if (policyMax && requested > policyMax) return policyMax;
          return requested;
        })();

        const effectiveMaxOutput = policy?.maxOutputChars ?? maxOutputChars;

        const result = await executeCommand(client, hostEntry.config, sanitizedCommand, {
          timeoutMs: effectiveTimeout,
          maxOutputChars: effectiveMaxOutput,
        });

        pool.touch(hostEntry.config, -1);

        // Sanitize output
        const sanitizedResult = {
          ...result,
          stdout: sanitizeOutput(result.stdout),
          stderr: sanitizeOutput(result.stderr),
        };

        const formatted = formatExecResult(sanitizedResult);
        logger.info('Command completed', { host, exitCode: result.exitCode, durationMs: result.durationMs });

        return {
          content: [{ type: 'text' as const, text: formatted }],
          isError: result.exitCode !== 0 && result.exitCode !== null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Command execution failed', { host, error: msg });
        return { content: [{ type: 'text' as const, text: `SSH execution error: ${msg}` }], isError: true };
      }
    }
  );

  // ── Tool: ssh_init_config ──────────────────────────────────────────
  server.tool(
    'ssh_init_config',
    'Initialize an SSH configuration file (project-level or user-level)',
    {
      scope: z.enum(['project', 'user']).describe('Whether to create project-level or user-level config'),
      project_root: z.string().optional().describe('Project root directory (required for project scope)'),
      hosts: z.array(z.string()).optional().describe('Host names to include in the template'),
    },
    async ({ scope, project_root, hosts }) => {
      try {
        if (scope === 'project') {
          const root = project_root || projectRoot;
          if (!root) {
            return {
              content: [{
                type: 'text' as const,
                text: 'project_root is required when scope is "project". ' +
                  'Either pass it as an argument or start the server with --project-root.',
              }],
              isError: true,
            };
          }
          const created = initProjectConfig(root, hosts);
          if (created) {
            configMerger.reload();
            return {
              content: [{
                type: 'text' as const,
                text: `Created project SSH config at: ${created}\n` +
                  'Edit this file to add your SSH host configurations.',
              }],
            };
          }
          return {
            content: [{
              type: 'text' as const,
              text: `Project SSH config already exists at: ${getProjectConfigPath(root)}`,
            }],
          };
        }

        // User scope
        const created = initUserConfig(userConfigPath);
        if (created) {
          return {
            content: [{
              type: 'text' as const,
              text: `Created user SSH config at: ${created}\n` +
                'Edit this file to add shared SSH host configurations.',
            }],
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: `User SSH config already exists at: ${userConfigPath}`,
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error initializing config: ${msg}` }], isError: true };
      }
    }
  );

  // ── Tool: ssh_get_config ───────────────────────────────────────────
  server.tool(
    'ssh_get_config',
    'Get the full SSH configuration for a specific host (merged from project + user level)',
    {
      host: z.string().describe('SSH host alias to look up'),
    },
    async ({ host }) => {
      try {
        configMerger.reload();
        const entry = configMerger.getHost(host);
        if (!entry) {
          const available = configMerger.getHostNames();
          return {
            content: [{
              type: 'text' as const,
              text: `Host "${host}" not found.\nAvailable: ${available.join(', ') || '(none)'}`,
            }],
            isError: true,
          };
        }

        const c = entry.config;
        const policy = configMerger.getSecurityPolicy(host);
        const connected = pool.isConnected(host);

        const info = [
          `### SSH Config: ${host}`,
          '',
          `| Property | Value |`,
          `|----------|-------|`,
          `| Host | ${c.host} |`,
          `| HostName | ${c.hostname || '(not set)'} |`,
          `| User | ${c.user || '(default)'} |`,
          `| Port | ${c.port || 22} |`,
          `| IdentityFile | ${c.identityFile ? '****' + c.identityFile.slice(-20) : '(not set)'} |`,
          `| ProxyJump | ${c.proxyJump || '(none)'} |`,
          `| StrictHostKeyChecking | ${c.strictHostKeyChecking || '(default)'} |`,
          `| ConnectTimeout | ${c.connectTimeout || '(default)'}s |`,
          `| Source | ${entry.source} |`,
          `| Connected | ${connected ? 'Yes' : 'No'} |`,
          '',
        ];

        if (policy) {
          info.push('**Security Policy:**');
          if (policy.allowlist) info.push(`- Allowlist: ${policy.allowlist.join(', ')}`);
          if (policy.denylist) info.push(`- Denylist: ${policy.denylist.join(', ')}`);
          if (policy.maxTimeoutMs) info.push(`- Max Timeout: ${policy.maxTimeoutMs}ms`);
          if (policy.maxOutputChars) info.push(`- Max Output: ${policy.maxOutputChars} chars`);
        }

        return { content: [{ type: 'text' as const, text: info.join('\n') }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── Tool: ssh_test_connection ──────────────────────────────────────
  server.tool(
    'ssh_test_connection',
    'Test SSH connectivity to a configured host',
    {
      host: z.string().describe('SSH host alias to test'),
    },
    async ({ host }) => {
      try {
        configMerger.reload();
        const entry = configMerger.getHost(host);
        if (!entry) {
          return {
            content: [{
              type: 'text' as const,
              text: `Host "${host}" not found in configuration.`,
            }],
            isError: true,
          };
        }

        const result = await pool.testConnection(entry.config);
        const status = result.success ? '✅' : '❌';

        return {
          content: [{
            type: 'text' as const,
            text: `${status} ${result.message} (${result.durationMs}ms)`,
          }],
          isError: !result.success,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── Tool: ssh_disconnect ───────────────────────────────────────────
  server.tool(
    'ssh_disconnect',
    'Disconnect SSH session(s). Specify a host to disconnect one, or omit to disconnect all.',
    {
      host: z.string().optional().describe('SSH host alias to disconnect (omit for all)'),
    },
    async ({ host }) => {
      try {
        const disconnected = await pool.disconnect(host);
        if (disconnected.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: host
                ? `No active connection to "${host}".`
                : 'No active connections to disconnect.',
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Disconnected: ${disconnected.join(', ')}`,
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── Resource: ssh://hosts ──────────────────────────────────────────
  server.resource(
    'ssh-hosts',
    'ssh://hosts',
    { description: 'List of all configured SSH hosts' },
    async () => {
      configMerger.reload();
      const hosts = configMerger.getAllHosts();

      const data = hosts.map(h => ({
        host: h.config.host,
        hostname: h.config.hostname,
        user: h.config.user,
        port: h.config.port || 22,
        source: h.source,
        connected: pool.isConnected(h.config.host),
      }));

      return {
        contents: [{
          uri: 'ssh://hosts',
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        }],
      };
    }
  );

  return server;
}

/**
 * Get the connection pool (for shutdown hooks etc.)
 * This is exposed via a module-level variable set during createSSHMcpServer.
 */
let _poolRef: SSHConnectionPool | null = null;

export function getPool(): SSHConnectionPool | null {
  return _poolRef;
}
