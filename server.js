require('dotenv').config();
const express = require('express');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');
const { marked }       = require('marked');

marked.setOptions({ breaks: true, gfm: true });

const app  = express();
const PORT = process.env.PORT || 3002;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn('[warning] Missing SUPABASE_URL or SUPABASE_ANON_KEY env var — database routes will fail but /health will still respond.');
}

const supabase = createClient(
  process.env.SUPABASE_URL     || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder'
);

app.use(express.static(path.join(__dirname, 'public')));

// Health check — không phụ thuộc Supabase
app.get('/health', (_req, res) => res.status(200).send('ok'));

// ── robots.txt ────────────────────────────────────────────────────
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /health

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

// ── sitemap.xml ───────────────────────────────────────────────────
app.get('/sitemap.xml', async (_req, res) => {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('slug, updated_at, created_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[sitemap] Supabase error:', error.message);
    return res.status(500).send('sitemap error');
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'daily',  priority: '1.0' },
    ...(posts ?? []).map(p => ({
      loc: `${SITE_URL}/post/${p.slug}`,
      lastmod: (p.updated_at || p.created_at || today).slice(0, 10),
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${escHtml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.type('application/xml').send(xml);
});

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SITE_URL  = process.env.SITE_URL  || 'https://blog.ngheexcel.com';
const SITE_NAME = 'Nghề Excel Blog';

function stripHtml(input) {
  if (!input) return '';
  let text = String(input);
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.blocks) {
        text = parsed.blocks
          .map(b => b.data?.text || b.data?.code || (b.data?.items ?? []).join(' ') || '')
          .join(' ');
      }
    } catch { /* ignore */ }
  }
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 160) {
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

function postUrl(post) {
  return `/post/${post.slug}`;
}

function thumbClass(type) {
  if (type === 'video')    return 'thumb-placeholder--dark';
  if (type === 'exercise') return 'thumb-placeholder--yellow';
  return 'thumb-placeholder--green';
}

function relatedThumbClass(type) {
  if (type === 'video')    return 'related-post__thumb--dark';
  if (type === 'exercise') return 'related-post__thumb--yellow';
  return 'related-post__thumb--green';
}

function badgeHtml(type) {
  if (type === 'video')
    return '<span class="badge badge--blue">Video YouTube</span>';
  if (type === 'exercise')
    return '<span class="badge badge--yellow">Bài tập</span>';
  return '<span class="badge badge--green">Bài viết</span>';
}

function thumbIconSvg(type) {
  if (type === 'video')
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
  if (type === 'exercise')
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>';
}

// Render post content → HTML. Supports: Editor.js JSON, Markdown, plain text
function editorJsToHtml(content) {
  if (!content) return '<p>Nội dung đang được cập nhật...</p>';

  let blocks = null;
  if (typeof content === 'object' && content !== null) {
    blocks = content.blocks ?? null;
  } else if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        blocks = parsed.blocks ?? null;
      } catch { /* not JSON — fall through to markdown */ }
    }
  }

  if (!blocks) {
    // Render as markdown (supports GFM: headings, bold, lists, tables, code, links)
    return marked.parse(String(content));
  }

  return blocks.map(block => {
    const d = block.data ?? {};
    switch (block.type) {
      case 'paragraph':
        return `<p>${d.text ?? ''}</p>`;

      case 'header': {
        const lvl = Math.min(Math.max(d.level ?? 2, 1), 6);
        return `<h${lvl}>${escHtml(d.text)}</h${lvl}>`;
      }

      case 'list': {
        const tag  = d.style === 'ordered' ? 'ol' : 'ul';
        const items = (d.items ?? []).map(item => {
          const text = typeof item === 'string' ? item : (item.content ?? '');
          return `<li>${text}</li>`;
        }).join('');
        return `<${tag}>${items}</${tag}>`;
      }

      case 'image': {
        const url     = d.file?.url ?? d.url ?? '';
        const caption = d.caption ?? '';
        const stretched = d.stretched ? ' style="width:100%"' : '';
        return `<figure><img src="${escHtml(url)}" alt="${escHtml(caption)}"${stretched}/>${caption ? `<figcaption>${escHtml(caption)}</figcaption>` : ''}</figure>`;
      }

      case 'code':
        return `<pre><code>${escHtml(d.code)}</code></pre>`;

      case 'quote':
        return `<blockquote>${d.text ?? ''}${d.caption ? `<cite>— ${escHtml(d.caption)}</cite>` : ''}</blockquote>`;

      case 'delimiter':
        return '<hr style="border:none;border-top:2px solid var(--border);margin:2em 0">';

      case 'table': {
        if (!d.content?.length) return '';
        const rows = d.content.map((row, i) => {
          const cells = row.map(cell =>
            i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`
          ).join('');
          return `<tr>${cells}</tr>`;
        }).join('');
        return `<table>${rows}</table>`;
      }

      case 'embed': {
        if (d.service === 'youtube') {
          const id = d.embed?.split('embed/')[1]?.split('?')[0] ?? '';
          return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe></div>`;
        }
        return `<div class="video-embed"><iframe src="${escHtml(d.embed)}" allowfullscreen></iframe></div>`;
      }

      case 'raw':
        return d.html ?? '';

      default:
        return '';
    }
  }).join('\n');
}

// ── Shared layout ─────────────────────────────────────────────────
function layout({
  title,
  description,
  ogImage,
  ogType = 'website',
  canonical,
  keywords,
  author = 'Nghề Excel',
  publishedTime,
  modifiedTime,
  jsonLd,
  bodyHtml,
}) {
  const desc = truncate(description || 'Bài viết, video hướng dẫn và bài tập Excel có lời giải từ Nghề Excel.', 160);
  const og   = ogImage || `${SITE_URL}/logo_blog.jpg`;
  const url  = canonical || SITE_URL;
  const articleMeta = ogType === 'article' ? `
  ${publishedTime ? `<meta property="article:published_time" content="${escHtml(publishedTime)}"/>` : ''}
  ${modifiedTime  ? `<meta property="article:modified_time"  content="${escHtml(modifiedTime)}"/>`  : ''}
  <meta property="article:author" content="${escHtml(author)}"/>` : '';
  const jsonLdScript = jsonLd
    ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
        .map(obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`)
        .join('\n  ')
    : '';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(desc)}"/>
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"/>
  <meta name="author" content="${escHtml(author)}"/>
  ${keywords ? `<meta name="keywords" content="${escHtml(keywords)}"/>` : ''}
  <!-- Open Graph — for Facebook, Zalo share -->
  <meta property="og:title"       content="${escHtml(title)}"/>
  <meta property="og:description" content="${escHtml(desc)}"/>
  <meta property="og:image"       content="${escHtml(og)}"/>
  <meta property="og:url"         content="${escHtml(url)}"/>
  <meta property="og:type"        content="${escHtml(ogType)}"/>
  <meta property="og:site_name"   content="${escHtml(SITE_NAME)}"/>
  <meta property="og:locale"      content="vi_VN"/>${articleMeta}
  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       content="${escHtml(title)}"/>
  <meta name="twitter:description" content="${escHtml(desc)}"/>
  <meta name="twitter:image"       content="${escHtml(og)}"/>
  ${canonical ? `<link rel="canonical" href="${escHtml(canonical)}"/>` : ''}
  ${jsonLdScript}
  <!-- Favicon -->
  <link rel="icon" type="image/jpeg" href="/logo_blog.jpg"/>
  <link rel="apple-touch-icon" href="/logo_blog.jpg"/>
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800;900&family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/style.css"/>
  <!-- Microsoft Clarity -->
  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "weoc0u731x");
  </script>
</head>
<body>

<!-- HEADER -->
<header class="site-header" role="banner">
  <div class="container">
    <nav class="nav" aria-label="Navigation chính">
      <a href="/" class="nav__logo" aria-label="Nghề Excel Blog — Trang chủ">
        <img src="/logo_blog.jpg" alt="Nghề Excel" width="40" height="40"/>
        <span class="nav__logo-text">Nghề <span>Excel</span></span>
      </a>
      <ul class="nav__links" role="list">
        <li class="nav__item nav__item--dropdown">
          <button class="nav__link nav__link--btn" aria-expanded="false" aria-haspopup="true" id="seriesBtn">
            Series bài viết
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <ul class="nav__dropdown" role="menu" id="seriesDropdown">
            <li><a href="/?series=excel-co-ban"   class="nav__dropdown-link" role="menuitem">Excel cơ bản</a></li>
            <li><a href="/?series=excel-nang-cao"  class="nav__dropdown-link" role="menuitem">Excel nâng cao</a></li>
            <li><a href="/?series=thu-thuat-excel" class="nav__dropdown-link" role="menuitem">Thủ thuật Excel</a></li>
            <li><a href="/?series=kinh-nghiem-excel" class="nav__dropdown-link" role="menuitem">Kinh nghiệm Excel</a></li>
          </ul>
        </li>
        <li><a href="https://ngheexcel.com" class="nav__link nav__link--course" target="_blank" rel="noopener">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          30 Ngày học &amp; thực hành Excel
        </a></li>
      </ul>
      <div class="nav__actions">
        <form class="nav__search" action="/" method="get" role="search">
          <svg class="nav__search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="nav__search-input" type="search" name="q" placeholder="Tìm bài viết..." aria-label="Tìm kiếm bài viết"/>
        </form>
        <a href="https://ngheexcel.com" class="nav__pill-cta" target="_blank" rel="noopener" aria-label="Khóa học 30 ngày học và thực hành Excel">
          <svg class="nav__pill-cta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          <span class="nav__pill-cta-text">30 ngày Excel</span>
        </a>
        <button class="nav__burger" aria-label="Mở menu" aria-expanded="false" id="burgerBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </nav>
  </div>
  <div class="nav__drawer" id="mobileDrawer" role="navigation">
    <form class="nav__search nav__search--mobile" action="/" method="get" role="search">
      <svg class="nav__search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="nav__search-input" type="search" name="q" placeholder="Tìm bài viết..." aria-label="Tìm kiếm bài viết"/>
    </form>
    <button class="nav__link nav__drawer-series-toggle" id="drawerSeriesToggle">
      Series bài viết
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="nav__drawer-submenu" id="drawerSubmenu" hidden>
      <a href="/?series=excel-co-ban"     class="nav__link nav__link--sub">Excel cơ bản</a>
      <a href="/?series=excel-nang-cao"   class="nav__link nav__link--sub">Excel nâng cao</a>
      <a href="/?series=thu-thuat-excel"  class="nav__link nav__link--sub">Thủ thuật Excel</a>
      <a href="/?series=kinh-nghiem-excel" class="nav__link nav__link--sub">Kinh nghiệm Excel</a>
    </div>
    <a href="https://ngheexcel.com" class="nav__link nav__link--course" target="_blank" rel="noopener">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      30 Ngày học &amp; thực hành Excel
    </a>
  </div>
</header>

<!-- Mobile bottom sticky CTA bar -->
<aside class="course-bar" id="courseBar" role="complementary" aria-label="Đề xuất khóa học 30 ngày Excel" hidden>
  <a class="course-bar__link" href="https://ngheexcel.com" target="_blank" rel="noopener">
    <span class="course-bar__icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
    </span>
    <span class="course-bar__text">
      <strong class="course-bar__title">30 ngày học Excel thực chiến</strong>
      <span class="course-bar__sub">Chỉ từ 5 phút/ngày · 200+ bài tập có lời giải</span>
    </span>
    <span class="course-bar__arrow" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </span>
  </a>
  <button class="course-bar__close" id="courseBarClose" aria-label="Đóng đề xuất khóa học" type="button">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</aside>

${bodyHtml}

<!-- FOOTER -->
<footer class="footer" role="contentinfo">
  <div class="container">
    <div class="footer__grid">
      <div>
        <div class="footer__brand-logo">
          <img src="/logo_blog.jpg" alt="Nghề Excel" width="40" height="40"/>
          <span class="footer__brand-logo-text">Nghề <span>Excel</span></span>
        </div>
        <p class="footer__brand-desc">Nền tảng học Excel thực chiến bằng tiếng Việt. Từ hàm cơ bản đến dashboard nâng cao — tất cả đều có lời giải chi tiết.</p>
        <div class="footer__socials">
          <a href="https://www.youtube.com/@ngheexcel" class="footer__social" aria-label="YouTube Nghề Excel" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </a>
          <a href="https://www.threads.com/@ngheexcel" class="footer__social" aria-label="Threads Nghề Excel" target="_blank" rel="noopener">
            <svg viewBox="0 0 192 192" fill="currentColor"><path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.23c8.248.054 14.474 2.452 18.502 7.13 2.932 3.405 4.893 8.11 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.05-14.127 5.177-6.6 8.452-15.153 9.898-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.35-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.739 7.003 10.07 15.662 12.918 25.725l16.146-4.32c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.195 47.292 9.65 32.788 28.08 19.882 44.485 13.224 67.315 13.001 96c.223 28.685 6.88 51.515 19.788 67.92 14.504 18.43 36.094 27.884 64.208 28.08h.113c24.303-.168 41.412-6.525 55.552-20.653 18.796-18.779 18.26-42.234 12.053-56.629-4.474-10.423-12.964-18.956-23.178-25.73zm-29.55 47.044c-4.888 5.86-12.122 9.048-21.443 9.562-9.716.533-19.207-2.426-25.363-7.936-3.97-3.568-5.987-8.29-5.748-13.264.452-8.506 8.472-17.952 28.928-19.127 2.534-.145 5.017-.215 7.45-.215 5.906 0 11.445.527 16.525 1.542-1.886 11.716-5.564 21.459-10.349 29.438z"/></svg>
          </a>
        </div>
      </div>
      <div>
        <h3 class="footer__col-title">Nội dung</h3>
        <ul class="footer__links">
          <li><a href="/" class="footer__link">Bài viết mới nhất</a></li>
          <li><a href="/#video" class="footer__link">Video YouTube</a></li>
          <li><a href="/#bai-tap" class="footer__link">Bài tập có lời giải</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer__col-title">Chủ đề</h3>
        <ul class="footer__links">
          <li><a href="/#chu-de" class="footer__link">Hàm Excel</a></li>
          <li><a href="/#chu-de" class="footer__link">Pivot Table</a></li>
          <li><a href="/#chu-de" class="footer__link">Dashboard</a></li>
          <li><a href="/#chu-de" class="footer__link">Macro &amp; VBA</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer__col-title">Về chúng tôi</h3>
        <ul class="footer__links">
          <li><a href="https://ngheexcel.com" class="footer__link" target="_blank" rel="noopener">Khoá học Excel</a></li>
          <li><a href="/#nhan-tai-lieu" class="footer__link">Nhận tài liệu miễn phí</a></li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <p class="footer__copy">© ${new Date().getFullYear()} <span>Nghề Excel</span>. Tất cả quyền được bảo lưu.</p>
      <div class="footer__policy">
        <a href="#">Chính sách bảo mật</a>
        <a href="#">Điều khoản sử dụng</a>
      </div>
    </div>
  </div>
</footer>

<script>
  const burger = document.getElementById('burgerBtn');
  const drawer = document.getElementById('mobileDrawer');
  burger.addEventListener('click', () => {
    const open = drawer.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
  });
  drawer.querySelectorAll('a').forEach(l => l.addEventListener('click', () => {
    drawer.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }));

  // Desktop dropdown
  const seriesBtn = document.getElementById('seriesBtn');
  const seriesDropdown = document.getElementById('seriesDropdown');
  if (seriesBtn && seriesDropdown) {
    seriesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = seriesDropdown.classList.toggle('is-open');
      seriesBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => {
      seriesDropdown.classList.remove('is-open');
      seriesBtn.setAttribute('aria-expanded', 'false');
    });
  }

  // Mobile drawer submenu
  const drawerSeriesToggle = document.getElementById('drawerSeriesToggle');
  const drawerSubmenu = document.getElementById('drawerSubmenu');
  if (drawerSeriesToggle && drawerSubmenu) {
    drawerSeriesToggle.addEventListener('click', () => {
      const open = !drawerSubmenu.hidden;
      drawerSubmenu.hidden = open;
      drawerSeriesToggle.classList.toggle('is-open', !open);
    });
  }

  // Mobile bottom CTA bar — show after user scrolls past hero
  (function () {
    const bar = document.getElementById('courseBar');
    const closeBtn = document.getElementById('courseBarClose');
    if (!bar || !closeBtn) return;
    const dismissed = sessionStorage.getItem('courseBarDismissed') === '1';
    if (dismissed) return;
    let ticking = false;
    let isVisible = false;
    function update() {
      ticking = false;
      const shouldShow = window.scrollY > 300 && window.matchMedia('(max-width: 768px)').matches;
      if (shouldShow && !isVisible) {
        bar.hidden = false;
        // next frame to allow display change before transition
        requestAnimationFrame(() => bar.classList.add('is-visible'));
        isVisible = true;
      } else if (!shouldShow && isVisible) {
        bar.classList.remove('is-visible');
        isVisible = false;
      }
    }
    function onScroll() {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sessionStorage.setItem('courseBarDismissed', '1');
      bar.classList.remove('is-visible');
      setTimeout(() => { bar.hidden = true; }, 250);
      window.removeEventListener('scroll', onScroll);
    });
  })();

  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), i * 60);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }
</script>
</body>
</html>`;
}

// ── Post card HTML ────────────────────────────────────────────────
function postCardHtml(post, wide = false) {
  const isVideo    = post.type === 'video';
  const isExercise = post.type === 'exercise';

  const videoOverlay = isVideo
    ? `<div class="play-overlay" aria-hidden="true"><div class="play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div></div>
       ${post.duration ? `<span class="duration-badge">${escHtml(post.duration)}</span>` : ''}`
    : '';

  const dlBadge = isExercise && post.download_label
    ? `<span class="download-badge"><svg viewBox="0 0 24 24" fill="#fff"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" stroke-width="2"/></svg>${escHtml(post.download_label)}</span>`
    : '';

  const statSvg = isExercise
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    : isVideo
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  const statTxt = isExercise
    ? `${(post.download_count || 0).toLocaleString('vi')} lượt tải`
    : isVideo
    ? `${(post.view_count || 0).toLocaleString('vi')} lượt xem`
    : (post.reading_time || '');

  const wideClass = wide ? ' post-card--wide' : '';

  const thumbInner = post.banner_url
    ? `<img src="${escHtml(post.banner_url)}" alt="${escHtml(post.banner_alt || post.title)}" loading="lazy"/>`
    : `<div class="thumb-placeholder ${thumbClass(post.type)}">${thumbIconSvg(post.type)}</div>`;

  return `<article class="post-card${wideClass} reveal">
  <a href="${postUrl(post)}" class="post-card__thumb" tabindex="-1" aria-hidden="true">
    ${thumbInner}
    ${videoOverlay}${dlBadge}
  </a>
  <div class="post-card__body">
    <div class="post-card__top">${badgeHtml(post.type)}</div>
    <h3 class="post-card__title"><a href="${postUrl(post)}">${escHtml(post.title)}</a></h3>
    <p class="post-card__excerpt">${escHtml(post.excerpt || '')}</p>
    <div class="post-card__footer">
      <span class="post-card__date">${formatDate(post.created_at)}</span>
      <span class="post-card__stat">${statSvg} ${statTxt}</span>
    </div>
  </div>
</article>`;
}

// ── Route: Homepage ───────────────────────────────────────────────
app.get('/', async (req, res) => {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[homepage] Supabase error:', error.message);
    return res.status(500).send('Lỗi tải dữ liệu.');
  }

  const all       = posts.slice(0, 6);
  const articles  = posts.filter(p => p.type === 'article');
  const videos    = posts.filter(p => p.type === 'video');
  const exercises = posts.filter(p => p.type === 'exercise');
  const featured  = posts[0];

  // Collect unique tags across all posts
  const tagSet = new Set();
  posts.forEach(p => (p.tags ?? []).forEach(t => tagSet.add(t)));
  const allTags = [...tagSet].slice(0, 12);

  const heroTitle   = featured ? escHtml(featured.title) : '10 Hàm Excel <em>Quan Trọng Nhất</em><br>Bạn Phải Biết';
  const heroExcerpt = featured ? escHtml(featured.excerpt || '') : 'Từ VLOOKUP đến XLOOKUP — hướng dẫn chi tiết từng hàm kèm ví dụ thực tế từ công việc hàng ngày.';
  const heroHref    = featured ? postUrl(featured) : '#bai-viet';
  const heroMeta    = featured
    ? `<span class="hero__meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escHtml(featured.reading_time || '')}</span>
       <span class="hero__meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(featured.created_at)}</span>`
    : '';

  function tabCards(list) {
    if (!list.length) return '<div class="empty-state"><p>Chưa có nội dung.</p></div>';
    return list.map((p, i) => postCardHtml(p, i === 0 && p.type === 'video')).join('');
  }

  const bodyHtml = `
<!-- HERO -->
<section class="hero" aria-labelledby="hero-title">
  <div class="container">
    <div class="hero__inner">
      <div>
        <div class="hero__eyebrow">
          <div class="hero__eyebrow-dot" aria-hidden="true"></div>
          <span class="hero__eyebrow-text">Bài viết nổi bật</span>
        </div>
        <h1 class="hero__title" id="hero-title">${heroTitle}</h1>
        <p class="hero__excerpt">${heroExcerpt}</p>
        <div class="hero__meta">${heroMeta}</div>
        <div class="hero__actions">
          <a href="${heroHref}" class="hero__btn-primary">
            Đọc bài viết
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>
      </div>
      <a href="${heroHref}" class="hero__card">
        <div class="hero__card-thumb">
          ${featured?.banner_url
            ? `<img src="${escHtml(featured.banner_url)}" alt="${escHtml(featured.banner_alt || featured.title)}"/>`
            : `<span class="hero__card-thumb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg></span>`}
        </div>
        <div class="hero__card-body">
          <div class="hero__card-badge">${featured ? badgeHtml(featured.type) : '<span class="badge badge--green">Bài viết</span>'}</div>
          <p class="hero__card-title">${featured ? escHtml(featured.title) : 'Nội dung mới nhất từ Nghề Excel'}</p>
          <div class="hero__card-meta">
            ${featured?.reading_time ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escHtml(featured.reading_time)}</span>` : ''}
            ${featured ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(featured.created_at)}</span>` : ''}
          </div>
        </div>
      </a>
    </div>
  </div>
</section>

<!-- STATS -->
<div class="stats-strip" aria-label="Thống kê">
  <div class="container">
    <div class="stats-strip__inner">
      <div class="stat">
        <div class="stat__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/></svg></div>
        <div class="stat__info"><span class="stat__num">${articles.length}+</span><span class="stat__label">Bài viết Excel</span></div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <div class="stat__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>
        <div class="stat__info"><span class="stat__num">${videos.length}+</span><span class="stat__label">Video YouTube</span></div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <div class="stat__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
        <div class="stat__info"><span class="stat__num">${exercises.length}+</span><span class="stat__label">Bộ bài tập có lời giải</span></div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <div class="stat__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
        <div class="stat__info"><span class="stat__num">8,000+</span><span class="stat__label">Học viên theo dõi</span></div>
      </div>
    </div>
  </div>
</div>

<!-- CONTENT SECTION -->
<section class="content-section" id="bai-viet" aria-labelledby="content-heading">
  <div class="container">
    <div class="section-header">
      <div>
        <h2 class="section-title" id="content-heading">Bài viết &amp; Video mới</h2>
      </div>
    </div>
    <!-- Filter Tabs -->
    <div class="filter-tabs" role="tablist">
      <button class="filter-tab active" role="tab" aria-selected="true"  aria-controls="tab-all"       data-tab="all">Tất cả <span class="filter-tab__count">${posts.length}</span></button>
      <button class="filter-tab"        role="tab" aria-selected="false" aria-controls="tab-articles"  data-tab="articles">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="8" y1="13" x2="16" y2="13"/></svg>
        Bài viết <span class="filter-tab__count">${articles.length}</span>
      </button>
      <button class="filter-tab"        role="tab" aria-selected="false" aria-controls="tab-videos"    data-tab="videos" id="video">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        Video <span class="filter-tab__count">${videos.length}</span>
      </button>
      <button class="filter-tab"        role="tab" aria-selected="false" aria-controls="tab-exercises" data-tab="exercises" id="bai-tap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Bài tập <span class="filter-tab__count">${exercises.length}</span>
      </button>
    </div>
    <div id="tab-all" class="tab-content active posts-grid" role="tabpanel">${tabCards(all)}</div>
    <div id="tab-articles" class="tab-content posts-grid" role="tabpanel" hidden>${tabCards(articles)}</div>
    <div id="tab-videos" class="tab-content posts-grid" role="tabpanel" hidden>${tabCards(videos)}</div>
    <div id="tab-exercises" class="tab-content posts-grid" role="tabpanel" hidden>${tabCards(exercises)}</div>
  </div>
</section>

<!-- NEWSLETTER -->
<section class="newsletter-section" id="nhan-tai-lieu">
  <div class="container">
    <div class="newsletter-inner">
      <div>
        <h2 class="newsletter-title">Nhận <span>Tài Liệu Excel</span><br>Miễn Phí</h2>
        <p class="newsletter-desc">Đăng ký để nhận bài viết mới, video hướng dẫn và bộ bài tập Excel được tuyển chọn kỹ lưỡng.</p>
      </div>
      <div>
        <div class="newsletter-perks">
          <div class="newsletter-perk">
            <div class="newsletter-perk__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
            <span class="newsletter-perk__text">Bộ bài tập có lời giải ôn luyện phỏng vấn</span>
          </div>
          <div class="newsletter-perk">
            <div class="newsletter-perk__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 7h-3V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg></div>
            <span class="newsletter-perk__text">Bộ bài tập có lời giải theo các chuyên ngành</span>
          </div>
          <div class="newsletter-perk">
            <div class="newsletter-perk__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>
            <span class="newsletter-perk__text">70 video học cấp tốc Excel cơ bản</span>
          </div>
        </div>
        <form class="newsletter-form" id="newsletterForm">
          <label for="email-input" class="sr-only">Địa chỉ email</label>
          <input type="email" id="email-input" name="email" placeholder="email@cuaban.com" autocomplete="email" required/>
          <button type="submit">Nhận tài liệu</button>
        </form>
      </div>
    </div>
  </div>
</section>

<script>
  // Tab switching
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.tab-content').forEach(p => { p.classList.remove('active'); p.hidden = true; });
      tab.classList.add('active'); tab.setAttribute('aria-selected','true');
      const panel = document.getElementById('tab-' + tab.dataset.tab);
      if (panel) { panel.classList.add('active'); panel.hidden = false; }
    });
  });
  // Newsletter
  document.getElementById('newsletterForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const v = this.querySelector('input[type="email"]').value;
    if (!v || !v.includes('@')) return;
    this.innerHTML = '<p style="color:#4ade80;font-family:var(--ff-head);font-weight:700;font-size:16px;padding:8px 0;">Cảm ơn bạn! Kiểm tra email để nhận tài liệu.</p>';
  });
</script>`;

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: 'Học Excel thực chiến — bài viết, video, bài tập có lời giải.',
        inLanguage: 'vi-VN',
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Nghề Excel',
        url: 'https://ngheexcel.com',
        logo: `${SITE_URL}/logo_blog.jpg`,
        sameAs: [
          'https://www.youtube.com/@ngheexcel',
          'https://www.threads.com/@ngheexcel',
        ],
      },
    ],
  };

  res.send(layout({
    title: 'Blog Nghề Excel — Học Excel từ cơ bản đến nâng cao',
    description: 'Bài viết, video hướng dẫn và bài tập Excel có lời giải từ Nghề Excel. Học Excel thực chiến, áp dụng ngay vào công việc.',
    canonical: SITE_URL,
    ogType: 'website',
    keywords: 'học excel, hàm excel, vlookup, pivot table, dashboard, bài tập excel, video excel, nghề excel',
    jsonLd: homeJsonLd,
    bodyHtml,
  }));
});

// ── Route: Post detail ────────────────────────────────────────────
app.get('/post/:slug', async (req, res) => {
  const { slug } = req.params;

  const [{ data: post, error }, { data: related }] = await Promise.all([
    supabase.from('posts').select('*').eq('slug', slug).eq('status', 'published').single(),
    supabase.from('posts').select('id,slug,title,type,created_at').eq('status', 'published').neq('slug', slug).limit(4),
  ]);

  if (error || !post) {
    return res.status(404).send(layout({
      title: 'Không tìm thấy bài viết — Nghề Excel',
      bodyHtml: `<div style="text-align:center;padding:100px 20px">
        <h1 style="font-family:var(--ff-head);font-size:2rem;margin-bottom:16px">Không tìm thấy bài viết</h1>
        <p style="color:var(--ink-3);margin-bottom:28px">Bài viết này không tồn tại hoặc đã bị xóa.</p>
        <a href="/" style="font-family:var(--ff-head);font-weight:700;background:var(--green);color:#fff;padding:12px 28px;border-radius:999px">← Về trang chủ</a>
      </div>`,
    }));
  }

  const contentHtml = editorJsToHtml(post.content);

  const tagsHtml = (post.tags ?? []).length
    ? `<div class="sidebar-card">
        <p class="sidebar-card__title">Chủ đề</p>
        <div class="tags-list">${(post.tags).map(t => `<a href="/?tag=${encodeURIComponent(t)}" class="tag">${escHtml(t)}</a>`).join('')}</div>
       </div>`
    : '';

  const relatedHtml = (related ?? []).length
    ? `<div class="sidebar-card">
        <p class="sidebar-card__title">Bài viết liên quan</p>
        ${related.map(r => `
          <a href="/post/${r.slug}" class="related-post">
            <div class="related-post__thumb ${relatedThumbClass(r.type)}">${thumbIconSvg(r.type)}</div>
            <span class="related-post__title">${escHtml(r.title)}</span>
          </a>`).join('')}
       </div>`
    : '';

  const isVideo    = post.type === 'video';
  const isExercise = post.type === 'exercise';

  const metaItems = [
    post.reading_time
      ? `<span class="post-hero__meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escHtml(post.reading_time)}</span>`
      : '',
    post.created_at
      ? `<span class="post-hero__meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(post.created_at)}</span>`
      : '',
    isVideo && post.duration
      ? `<span class="post-hero__meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>${escHtml(post.duration)}</span>`
      : '',
    isExercise && post.download_count
      ? `<span class="post-hero__meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${(post.download_count).toLocaleString('vi')} lượt tải</span>`
      : '',
  ].filter(Boolean).join('');

  // SEO + image-alt with fallbacks
  const postUrlAbs = `${SITE_URL}/post/${post.slug}`;
  const cleanDesc  = truncate(
    post.meta_description || post.excerpt || stripHtml(post.content) || `Bài viết về ${post.title} từ Nghề Excel.`,
    160
  );
  const ogImg      = post.banner_url || `${SITE_URL}/logo_blog.jpg`;
  const bannerAlt  = post.banner_alt || post.title;
  const tagsArr    = Array.isArray(post.tags) ? post.tags : [];

  // Video embed block for video posts
  const videoBlock = isVideo && post.video_url
    ? `<div class="video-embed" style="margin-bottom:32px">
        <iframe src="${escHtml(post.video_url.replace('watch?v=', 'embed/'))}" allowfullscreen></iframe>
       </div>`
    : '';

  const heroBannerBlock = post.banner_url
    ? `<div class="post-hero__banner"><img src="${escHtml(post.banner_url)}" alt="${escHtml(bannerAlt)}"/></div>`
    : '';

  const bodyHtml = `
<!-- POST HERO -->
<section class="post-hero${post.banner_url ? ' post-hero--has-banner' : ''}">
  <div class="container">
    <div class="post-hero__inner">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Trang chủ</a>
        <span class="breadcrumb__sep" aria-hidden="true">›</span>
        <a href="/#bai-viet">${isVideo ? 'Video' : isExercise ? 'Bài tập' : 'Bài viết'}</a>
        <span class="breadcrumb__sep" aria-hidden="true">›</span>
        <span class="breadcrumb__current">${escHtml(post.title)}</span>
      </nav>
      <div class="post-hero__badge">${badgeHtml(post.type)}</div>
      <h1 class="post-hero__title">${escHtml(post.title)}</h1>
      ${post.excerpt ? `<p class="post-hero__excerpt">${escHtml(post.excerpt)}</p>` : ''}
      <div class="post-hero__meta">${metaItems}</div>
      ${heroBannerBlock}
    </div>
  </div>
</section>

<!-- POST LAYOUT -->
<div class="post-layout">
  <div class="container">
    <div class="post-layout__inner">
      <main>
        ${videoBlock}
        <div class="post-content">${contentHtml}</div>
      </main>
      <aside class="post-sidebar">
        ${tagsHtml}
        ${relatedHtml}
        <div class="sidebar-cta">
          <p class="sidebar-cta__title">Học Excel chuyên nghiệp cùng Nghề Excel</p>
          <p class="sidebar-cta__desc">Khoá học từ cơ bản đến nâng cao, có bài tập thực hành và hỗ trợ trực tiếp.</p>
          <a href="https://ngheexcel.com" class="sidebar-cta__btn" target="_blank" rel="noopener">Xem khoá học →</a>
        </div>
      </aside>
    </div>
  </div>
</div>`;

  const articleType = isVideo ? 'VideoObject' : 'BlogPosting';
  const postJsonLd = {
    '@context': 'https://schema.org',
    '@type': articleType,
    headline: post.title,
    description: cleanDesc,
    image: ogImg,
    datePublished: post.created_at,
    dateModified: post.updated_at || post.created_at,
    author: { '@type': 'Person', name: post.author || 'Nghề Excel' },
    publisher: {
      '@type': 'Organization',
      name: 'Nghề Excel',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo_blog.jpg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': postUrlAbs },
    inLanguage: 'vi-VN',
    ...(tagsArr.length ? { keywords: tagsArr.join(', ') } : {}),
    ...(isVideo && post.video_url ? { contentUrl: post.video_url, embedUrl: post.video_url.replace('watch?v=', 'embed/') } : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ',  item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: isVideo ? 'Video' : isExercise ? 'Bài tập' : 'Bài viết', item: `${SITE_URL}/#bai-viet` },
      { '@type': 'ListItem', position: 3, name: post.title,    item: postUrlAbs },
    ],
  };

  res.send(layout({
    title: `${post.title} | Nghề Excel`,
    description: cleanDesc,
    canonical: postUrlAbs,
    ogType: 'article',
    ogImage: ogImg,
    keywords: tagsArr.join(', ') || undefined,
    author: post.author || 'Nghề Excel',
    publishedTime: post.created_at,
    modifiedTime: post.updated_at || post.created_at,
    jsonLd: [postJsonLd, breadcrumbJsonLd],
    bodyHtml,
  }));
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Blog Nghề Excel đang chạy tại http://0.0.0.0:${PORT}`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? 'set' : 'MISSING'}`);
  console.log(`  SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? 'set' : 'MISSING'}\n`);
});
