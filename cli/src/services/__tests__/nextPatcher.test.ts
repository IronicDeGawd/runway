import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextPatcher } from '../nextPatcher';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpatcher-'));
  // Create a minimal package.json so the directory looks like a project
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(filename: string, content: string) {
  fs.writeFileSync(path.join(tmpDir, filename), content, 'utf-8');
}

function readConfig(filename: string): string {
  return fs.readFileSync(path.join(tmpDir, filename), 'utf-8');
}

// ─── Patch Tests ─────────────────────────────────────────────────────────────

describe('NextPatcher.patch', () => {
  it('patches next.config.js with module.exports format', async () => {
    writeConfig('next.config.js', `module.exports = {\n  reactStrictMode: true,\n};\n`);

    const result = await NextPatcher.patch(tmpDir, 'my-app');
    expect(result).toBe(true);

    const content = readConfig('next.config.js');
    expect(content).toContain("basePath: '/app/my-app'");
    expect(content).toContain("assetPrefix: '/app/my-app'");
    expect(content).toContain('// runway:basePath-start');
    expect(content).toContain('// runway:basePath-end');
  });

  it('patches next.config.mjs with export default object', async () => {
    writeConfig('next.config.mjs', `export default {\n  reactStrictMode: true,\n};\n`);

    const result = await NextPatcher.patch(tmpDir, 'test-project');
    expect(result).toBe(true);

    const content = readConfig('next.config.mjs');
    expect(content).toContain("basePath: '/app/test-project'");
    expect(content).toContain("assetPrefix: '/app/test-project'");
  });

  it('patches next.config.ts with TypeScript variable pattern', async () => {
    const tsConfig = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
    writeConfig('next.config.ts', tsConfig);

    const result = await NextPatcher.patch(tmpDir, 'ts-app');
    expect(result).toBe(true);

    const content = readConfig('next.config.ts');
    expect(content).toContain("basePath: '/app/ts-app'");
    expect(content).toContain("assetPrefix: '/app/ts-app'");
    // The import and export should still be intact
    expect(content).toContain("import type { NextConfig } from 'next'");
    expect(content).toContain('export default nextConfig');
  });

  it('patches wrapped config like withNextIntl({})', async () => {
    const wrapped = `import withNextIntl from 'next-intl/plugin';

export default withNextIntl({
  reactStrictMode: true,
});
`;
    writeConfig('next.config.mjs', wrapped);

    const result = await NextPatcher.patch(tmpDir, 'intl-app');
    expect(result).toBe(true);

    const content = readConfig('next.config.mjs');
    expect(content).toContain("basePath: '/app/intl-app'");
  });

  it('does not inject into non-config function calls', async () => {
    const config = `import createMDX from '@next/mdx';
const withMDX = createMDX({ extension: /\\.mdx$/ });

export default withMDX({
  reactStrictMode: true,
});
`;
    writeConfig('next.config.mjs', config);

    const result = await NextPatcher.patch(tmpDir, 'mdx-app');
    expect(result).toBe(true);

    const content = readConfig('next.config.mjs');
    // basePath should be in the export default withMDX({...}), not createMDX({...})
    const createMDXIdx = content.indexOf('createMDX({');
    const basePathIdx = content.indexOf("basePath:");
    expect(basePathIdx).toBeGreaterThan(createMDXIdx);
  });

  it('prefers next.config.ts over .mjs and .js', async () => {
    writeConfig('next.config.ts', `const nextConfig = {\n  output: 'standalone',\n};\nexport default nextConfig;\n`);
    writeConfig('next.config.js', `module.exports = {\n  reactStrictMode: true,\n};\n`);

    await NextPatcher.patch(tmpDir, 'priority-test');

    const tsContent = readConfig('next.config.ts');
    const jsContent = readConfig('next.config.js');
    expect(tsContent).toContain("basePath: '/app/priority-test'");
    // .js should NOT be patched
    expect(jsContent).not.toContain('basePath');
  });

  it('sanitizes project name for basePath', async () => {
    writeConfig('next.config.js', `module.exports = {\n};\n`);

    await NextPatcher.patch(tmpDir, 'My App_v2');

    const content = readConfig('next.config.js');
    expect(content).toContain("basePath: '/app/my-app-v2'");
  });

  it('skips if user already has basePath configured', async () => {
    writeConfig('next.config.js', `module.exports = {\n  basePath: '/custom',\n};\n`);

    const result = await NextPatcher.patch(tmpDir, 'app');
    expect(result).toBe(false);

    const content = readConfig('next.config.js');
    // Should NOT inject runway markers
    expect(content).not.toContain('runway:basePath');
    // Original basePath preserved
    expect(content).toContain("basePath: '/custom'");
  });

  it('returns false when no config file exists', async () => {
    const result = await NextPatcher.patch(tmpDir, 'no-config');
    expect(result).toBe(false);
  });

  it('is idempotent — second patch is a no-op', async () => {
    writeConfig('next.config.js', `module.exports = {\n  reactStrictMode: true,\n};\n`);

    await NextPatcher.patch(tmpDir, 'app');
    const firstPatch = readConfig('next.config.js');

    const result = await NextPatcher.patch(tmpDir, 'app');
    expect(result).toBe(true); // returns true (already patched)

    const secondPatch = readConfig('next.config.js');
    expect(secondPatch).toBe(firstPatch);
  });
});

// ─── Revert Tests ────────────────────────────────────────────────────────────

describe('NextPatcher.revert', () => {
  it('cleanly reverts a patched config (exact round-trip)', async () => {
    const original = `module.exports = {\n  reactStrictMode: true,\n};\n`;
    writeConfig('next.config.js', original);

    await NextPatcher.patch(tmpDir, 'app');
    const patched = readConfig('next.config.js');
    expect(patched).toContain('runway:basePath-start');

    await NextPatcher.revert(tmpDir);
    const reverted = readConfig('next.config.js');

    expect(reverted).toBe(original);
  });

  it('reverts TypeScript config cleanly (exact round-trip)', async () => {
    const original = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
    writeConfig('next.config.ts', original);

    await NextPatcher.patch(tmpDir, 'ts-app');
    await NextPatcher.revert(tmpDir);

    const reverted = readConfig('next.config.ts');
    expect(reverted).toBe(original);
  });

  it('is a no-op when nothing was patched', async () => {
    const original = `module.exports = {\n  reactStrictMode: true,\n};\n`;
    writeConfig('next.config.js', original);

    await NextPatcher.revert(tmpDir);

    const content = readConfig('next.config.js');
    expect(content).toBe(original);
  });

  it('is a no-op when no config file exists', async () => {
    // Should not throw
    await NextPatcher.revert(tmpDir);
  });
});

// ─── Full Cycle (patch → build simulation → revert) ─────────────────────────

describe('NextPatcher full cycle', () => {
  it('patch → modify → revert preserves user changes outside markers', async () => {
    const original = `module.exports = {\n  reactStrictMode: true,\n};\n`;
    writeConfig('next.config.js', original);

    await NextPatcher.patch(tmpDir, 'app');

    // Simulate user (or build tool) adding something outside the markers
    let content = readConfig('next.config.js');
    content = '// Added by some tool\n' + content;
    writeConfig('next.config.js', content);

    await NextPatcher.revert(tmpDir);

    const reverted = readConfig('next.config.js');
    expect(reverted).toContain('// Added by some tool');
    expect(reverted).not.toContain('runway:basePath');
  });
});
