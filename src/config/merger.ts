import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { parseSSHConfigFile, parseSecurityPolicies } from './parser.js';
import type { SSHHostConfig, MergedSSHConfig, HostSecurityPolicy, SSHConfigPaths } from './types.js';

/**
 * Default user-level config directory
 */
export function getDefaultUserConfigPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    return join(home, '.config', 'mcp-ssh', 'config');
  }
  return join(home, '.config', 'mcp-ssh', 'config');
}

/**
 * Get project-level config path
 */
export function getProjectConfigPath(projectRoot: string): string {
  return join(projectRoot, 'ssh.config');
}

/**
 * SSHConfigMerger merges project-level and user-level SSH configurations.
 * Project-level settings take precedence over user-level settings.
 */
export class SSHConfigMerger {
  private projectHosts: Map<string, SSHHostConfig> = new Map();
  private userHosts: Map<string, SSHHostConfig> = new Map();
  private mergedHosts: Map<string, MergedSSHConfig> = new Map();
  private securityPolicies: Map<string, HostSecurityPolicy> = new Map();
  private paths: SSHConfigPaths;

  constructor(paths: SSHConfigPaths) {
    this.paths = paths;
  }

  /**
   * Load and merge both configuration files.
   * Call this after construction to populate the host data.
   */
  load(): void {
    // Load user-level config
    const userConfigs = parseSSHConfigFile(this.paths.userConfig);
    for (const cfg of userConfigs) {
      this.userHosts.set(cfg.host, cfg);
    }

    // Load user-level security policies
    if (existsSync(this.paths.userConfig)) {
      const userContent = readFileSync(this.paths.userConfig, 'utf-8');
      const userPolicies = parseSecurityPolicies(userContent);
      for (const [host, policy] of userPolicies) {
        this.securityPolicies.set(host, policy);
      }
    }

    // Load project-level config (overrides user-level)
    if (this.paths.projectConfig && existsSync(this.paths.projectConfig)) {
      const projectConfigs = parseSSHConfigFile(this.paths.projectConfig);
      for (const cfg of projectConfigs) {
        this.projectHosts.set(cfg.host, cfg);
      }

      // Load project-level security policies (override user-level)
      const projectContent = readFileSync(this.paths.projectConfig, 'utf-8');
      const projectPolicies = parseSecurityPolicies(projectContent);
      for (const [host, policy] of projectPolicies) {
        this.securityPolicies.set(host, { ...this.securityPolicies.get(host), ...policy });
      }
    }

    // Merge: project-level fields override user-level fields
    this.mergedHosts.clear();

    // Start with all user-level hosts
    for (const [hostName, userCfg] of this.userHosts) {
      this.mergedHosts.set(hostName, {
        config: { ...userCfg },
        source: 'user',
      });
    }

    // Override/add with project-level hosts
    for (const [hostName, projCfg] of this.projectHosts) {
      const existing = this.mergedHosts.get(hostName);
      if (existing) {
        // Merge: project fields override user fields (non-undefined only)
        const merged = mergeHostConfigs(existing.config, projCfg);
        this.mergedHosts.set(hostName, {
          config: merged,
          source: 'merged',
        });
      } else {
        this.mergedHosts.set(hostName, {
          config: { ...projCfg },
          source: 'project',
        });
      }
    }
  }

  /**
   * Reload configurations from disk
   */
  reload(): void {
    this.projectHosts.clear();
    this.userHosts.clear();
    this.mergedHosts.clear();
    this.securityPolicies.clear();
    this.load();
  }

  /**
   * Get all merged host configurations
   */
  getAllHosts(): MergedSSHConfig[] {
    return Array.from(this.mergedHosts.values());
  }

  /**
   * Get a specific host configuration by name
   */
  getHost(hostName: string): MergedSSHConfig | undefined {
    return this.mergedHosts.get(hostName);
  }

  /**
   * Get host names only
   */
  getHostNames(): string[] {
    return Array.from(this.mergedHosts.keys());
  }

  /**
   * Get security policy for a host
   */
  getSecurityPolicy(hostName: string): HostSecurityPolicy | undefined {
    return this.securityPolicies.get(hostName);
  }

  /**
   * Get the config paths being used
   */
  getConfigPaths(): SSHConfigPaths {
    return { ...this.paths };
  }

  /**
   * Check if project config exists
   */
  hasProjectConfig(): boolean {
    return !!this.paths.projectConfig && existsSync(this.paths.projectConfig);
  }

  /**
   * Check if user config exists
   */
  hasUserConfig(): boolean {
    return existsSync(this.paths.userConfig);
  }
}

/**
 * Merge two host configs: override's non-undefined fields take precedence
 */
function mergeHostConfigs(base: SSHHostConfig, override: SSHHostConfig): SSHHostConfig {
  const merged: SSHHostConfig = { ...base };

  if (override.hostname !== undefined) merged.hostname = override.hostname;
  if (override.user !== undefined) merged.user = override.user;
  if (override.port !== undefined) merged.port = override.port;
  if (override.identityFile !== undefined) merged.identityFile = override.identityFile;
  if (override.proxyJump !== undefined) merged.proxyJump = override.proxyJump;
  if (override.strictHostKeyChecking !== undefined) merged.strictHostKeyChecking = override.strictHostKeyChecking;
  if (override.forwardAgent !== undefined) merged.forwardAgent = override.forwardAgent;
  if (override.connectTimeout !== undefined) merged.connectTimeout = override.connectTimeout;
  if (override.serverAliveInterval !== undefined) merged.serverAliveInterval = override.serverAliveInterval;
  if (override.serverAliveCountMax !== undefined) merged.serverAliveCountMax = override.serverAliveCountMax;
  if (override.userKnownHostsFile !== undefined) merged.userKnownHostsFile = override.userKnownHostsFile;

  // Merge extra fields
  if (override.extra) {
    merged.extra = { ...merged.extra, ...override.extra };
  }

  return merged;
}
