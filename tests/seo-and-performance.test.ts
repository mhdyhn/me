import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('SEO, Performance & Metadata Audit', () => {
  it('index.html contains full Persian SEO, Open Graph, Twitter and Schema.org tags', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('<meta name="title"');
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<meta name="keywords"');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:image"');
    expect(html).toContain('<meta name="twitter:card"');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('WebApplication');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('rel="preconnect"');
  });

  it('public/robots.txt and public/sitemap.xml exist and are well-formed', () => {
    const robotsPath = path.resolve(__dirname, '../public/robots.txt');
    const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');

    expect(fs.existsSync(robotsPath)).toBe(true);
    expect(fs.existsSync(sitemapPath)).toBe(true);

    const robots = fs.readFileSync(robotsPath, 'utf8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Sitemap:');

    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain('https://meety-985n.onrender.com/');
    expect(sitemap).toContain('/exercises');
    expect(sitemap).toContain('/program');
  });
});
