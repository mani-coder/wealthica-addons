#!/usr/bin/env ts-node
/// <reference types="node" />

/**
 * Script: download-prod-data.ts
 * ----------------------------------
 * Downloads production JSON data from Wealthica REST endpoints and stores them
 * under addon/pnl/src/mocks/prod/ as <name>-prod.json.
 *
 * Usage:
 *   npm run download-prod-data
 *
 * Optionally set WEALTHICA_TOKEN environment variable if the API requires authentication:
 *   WEALTHICA_TOKEN=<token> npm run download-prod-data
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

interface Resource {
  filename: string;
  url: string;
}

// Generate today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

const resources: Resource[] = [
  {
    filename: 'portfolio-prod.json',
    url: `https://app.wealthica.com/api/portfolio?from=2010-01-01&to=${today}&assets=false`,
  },
  {
    filename: 'institutions-prod.json',
    url: 'https://app.wealthica.com/api/institutions',
  },
  {
    filename: 'positions-prod.json',
    url: 'https://app.wealthica.com/api/positions?assets=false',
  },
  {
    filename: 'transactions-prod.json',
    url: 'https://app.wealthica.com/api/transactions?assets=false&from=2010-01-01',
  },
];

const OUTPUT_DIR = path.resolve(__dirname, '..', 'addon', 'pnl', 'src', 'mocks', 'prod');

/**
 * Fetch a URL and return parsed JSON.
 */
function fetchJson<T = unknown>(url: string): Promise<T> {
  const token = process.env.WEALTHICA_TOKEN;

  return new Promise<T>((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Handle redirects (3xx)
          return fetchJson<T>(res.headers.location).then(resolve).catch(reject);
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as T;
            resolve(json);
          } catch (err) {
            reject(new Error(`Failed to parse JSON from ${url}: ${(err as Error).message}`));
          }
        });
      },
    );

    req.on('error', reject);
  });
}

/**
 * Write JSON data to file with pretty formatting.
 */
function writeJsonFile(filename: string, data: unknown): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, filename);
  const jsonString = JSON.stringify(data, null, 2);
  return fs.promises.writeFile(filePath, jsonString, 'utf8');
}

async function ensureOutputDir(): Promise<void> {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

async function main(): Promise<void> {
  const token = process.env.WEALTHICA_TOKEN;
  if (!token) {
    console.error(
      `\nERROR: The WEALTHICA_TOKEN environment variable is not set.\n` +
        `Please provide a valid token, e.g.\n` +
        `  WEALTHICA_TOKEN=<your-token> npm run download-prod-data\n`,
    );
    process.exit(1);
  }

  await ensureOutputDir();

  for (const { filename, url } of resources) {
    process.stdout.write(`Fetching ${url} ... `);
    try {
      const data = await fetchJson(url);
      await writeJsonFile(filename, data);
      process.stdout.write(`saved to ${filename}\n`);
    } catch (err) {
      process.stdout.write('failed\n');
      console.error(`  Error: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
