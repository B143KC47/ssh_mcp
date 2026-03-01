/**
 * Truncate output text to a maximum character limit.
 * Appends a truncation notice if truncated.
 */
export function truncateOutput(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  const truncated = text.slice(0, maxChars);
  const remaining = text.length - maxChars;
  return {
    text: truncated + `\n\n... [truncated: ${remaining} more characters]`,
    truncated: true,
  };
}

/**
 * Format an ExecResult into a human-readable string for MCP tool output
 */
export function formatExecResult(result: {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  host: string;
}): string {
  const parts: string[] = [];

  parts.push(`Host: ${result.host}`);
  parts.push(`Exit Code: ${result.exitCode ?? 'N/A (timeout/killed)'}`);
  parts.push(`Duration: ${result.durationMs}ms`);

  if (result.stdout) {
    parts.push('');
    parts.push('--- STDOUT ---');
    parts.push(result.stdout);
    if (result.stdoutTruncated) {
      parts.push('[Output was truncated]');
    }
  }

  if (result.stderr) {
    parts.push('');
    parts.push('--- STDERR ---');
    parts.push(result.stderr);
    if (result.stderrTruncated) {
      parts.push('[Output was truncated]');
    }
  }

  if (!result.stdout && !result.stderr) {
    parts.push('');
    parts.push('[No output]');
  }

  return parts.join('\n');
}
