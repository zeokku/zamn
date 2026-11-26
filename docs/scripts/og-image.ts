// Writes the cards made from the homepage's hero, `.zamn` and "HTML without
// the <angle brackets>" on the left and the logo on the right, screenshotted
// from the docs' dev server so they are drawn with the site's own fonts and
// styles:
//
// - docs/public/og.jpg: the link preview (Open Graph, Twitter) of every page
// - assets/readme-header.jpg: the header of the repository's README
//
//   bun run docs:og
//
// Needs Playwright's Chromium: `bunx playwright install chromium --only-shell`.
import { chromium, type Browser } from "playwright";
import { createServer } from "vitepress";
import { fileURLToPath } from "node:url";

const fromDocs = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Card {
  out: string;
  width: number;
  height: number;
  padding: number;
  fontSize: number;
  logoWidth: number;
  /** Device pixels per CSS pixel. */
  scale: number;
}

const cards: Card[] = [
  // The size Open Graph and Twitter's large card expect. Feeds show it at
  // 500-600px, so 1x is already 2x there. The text and the logo share the
  // width in the golden ratio: 1024px inside the padding, less the 48px gap,
  // is 603 and 373.
  { out: fromDocs("public/og.jpg"), width: 1200, height: 630, padding: 88, fontSize: 74, logoWidth: 373, scale: 1 },
  // Wide and short, to sit above the README's text. GitHub shows it about
  // 900px wide: at 2x, sharp on high-density screens.
  {
    out: fromDocs("../assets/readme-header.jpg"),
    width: 1280,
    height: 400,
    padding: 96,
    fontSize: 72,
    logoWidth: 340,
    scale: 2,
  },
];

// Only the hero's heading and logo, centred in the card. The heading takes the
// width the logo leaves, and its font size is what wraps it as on the
// homepage: "HTML without the", then "<angle brackets>", kept whole; not
// VitePress's 36rem cap on the heading, which broke "the" off at 72px. Lines
// fill before they break: the homepage's balanced wrapping made "HTML
// without" and "the <angle brackets>" in the wide README header.
const css = ({ height, padding, fontSize, logoWidth }: Card) => `
  .VPNav, .VPLocalNav, .VPSkipLink, .VPFooter,
  .VPHero .tagline, .VPHero .actions,
  .VPHome > :not(.VPHero) { display: none !important; }
  .VPContent { padding-top: 0 !important; }
  .VPHero {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    height: ${height}px;
    margin: 0 !important;
    padding: 0 ${padding}px !important;
  }
  .VPHero .container { width: 100%; max-width: none; align-items: center; gap: 48px; }
  .VPHero .main { flex: 1 1 0; width: auto; min-width: 0; max-width: none !important; }
  .VPHero .name, .VPHero .text {
    max-width: none;
    font-size: ${fontSize}px;
    line-height: 1.12;
    text-wrap-style: auto;
  }
  .VPHero .text .angle { white-space: nowrap; }
  .VPHero .image { flex: none; min-height: 0; }
  .VPHero.has-image .image-container { width: auto; height: auto; }
  .VPHero .image img { width: ${logoWidth}px; }
`;

async function shoot(browser: Browser, url: string, card: Card) {
  const page = await browser.newPage({
    viewport: { width: card.width, height: card.height },
    deviceScaleFactor: card.scale,
    colorScheme: "dark",
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: css(card) });
  await page.evaluate(() => document.fonts.ready);
  // JPEG: the background's soft gradients made a 2x PNG near 900 KB.
  await page.screenshot({ path: card.out, type: "jpeg", quality: 90 });
  await page.close();
  console.log(`og: wrote ${card.out}`);
}

const server = await createServer(fromDocs(""), { port: 0 });
await server.listen();
const { port } = server.httpServer!.address() as { port: number };
const browser = await chromium.launch();
try {
  for (const card of cards) await shoot(browser, `http://localhost:${port}${server.config.base}`, card);
} finally {
  await browser.close();
  await server.close();
}
