import type { Client } from 'ssh2';
import type { ExecResult, SSHHostConfig } from '../config/types.js';
import { truncateOutput } from '../utils/output.js';

/**
 * Execute a command on a remote host via an SSH connection.
 */
export async function executeCommand(
  client: Client,
  hostConfig: SSHHostConfig,
  command: string,
  options: {
    timeoutMs?: number;
    maxOutputChars?: number;
  } = {}
): Promise<ExecResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputChars = options.maxOutputChars ?? 10_000;
  const startTime = Date.now();

  return new Promise<ExecResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let resolved = false;

    const finalize = (exitCode: number | null) => {
      if (resolved) return;
      resolved = true;

      const { text: outText, truncated: outTrunc } = truncateOutput(stdout, maxOutputChars);
      const { text: errText, truncated: errTrunc } = truncateOutput(stderr, maxOutputChars);

      resolve({
        exitCode,
        stdout: outText,
        stderr: errText,
        stdoutTruncated: stdoutTruncated || outTrunc,
        stderrTruncated: stderrTruncated || errTrunc,
        durationMs: Date.now() - startTime,
        host: hostConfig.host,
      });
    };

    // Set up timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        finalize(null);
      }
    }, timeoutMs);

    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to execute command on ${hostConfig.host}: ${err.message}`));
        }
        return;
      }

      stream.on('close', (code: number | null) => {
        clearTimeout(timer);
        finalize(code);
      });

      stream.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        if (stdout.length < maxOutputChars * 2) {
          stdout += chunk;
        } else {
          stdoutTruncated = true;
        }
      });

      stream.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        if (stderr.length < maxOutputChars * 2) {
          stderr += chunk;
        } else {
          stderrTruncated = true;
        }
      });

      stream.on('error', (streamErr: Error) => {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(new Error(`Stream error on ${hostConfig.host}: ${streamErr.message}`));
        }
      });
    });
  });
}
