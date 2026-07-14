#!/usr/bin/env node
/*
 * Export the printable resume (English + Chinese) to PDF.
 *
 * Reuses the same rendering pipeline the browser "Print Resume" button uses:
 * load the built Hugo page, let print-resume.js run, click the FAB button
 * with window.open overridden so we can capture the popup HTML, then hand
 * that HTML to headless Chrome for PDF export.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'site', 'public');
const OUT_DIR = REPO_ROOT;

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Minimal static server so relative asset URLs and fonts resolve cleanly.
function startStaticServer(rootDir) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.eot':  'application/vnd.ms-fontobject',
    '.xml':  'application/xml; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      const filePath = path.join(rootDir, urlPath);
      if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404); res.end('not found'); return; }
        res.setHeader('Content-Type', mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function exportOne(browser, baseUrl, pagePath, outputPdf, label) {
  const page = await browser.newPage();

  // Override window.open before any page script runs so the print button's
  // popup content is captured in-place instead of opening a real window.
  await page.evaluateOnNewDocument(() => {
    window.__printResumeHtml = null;
    const originalOpen = window.open;
    window.open = function () {
      const fakeWin = {
        document: {
          open() {},
          write(html) { window.__printResumeHtml = (window.__printResumeHtml || '') + html; },
          close() {},
        },
        focus() {},
        close() {},
        print() {},
      };
      return fakeWin;
    };
  });

  const url = baseUrl + pagePath;
  console.log(`[${label}] loading ${url}`);
  await page.goto(url, { waitUntil: 'networkidle0' });

  // The FAB button is injected by print-resume.js on DOMContentLoaded.
  await page.waitForSelector('#print-resume-fab', { timeout: 10000 });

  const html = await page.evaluate(() => {
    document.getElementById('print-resume-fab').click();
    return window.__printResumeHtml;
  });

  if (!html) throw new Error(`[${label}] print-resume popup HTML was empty`);

  // Render the captured HTML in a fresh page and export as PDF using the
  // @page + @media print rules baked into print-resume.js.
  const printPage = await browser.newPage();
  await printPage.setContent(html, { waitUntil: 'networkidle0' });
  await printPage.emulateMediaType('print');
  await printPage.pdf({
    path: outputPdf,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log(`[${label}] wrote ${outputPdf}`);

  await page.close();
  await printPage.close();
}

(async () => {
  const puppeteer = (await import('puppeteer-core')).default;

  if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    console.error(`No built site at ${PUBLIC_DIR} — run \`hugo\` in site/ first.`);
    process.exit(1);
  }

  const { server, baseUrl } = await startStaticServer(PUBLIC_DIR);
  console.log(`static server on ${baseUrl}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    await exportOne(browser, baseUrl, '/',    path.join(OUT_DIR, 'Resume - Sheng Kainan.pdf'),   'EN');
    await exportOne(browser, baseUrl, '/zh/', path.join(OUT_DIR, 'Resume - Sheng Kainan (zh).pdf'), 'ZH');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
