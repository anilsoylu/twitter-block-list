import { execSync } from 'node:child_process';

// The specs load the built extension, so build it once per run.
export default function globalSetup(): void {
  execSync('npx wxt build', { stdio: 'inherit' });
}
