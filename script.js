// client-side script for RSS Summariser

// Helper function to strip HTML tags and decode entities
function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// Helper function to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseDateFromItem(item) {
  const text =
    item.querySelector('pubDate')?.textContent ||
    item.querySelector('published')?.textContent ||
    item.querySelector('updated')?.textContent ||
    item.querySelector('dc\\:date')?.textContent ||
    item.querySelector('date')?.textContent ||
    '';
  const d = new Date(text);
  if (!isNaN(d)) return d;
  return null;
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  try {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

// Call our Cloudflare Worker (which safely uses the API key)
async function summariseText(text) {
  try {
    const res = await fetch('https://rss-summarizer-worker.sahas-shimpi.workers.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    // Carefully handle JSON parsing
    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
      } catch (e) {
      console.error('JSON parse error:', e, 'Response text:', responseText);
      throw new Error('Invalid response from summarisation service');
    }

    // Handle array response format
    if (Array.isArray(data) && data[0] && data[0].summary_text) {
      return data[0].summary_text;
    }

    // Handle direct summary_text format
    if (data && data.summary_text) {
      return data.summary_text;
    }

    throw new Error('Unexpected response format from summarisation service');
  } catch (err) {
    console.error('Summarisation error:', err);
    return `Summarisation failed: ${err.message}`;
  }
}

// the thing for caching articles to not call ai every single tiem and drain my wallet
const FEEDS_KEY = 'feeds';
const CACHE_KEY = 'article_cache';
const READ_KEY = 'read_articles';

function loadFeeds() {
  try { return JSON.parse(localStorage.getItem(FEEDS_KEY)) || []; } catch (_) { return []; }
}

function saveFeeds(feeds) {
  localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds));
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (_) { return {}; }
}

function saveCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function loadRead() {
  try { return JSON.parse(localStorage.getItem(READ_KEY)) || {}; } catch (_) { return {}; }
}

function saveRead(read) {
  localStorage.setItem(READ_KEY, JSON.stringify(read));
}

function renderFeedList() {
  const el = document.getElementById('feed-list');
  if (!el) return;
  const feeds = loadFeeds();
  const countEl = document.getElementById('feed-count');
  if (countEl) countEl.textContent = String(feeds.length);
  el.innerHTML = '';
  if (!feeds.length) return;
  const frag = document.createDocumentFragment();
  feeds.forEach((u) => {
    const d = document.createElement('div');
    d.className = 'feed-item';
    d.innerHTML = `
      <span class="feed-url" title="${escapeHtml(u)}">${escapeHtml(u)}</span>
      <button class="feed-delete" data-url="${escapeHtml(u)}" title="Remove feed"><span class="material-symbols-rounded">close</span></button>
    `;
    frag.appendChild(d);
  });
  el.appendChild(frag);
}

function renderArticles() {
  const output = document.getElementById('summary-result');
  if (!output) return;
  const cache = loadCache();
  const read = loadRead();
  const items = Object.keys(cache)
    .map((k) => cache[k])
    .filter((it) => !read[it.url]); // Only show unread articles
  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const container = document.createElement('div');
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'article-summary';
    const dateStr = formatDate(new Date(item.date));
    if (!item.summary) {
      div.innerHTML = `
        <div class="article-header">
          <strong class="article-title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a></strong>
          <span class="article-date">${escapeHtml(dateStr || '')}</span>
        </div>
        <button class="mark-read" data-url="${escapeHtml(item.url)}" title="Mark as read"><span class="material-symbols-rounded">done</span></button>
        <p class="article-body"><span class="material-symbols-rounded spinner">autorenew</span> Summarising...</p>
      `;
    } else {
      div.innerHTML = `
        <div class="article-header">
          <strong class="article-title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a></strong>
          <span class="article-date">${escapeHtml(dateStr || '')}</span>
        </div>
        <button class="mark-read" data-url="${escapeHtml(item.url)}" title="Mark as read"><span class="material-symbols-rounded">done</span></button>
        <p class="article-body">${escapeHtml(item.summary)}</p>
      `;
    }
    container.appendChild(div);
  });
  output.innerHTML = '';
  output.appendChild(container);
}

async function fetchFeedContents(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Direct fetch failed');
    return await res.text();
  } catch (err) {
    const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (!proxyRes.ok) throw new Error('Proxy fetch failed');
    const data = await proxyRes.json();
    return data.contents || '';
  }
}

function parseXml(text) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text || '', 'text/xml');
  const parseError = xml.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid RSS feed format');
  }
  return xml;
}

function getItemLink(item) {
  const linkEl = item.querySelector('link');
  const href = linkEl?.getAttribute && linkEl.getAttribute('href');
  return (linkEl?.textContent || href || item.querySelector('guid')?.textContent || '').trim();
}

function getItemTitle(item) {
  return stripHtml(item.querySelector('title')?.textContent || '');
}

function getItemDescription(item) {
  const d =
    item.querySelector('description')?.textContent ||
    item.querySelector('content')?.textContent ||
    item.querySelector('content\\:encoded')?.textContent ||
    item.querySelector('summary')?.textContent ||
    '';
  return stripHtml(d);
}

async function fetchAndProcessFeed(feedUrl) {
  const text = await fetchFeedContents(feedUrl);
  const xml = parseXml(text);
  const nodes = Array.from(xml.querySelectorAll('item, entry')).slice(0, 5); // Always get first 5
  if (nodes.length === 0) {
    throw new Error('Nothing found here... check if you have the right URL');
  }
  const cache = loadCache();
  const read = loadRead(); // Load read articles to skip them
  
  for (let item of nodes) {
    const url = getItemLink(item);
    if (!url) continue;
    const pubDate = parseDateFromItem(item);
    
    // If article exists in cache
    if (cache[url]) {
      // Update date if available
      if (pubDate) {
        cache[url].date = pubDate.toISOString();
        saveCache(cache);
      }
      continue; // Skip already cached articles
    }
    
    // Skip if marked as read (shouldn't happen but safety check)
    if (read[url]) continue;
    
    const title = getItemTitle(item);
    const description = getItemDescription(item);
    
    // Add to cache without summary first
    cache[url] = {
      url,
      title,
      date: pubDate ? pubDate.toISOString() : '',
      summary: ''
    };
    saveCache(cache);
    renderArticles();
    
    // Summarize the article
    const summary = await summariseText(`${title}\n\n${description}`);
    cache[url].summary = summary;
    saveCache(cache);
    renderArticles();
  }
}

async function checkFeedsForUpdates() {
  const feeds = loadFeeds();
  for (const f of feeds) {
    try { 
      await fetchAndProcessFeed(f); // This will check for new articles and summarize them
    } catch (_) {}
  }
}

// Form submit handler
document.getElementById('rss-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const button = e.target.querySelector('button');
  const url = document.getElementById('rss-url').value.trim();
  const output = document.getElementById('summary-result');

  if (!url) {
    output.innerHTML = 'Please enter a valid RSS feed URL';
    return;
  }

  // disable button and show loading
  button.disabled = true;
  button.innerHTML = '<span class="material-symbols-rounded">add</span>';
  output.innerHTML = `
    <div id="loading-indicator" style="text-align:center; margin:20px 0;">
      <span class="material-symbols-rounded spinner">autorenew</span>
      <p>Loading articles...</p>
    </div>
  `;

  let feeds = loadFeeds();
  if (!feeds.includes(url)) {
    feeds = [...feeds, url];
    saveFeeds(feeds);
    renderFeedList();
  }

  try {
    // Try direct fetch first
    await fetchAndProcessFeed(url);
    // Fall back to CORS proxy
    renderArticles();
    // Check for XML parsing errors
  } catch (err) {
    output.innerHTML = `Error: ${err.message}`;
  } finally {
    // replace spinner with results
    renderArticles();
    // re-enable button
    button.disabled = false;
    button.innerHTML = '<span class="material-symbols-rounded">add</span>';
  }
});

// Dark mode toggle
const toggleBtn = document.getElementById('dark-mode-toggle');
const icon = document.getElementById('dark-mode-icon');

// Initialize theme
const savedTheme = localStorage.getItem('theme');
if (
  savedTheme === 'dark' ||
  (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
) {
  document.body.classList.add('dark-mode');
  icon.textContent = 'light_mode';
}

// Theme toggle handler with animation
toggleBtn.addEventListener('click', () => {
  // Add rotation animation
  icon.style.transform = 'rotate(360deg)';
  icon.style.transition = 'transform 0.5s ease';
  
  setTimeout(() => {
    icon.style.transform = 'rotate(0deg)';
  }, 500);
  
  document.body.classList.toggle('dark-mode');
  if (document.body.classList.contains('dark-mode')) {
    icon.textContent = 'light_mode';
    localStorage.setItem('theme', 'dark');
  } else {
    icon.textContent = 'dark_mode';
    localStorage.setItem('theme', 'light');
  }
});

document.addEventListener('click', (e) => {
  const target = e.target.closest('.mark-read');
  if (!target) return;
  const url = target.getAttribute('data-url');
  if (!url) return;
  const read = loadRead();
  read[url] = true;
  saveRead(read);
  renderArticles();
});

document.addEventListener('click', (e) => {
  const del = e.target.closest('.feed-delete');
  if (!del) return;
  const url = del.getAttribute('data-url');
  if (!url) return;
  let feeds = loadFeeds();
  if (!feeds.includes(url)) return;
  feeds = feeds.filter((f) => f !== url);
  saveFeeds(feeds);
  renderFeedList();
});

document.addEventListener('DOMContentLoaded', async () => {
  renderFeedList();
  renderArticles();
  try { await checkFeedsForUpdates(); } catch (_) {}
  renderArticles();
});

//sometimes... your js js gets a bit too long
//    (...your javascript just...)
// yeah