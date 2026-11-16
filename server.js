// WiCi website server (Express).
// Pages are built from templates in content/:
//   content/layout.html          shared <html> shell
//   content/partials/nav.html    shared header
//   content/partials/footer.html shared footer
//   content/<page>/              per-page head.html, main.html, scripts.html, meta.json
//   content/routes.json          route -> page folder
// Static files (css, js, images, video) come from public/.

const fs = require('fs');
const path = require('path');
const express = require('express');

const CONTENT = path.join(__dirname, 'content');
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const read = (p) => fs.readFileSync(path.join(CONTENT, p), 'utf8');
const layout = read('layout.html');
const layoutBare = read('layout-bare.html');
const nav = read('partials/nav.html');
const footer = read('partials/footer.html');
const routes = JSON.parse(read('routes.json'));

// Build one page: fill the layout, and mark the nav link for this page as current.
function render(route, slug) {
  const meta = JSON.parse(read(path.join(slug, 'meta.json')));
  const navHtml = nav.split(`href="${route}" class="`).join(`href="${route}" class="is-current `);
  if (meta.layout === 'bare') {
    return layoutBare
      .replace('{{head}}', read(path.join(slug, 'head.html')))
      .replace('{{bodyClass}}', meta.bodyClass)
      .replace('{{main}}', read(path.join(slug, 'main.html')));
  }
  return layout
    .replace('{{head}}', read(path.join(slug, 'head.html')))
    .replace('{{bodyClass}}', meta.bodyClass)
    .replace('{{mainAttrs}}', meta.mainAttrs)
    .replace('{{nav}}', navHtml)
    .replace('{{main}}', read(path.join(slug, 'main.html')))
    .replace('{{footer}}', footer)
    .replace('{{scripts}}', read(path.join(slug, 'scripts.html')));
}

const app = express();

// Template routes first, so they win over any static .html file.
for (const [route, slug] of Object.entries(routes)) {
  const html = render(route, slug); // built once at startup
  app.get(route, (req, res) => res.type('html').send(html));
}

app.use(express.static(PUBLIC, { extensions: ['html'], index: 'index.html' }));

// Analytics or other POSTs to this server: accept and ignore.
app.post('*', (req, res) => res.sendStatus(204));

// Anything else: a plain 404 page.
app.use((req, res) => {
  res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><title>Not found</title>' +
    '<h1>Page not found</h1><p><a href="/">Back to WiCi</a></p>'
  );
});

app.listen(PORT, () => console.log(`WiCi site running at http://localhost:${PORT}`));
