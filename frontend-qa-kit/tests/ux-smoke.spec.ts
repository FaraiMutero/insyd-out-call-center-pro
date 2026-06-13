import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';

/**
 * UX smoke suite — config-driven, identical across all client apps.
 * Catches the "small UX issues" class: console errors, broken links,
 * a11y violations, missing alt text, horizontal overflow, layout shift.
 * Failures are written to qa-report/ux-issues.json for the agent fix-loop.
 */
const cfg = JSON.parse(fs.readFileSync('qa.config.json', 'utf-8'));
const issues: object[] = [];

test.afterAll(() => {
  fs.mkdirSync('qa-report', { recursive: true });
  fs.writeFileSync('qa-report/ux-issues.json', JSON.stringify(issues, null, 2));
});

for (const route of cfg.routes) {
  test.describe(`route: ${route}`, () => {
    test('no console errors or failed requests', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !cfg.ignoreConsolePatterns.some((p: string) => msg.text().includes(p)))
          errors.push(msg.text());
      });
      page.on('requestfailed', (req) => errors.push(`Request failed: ${req.url()}`));
      await page.goto(route, { waitUntil: 'networkidle' });
      if (errors.length) issues.push({ route, type: 'console', detail: errors });
      expect(errors, `Console/network errors on ${route}`).toEqual([]);
    });

    test('accessibility (axe-core)', async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(cfg.axe.runOnly)
        .exclude(cfg.axe.exclude)
        .analyze();
      const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
      if (serious.length)
        issues.push({
          route,
          type: 'a11y',
          detail: serious.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.html).slice(0, 5) })),
        });
      expect(serious, `Serious a11y violations on ${route}`).toEqual([]);
    });

    test('no horizontal overflow on mobile', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'mobile only');
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 1) issues.push({ route, type: 'overflow', detail: `${overflow}px horizontal overflow` });
      expect(overflow, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    });

    test('all images have alt text and load', async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      const bad = await page.evaluate(() =>
        Array.from(document.images)
          .filter((img) => !img.alt || !img.complete || img.naturalWidth === 0)
          .map((img) => img.src || img.outerHTML.slice(0, 120))
      );
      if (bad.length) issues.push({ route, type: 'images', detail: bad });
      expect(bad, `Broken or alt-less images on ${route}`).toEqual([]);
    });

    test('internal links are not dead', async ({ page, request }) => {
      await page.goto(route);
      const hrefs = await page.evaluate(() =>
        Array.from(new Set(Array.from(document.querySelectorAll('a[href^="/"]')).map((a) => (a as HTMLAnchorElement).href)))
      );
      const dead: string[] = [];
      for (const href of hrefs.slice(0, 30)) {
        const res = await request.get(href).catch(() => null);
        if (!res || res.status() >= 400) dead.push(`${href} → ${res?.status() ?? 'no response'}`);
      }
      if (dead.length) issues.push({ route, type: 'dead-links', detail: dead });
      expect(dead, `Dead links on ${route}`).toEqual([]);
    });
  });
}
