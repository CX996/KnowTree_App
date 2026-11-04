import path from 'node:path';
import dotenv from 'dotenv';

export function loadLocalEnvironment(
  root: string,
  target: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  for (const filename of ['.env.local', '.env']) {
    dotenv.config({
      path: path.join(root, filename),
      processEnv: target,
      override: false,
      quiet: true,
    });
  }
  return target;
}
