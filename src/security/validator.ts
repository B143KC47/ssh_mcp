import type { HostSecurityPolicy } from '../config/types.js';

/**
 * Default dangerous command patterns (blacklist).
 * These match against the full command string using regex.
 */
const DEFAULT_DENYLIST: RegExp[] = [
  // Destructive file operations
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/(\s|$)/,  // rm -rf /
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(\s|$)/,
  /\bmkfs\b/,                   // Format filesystem
  /\bdd\s+if=/,                 // Raw disk write
  />\s*\/dev\/[sh]d/,           // Write to disk device
  // System control
  /\bshutdown\b/,
  /\breboot\b/,
  /\binit\s+[06]\b/,
  /\bsystemctl\s+(halt|poweroff|reboot)\b/,
  // Permission escalation
  /\bchmod\s+(-R\s+)?[0-7]*7[0-7]*\s+\//,  // chmod 777 /
  /\bchown\s+-R\s+.*\s+\//,                  // chown -R on root
  // Fork bombs and malicious patterns
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/,    // :(){ :|:& };:
  /\bfork\s*bomb\b/i,
  // Dangerous network operations
  /\b(iptables|nftables)\s+-F/,  // Flush firewall rules
  /\biptables\s+-P\s+\w+\s+DROP/,  // Set default policy to DROP
  // Credential theft
  /\bcat\s+.*\/etc\/(shadow|passwd)\b/,
  /\bcat\s+.*\.ssh\/.*_rsa\b/,
  /\bcat\s+.*\.ssh\/id_/,
];

/**
 * Validate a command against security policies.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export function validateCommand(
  command: string,
  policy?: HostSecurityPolicy
): { allowed: boolean; reason?: string } {
  const trimmed = command.trim();

  // Empty command check
  if (!trimmed) {
    return { allowed: false, reason: 'Empty command' };
  }

  // If whitelist mode is active, only allow listed patterns
  if (policy?.allowlist && policy.allowlist.length > 0) {
    const allowed = policy.allowlist.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(trimmed);
      } catch {
        // If pattern is not a valid regex, treat as simple substring match
        return trimmed.toLowerCase().includes(pattern.toLowerCase());
      }
    });

    if (!allowed) {
      return {
        allowed: false,
        reason: `Command not in allowlist. Allowed patterns: ${policy.allowlist.join(', ')}`,
      };
    }
    return { allowed: true };
  }

  // Blacklist mode: check custom denylist first
  if (policy?.denylist && policy.denylist.length > 0) {
    for (const pattern of policy.denylist) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(trimmed)) {
          return {
            allowed: false,
            reason: `Command matches deny pattern: ${pattern}`,
          };
        }
      } catch {
        // Simple substring match fallback
        if (trimmed.toLowerCase().includes(pattern.toLowerCase())) {
          return {
            allowed: false,
            reason: `Command contains denied term: ${pattern}`,
          };
        }
      }
    }
  }

  // Check default denylist
  for (const regex of DEFAULT_DENYLIST) {
    if (regex.test(trimmed)) {
      return {
        allowed: false,
        reason: `Command matches built-in safety rule: ${regex.source}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Sanitize command output to filter potential sensitive data leaks
 */
export function sanitizeOutput(output: string): string {
  // Mask potential private keys in output
  let sanitized = output.replace(
    /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE KEY-----[\s\S]*?-----END\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE KEY-----/g,
    '[PRIVATE KEY REDACTED]'
  );

  // Mask potential passwords in environment variable dumps
  sanitized = sanitized.replace(
    /^(.*(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|AUTH)[^=]*=).+$/gim,
    '$1[REDACTED]'
  );

  return sanitized;
}

/**
 * Sanitize input to prevent command injection in arguments.
 * This is a basic safeguard - the primary defense is the denylist.
 */
export function sanitizeInput(input: string): string {
  // Remove null bytes
  return input.replace(/\0/g, '');
}
