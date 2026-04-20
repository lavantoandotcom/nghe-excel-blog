require('dotenv').config();
const express = require('express');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3002;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(express.static(path.join(__dirname, 'public')));

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

// Convert Editor.js JSON content → HTML
function editorJsToHtml(content) {
  if (!content) return '<p>Nội dung đang được cập nhật...</p>';

  let blocks;
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    blocks = parsed.blocks ?? [];
  } catch {
    // Not Editor.js JSON — treat as plain text
    return `<p>${escHtml(content)}</p>`;
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
function layout({ title, description, ogImage, canonical, bodyHtml }) {
  const desc = description || 'Bài viết, video hướng dẫn và bài tập Excel có lời giải từ Nghề Excel.';
  const og   = ogImage || 'https://blog.ngheexcel.com/og-default.jpg';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(desc)}"/>
  <!-- Open Graph — for Facebook, Zalo share -->
  <meta property="og:title"       content="${escHtml(title)}"/>
  <meta property="og:description" content="${escHtml(desc)}"/>
  <meta property="og:image"       content="${escHtml(og)}"/>
  <meta property="og:type"        content="website"/>
  <meta property="og:locale"      content="vi_VN"/>
  ${canonical ? `<link rel="canonical" href="${escHtml(canonical)}"/>` : ''}
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800;900&family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/style.css"/>
</head>
<body>

<!-- HEADER -->
<header class="site-header" role="banner">
  <div class="container">
    <nav class="nav" aria-label="Navigation chính">
      <a href="/" class="nav__logo" aria-label="Nghề Excel Blog — Trang chủ">
        <span class="nav__logo-text">Nghề <span>Excel</span></span>
      </a>
      <ul class="nav__links" role="list">
        <li><a href="/#bai-viet" class="nav__link">Bài viết</a></li>
        <li><a href="/#video"    class="nav__link">Video</a></li>
        <li><a href="/#bai-tap"  class="nav__link">Bài tập</a></li>
        <li><a href="/#chu-de"   class="nav__link">Chủ đề</a></li>
        <li><a href="https://ngheexcel.com" class="nav__link" target="_blank" rel="noopener">Khoá học</a></li>
      </ul>
      <div class="nav__actions">
        <a href="/#nhan-tai-lieu" class="nav__cta">Nhận tài liệu miễn phí</a>
        <button class="nav__burger" aria-label="Mở menu" aria-expanded="false" id="burgerBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </nav>
  </div>
  <div class="nav__drawer" id="mobileDrawer" role="navigation">
    <a href="/#bai-viet" class="nav__link">Bài viết</a>
    <a href="/#video"    class="nav__link">Video</a>
    <a href="/#bai-tap"  class="nav__link">Bài tập</a>
    <a href="/#chu-de"   class="nav__link">Chủ đề</a>
    <a href="https://ngheexcel.com" class="nav__link" target="_blank" rel="noopener">Khoá học</a>
    <a href="/#nhan-tai-lieu" class="nav__cta">Nhận tài liệu miễn phí</a>
  </div>
</header>

${bodyHtml}

<!-- FOOTER -->
<footer class="footer" role="contentinfo">
  <div class="container">
    <div class="footer__grid">
      <div>
        <div class="footer__brand-logo">
          <span class="footer__brand-logo-text">Nghề <span>Excel</span></span>
        </div>
        <p class="footer__brand-desc">Nền tảng học Excel thực chiến bằng tiếng Việt. Từ hàm cơ bản đến dashboard nâng cao — tất cả đều có lời giải chi tiết.</p>
        <div class="footer__socials">
          <a href="#" class="footer__social" aria-label="YouTube Nghề Excel">
            <svg viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" style="fill:var(--brand-dark)"/></svg>
          </a>
          <a href="#" class="footer__social" aria-label="Facebook Nghề Excel">
            <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
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

  return `<article class="post-card${wideClass} reveal">
  <a href="${postUrl(post)}" class="post-card__thumb" tabindex="-1" aria-hidden="true">
    <div class="thumb-placeholder ${thumbClass(post.type)}">${thumbIconSvg(post.type)}</div>
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
          <a href="#bai-viet" class="hero__btn-ghost">Xem tất cả bài</a>
        </div>
      </div>
      <div class="hero__card" aria-hidden="true">
        <div class="hero__card-thumb">
          <span class="hero__card-thumb-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          </span>
        </div>
        <div class="hero__card-body">
          <div class="hero__card-badge">${featured ? badgeHtml(featured.type) : '<span class="badge badge--green">Bài viết</span>'}</div>
          <p class="hero__card-title">${featured ? escHtml(featured.title) : 'Nội dung mới nhất từ Nghề Excel'}</p>
          <div class="hero__card-meta">
            ${featured?.reading_time ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escHtml(featured.reading_time)}</span>` : ''}
            ${featured ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatDate(featured.created_at)}</span>` : ''}
          </div>
        </div>
      </div>
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
        <div class="stat__info"><span class="stat__num">15,000+</span><span class="stat__label">Học viên theo dõi</span></div>
      </div>
    </div>
  </div>
</div>

<!-- CONTENT SECTION -->
<section class="content-section" id="bai-viet" aria-labelledby="content-heading">
  <div class="container">
    <div class="section-header">
      <div>
        <p class="section-label">Nội dung mới nhất</p>
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

<!-- TOPICS -->
${allTags.length ? `
<section class="topics-section" id="chu-de" aria-labelledby="topics-heading">
  <div class="container">
    <div class="section-header">
      <div>
        <p class="section-label">Khám phá theo chủ đề</p>
        <h2 class="section-title" id="topics-heading">Học theo chủ đề bạn cần</h2>
      </div>
    </div>
    <nav class="topics-grid">
      ${allTags.map(tag => `<a href="/?tag=${encodeURIComponent(tag)}" class="topic-pill reveal">${escHtml(tag)}</a>`).join('')}
    </nav>
  </div>
</section>` : ''}

<!-- NEWSLETTER -->
<section class="newsletter-section" id="nhan-tai-lieu">
  <div class="container">
    <div class="newsletter-inner">
      <div>
        <p class="newsletter-label">Miễn phí 100%</p>
        <h2 class="newsletter-title">Nhận <span>Tài Liệu Excel</span><br>Miễn Phí Mỗi Tuần</h2>
        <p class="newsletter-desc">Đăng ký để nhận bài viết mới, video hướng dẫn và bộ bài tập Excel được tuyển chọn kỹ mỗi tuần.</p>
      </div>
      <div>
        <div class="newsletter-perks">
          <div class="newsletter-perk">
            <div class="newsletter-perk__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg></div>
            <span class="newsletter-perk__text">Cheat sheet 50 hàm Excel thông dụng nhất (PDF)</span>
          </div>
          <div class="newsletter-perk">
            <div class="newsletter-perk__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg></div>
            <span class="newsletter-perk__text">Template dashboard Excel sẵn dùng (file .xlsx)</span>
          </div>
          <div class="newsletter-perk">
            <div class="newsletter-perk__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>
            <span class="newsletter-perk__text">Video hướng dẫn độc quyền cho subscriber</span>
          </div>
        </div>
        <form class="newsletter-form" id="newsletterForm">
          <label for="email-input" class="sr-only">Địa chỉ email</label>
          <input type="email" id="email-input" name="email" placeholder="email@cuaban.com" autocomplete="email" required/>
          <button type="submit">Nhận tài liệu</button>
        </form>
        <p class="newsletter-note">Không spam. Bỏ đăng ký bất cứ lúc nào.</p>
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

  res.send(layout({
    title: 'Blog — Nghề Excel | Học Excel từ cơ bản đến nâng cao',
    description: 'Bài viết, video hướng dẫn và bài tập Excel có lời giải từ Nghề Excel. Học Excel thực chiến, áp dụng ngay vào công việc.',
    canonical: 'https://blog.ngheexcel.com',
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

  // Video embed block for video posts
  const videoBlock = isVideo && post.video_url
    ? `<div class="video-embed" style="margin-bottom:32px">
        <iframe src="${escHtml(post.video_url.replace('watch?v=', 'embed/'))}" allowfullscreen></iframe>
       </div>`
    : '';

  const bodyHtml = `
<!-- POST HERO -->
<section class="post-hero">
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

  res.send(layout({
    title: `${post.title} — Nghề Excel`,
    description: post.excerpt || `Bài viết về ${post.title} từ Nghề Excel.`,
    canonical: `https://blog.ngheexcel.com/post/${post.slug}`,
    bodyHtml,
  }));
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Blog Nghề Excel đang chạy tại http://localhost:${PORT}\n`);
});
