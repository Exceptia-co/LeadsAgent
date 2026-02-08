/**
 * @fileoverview Centralized Puppeteer configuration for WhatsApp Web.js
 *
 * Detects platform (Windows vs Linux) and environment (dev vs production)
 * to generate the correct Chrome/Chromium launch arguments.
 *
 * Usage:
 *   import { buildPuppeteerConfig } from '@/config/puppeteer.config';
 *   const client = new Client({ puppeteer: buildPuppeteerConfig() });
 */

import os from 'os';
import { logger } from '../utils/logger';

export interface PuppeteerConfig {
  headless: boolean;
  executablePath: string | undefined;
  devtools: boolean;
  timeout: number;
  args: string[];
}

/**
 * Resolve headless mode with explicit env var priority:
 *  1. PUPPETEER_HEADLESS=true/false  -> explicit override
 *  2. NODE_ENV=production             -> always headless
 *  3. Default (development)           -> visible window
 */
function resolveHeadless(isProduction: boolean): boolean {
  const envValue = process.env.PUPPETEER_HEADLESS;
  if (envValue === 'true') return true;
  if (envValue === 'false') return false;
  if (isProduction) return true;
  return false;
}

/**
 * Build Chrome launch arguments, conditional on platform and mode.
 */
function buildArgs(isWindows: boolean, headless: boolean, isProduction: boolean): string[] {
  const args: string[] = [
    // Basic security (required for containerized/sandboxed environments)
    '--no-sandbox',
    '--disable-setuid-sandbox',

    // Memory optimization
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--no-first-run',

    // WhatsApp Web stability
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',

    // Memory leak prevention
    '--memory-pressure-off',
    '--max_old_space_size=4096',

    // Cross-platform stability
    '--disable-component-cloud-policy',
    '--disable-domain-reliability',
  ];

  // Windows-only flags
  if (isWindows) {
    args.push('--disable-win32k-lockdown');
  }

  // Headless needs an explicit viewport — WhatsApp Web requires ~760px minimum width
  if (headless) {
    args.push('--window-size=1280,900');
  }

  // Platform-appropriate User-Agent
  const userAgent = isWindows
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  args.push(`--user-agent=${userAgent}`);

  // Debug logging only in non-production
  if (!isProduction) {
    args.push('--enable-logging=stderr', '--log-level=1');
  }

  return args;
}

/**
 * Build a complete Puppeteer launch config.
 *
 * @param options.timeout - Browser initialization timeout in ms (default: 120000)
 */
export function buildPuppeteerConfig(options: { timeout?: number } = {}): PuppeteerConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isWindows = os.platform() === 'win32';
  const headless = resolveHeadless(isProduction);

  // devtools only makes sense when non-headless and non-production
  const devtools = !isProduction && !headless;

  const config: PuppeteerConfig = {
    headless,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    devtools,
    timeout: options.timeout || 120000,
    args: buildArgs(isWindows, headless, isProduction),
  };

  logger.info(
    `Puppeteer config: headless=${headless}, platform=${os.platform()}, ` +
      `executablePath=${config.executablePath || 'auto'}, devtools=${devtools}`
  );

  return config;
}
