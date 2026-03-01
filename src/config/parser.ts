import SSHConfig, { LineType, type Directive, type Section, type Line } from 'ssh-config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { SSHHostConfig, HostSecurityPolicy } from './types.js';

/**
 * Type guard: check if a Line is a Directive (has param/value)
 */
function isDirective(line: Line): line is Directive {
  return line.type === LineType.DIRECTIVE;
}

/**
 * Type guard: check if a Directive is a Section (has config)
 */
function isSection(line: Line): line is Section {
  return isDirective(line) && 'config' in line;
}

/**
 * Get a string value from a Directive's value field,
 * which can be a string or an array of {val, separator, quoted} objects.
 */
function getDirectiveValue(d: Directive): string {
  if (typeof d.value === 'string') return d.value;
  if (Array.isArray(d.value)) return d.value.map(v => v.val).join(' ');
  return String(d.value);
}

/**
 * Parse an SSH config file and return structured host configurations.
 */
export function parseSSHConfigFile(filePath: string): SSHHostConfig[] {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    return [];
  }

  const content = readFileSync(absPath, 'utf-8');
  return parseSSHConfigContent(content);
}

/**
 * Parse SSH config content string into structured host configurations.
 */
export function parseSSHConfigContent(content: string): SSHHostConfig[] {
  const parsed = SSHConfig.parse(content);
  const hosts: SSHHostConfig[] = [];

  for (const section of parsed) {
    // Only process Host directives (skip Match, comments, etc.)
    if (!isDirective(section) || section.param !== 'Host') {
      continue;
    }

    const hostPattern = getDirectiveValue(section);

    // Skip wildcard-only hosts
    if (hostPattern === '*') {
      continue;
    }

    const hostConfig: SSHHostConfig = {
      host: hostPattern,
      extra: {},
    };

    // Process nested config directives
    if (isSection(section)) {
      for (const directive of section.config) {
        if (!isDirective(directive)) continue;

        const param = directive.param.toLowerCase();
        const value = getDirectiveValue(directive);

        switch (param) {
          case 'hostname':
            hostConfig.hostname = value;
            break;
          case 'user':
            hostConfig.user = value;
            break;
          case 'port':
            hostConfig.port = parseInt(value, 10);
            break;
          case 'identityfile':
            hostConfig.identityFile = resolveHomePath(value);
            break;
          case 'proxyjump':
            hostConfig.proxyJump = value;
            break;
          case 'stricthostkeychecking':
            hostConfig.strictHostKeyChecking = value as 'yes' | 'no' | 'ask';
            break;
          case 'forwardagent':
            hostConfig.forwardAgent = value.toLowerCase() === 'yes';
            break;
          case 'connecttimeout':
            hostConfig.connectTimeout = parseInt(value, 10);
            break;
          case 'serveraliveinterval':
            hostConfig.serverAliveInterval = parseInt(value, 10);
            break;
          case 'serveralivecountmax':
            hostConfig.serverAliveCountMax = parseInt(value, 10);
            break;
          case 'userknownhostsfile':
            hostConfig.userKnownHostsFile = resolveHomePath(value);
            break;
          default:
            hostConfig.extra![directive.param] = value;
            break;
        }
      }
    }

    hosts.push(hostConfig);
  }

  return hosts;
}

/**
 * Extract MCP-SSH security policy comments from config content.
 * Supports format: # mcp-ssh:allowlist = cmd1,cmd2  or  # mcp-ssh:denylist = cmd1,cmd2
 * These comments must appear within a Host block.
 */
export function parseSecurityPolicies(content: string): Map<string, HostSecurityPolicy> {
  const policies = new Map<string, HostSecurityPolicy>();
  let currentHost: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Track current Host block
    const hostMatch = trimmed.match(/^Host\s+(\S+)/i);
    if (hostMatch) {
      currentHost = hostMatch[1];
      continue;
    }

    // Parse mcp-ssh security comments
    if (currentHost && trimmed.startsWith('#')) {
      const policyMatch = trimmed.match(
        /^#\s*mcp-ssh:(allowlist|denylist|maxTimeoutMs|maxOutputChars)\s*=\s*(.+)/i
      );
      if (policyMatch) {
        const key = policyMatch[1].toLowerCase();
        const value = policyMatch[2].trim();

        if (!policies.has(currentHost)) {
          policies.set(currentHost, {});
        }
        const policy = policies.get(currentHost)!;

        switch (key) {
          case 'allowlist':
            policy.allowlist = value.split(',').map(s => s.trim());
            break;
          case 'denylist':
            policy.denylist = value.split(',').map(s => s.trim());
            break;
          case 'maxtimeoutms':
            policy.maxTimeoutMs = parseInt(value, 10);
            break;
          case 'maxoutputchars':
            policy.maxOutputChars = parseInt(value, 10);
            break;
        }
      }
    }
  }

  return policies;
}

/**
 * Resolve ~ in paths to the user's home directory
 */
function resolveHomePath(p: string): string {
  if (p.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return resolve(home, p.slice(2)); // skip ~/
  }
  return resolve(p);
}
