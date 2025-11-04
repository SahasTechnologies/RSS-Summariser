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
async function summarizeText(text) {
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
      throw new Error('Invalid response from summarization service');
    }

    // Handle array response format
    if (Array.isArray(data) && data[0] && data[0].summary_text) {
      return data[0].summary_text;
    }

    // Handle direct summary_text format
    if (data && data.summary_text) {
      return data.summary_text;
    }

    throw new Error('Unexpected response format from summarization service');
  } catch (err) {
    console.error('Summarization error:', err);
    return `Summarization failed: ${err.message}`;
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
  button.innerHTML = '<span class="material-symbols-rounded">search</span>';
  output.innerHTML = `
    <div id="loading-indicator" style="text-align:center; margin:20px 0;">
      <span class="material-symbols-rounded spinner">autorenew</span>
      <p>Loading articles...</p>
    </div>
  `;

  let data;
  try {
    // Try direct fetch first
    const res = await fetch(url);
    if (!res.ok) throw new Error('Direct fetch failed');
    const text = await res.text();
    data = { contents: text };
  } catch (err) {
    // Fall back to CORS proxy
    try {
      const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (!proxyRes.ok) throw new Error('Proxy fetch failed');
      data = await proxyRes.json();
    } catch (proxyErr) {
      output.innerHTML = 'Failed to fetch the RSS feed. Please check the URL and try again.';
      button.disabled = false;
      button.innerHTML = '<span class="material-symbols-rounded">search</span>';
      return;
    }
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(data.contents || '', 'text/xml');
    
    // Check for XML parsing errors
    const parseError = xml.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid RSS feed format');
    }

    const items = Array.from(xml.querySelectorAll('item')).slice(0, 5);

    if (items.length === 0) {
      output.innerHTML = "No articles found in this feed. Please check if you have the correct RSS URL.";
      button.disabled = false;
      button.innerHTML = '<span class="material-symbols-rounded">search</span>';
      return;
    }

    // build results
    const resultsContainer = document.createElement('div');
    
    for (let item of items) {
      const title = stripHtml(item.querySelector('title')?.textContent || '');
      const description = stripHtml(item.querySelector('description')?.textContent || '');
      // finds the date of publication to show it next to the title
      const pubDate = parseDateFromItem(item);
      const dateStr = formatDate(pubDate) || '';
      
      const div = document.createElement('div');
      div.className = 'article-summary';
      
      // Show article title and loading indicator while summarising
      div.innerHTML = `
        <div class="article-header">
          <strong class="article-title">${escapeHtml(title)}</strong>
          <span class="article-date">${escapeHtml(dateStr)}</span>
        </div>
        <p class="article-body"><span class="material-symbols-rounded spinner">autorenew</span> Summarizing...</p>
      `;
      resultsContainer.appendChild(div);
      
      // Start summarization
      const summary = await summarizeText(`${title}\n\n${description}`);
      
      // Update with the summary
      div.innerHTML = `
        <div class="article-header">
          <strong class="article-title">${escapeHtml(title)}</strong>
          <span class="article-date">${escapeHtml(dateStr)}</span>
        </div>
        <p class="article-body">${escapeHtml(summary)}</p>
      `;
    }

    // replace spinner with results
    output.innerHTML = '';
    output.appendChild(resultsContainer);
  } catch (err) {
    output.innerHTML = `Error: ${err.message}`;
  } finally {
    // re-enable button
    button.disabled = false;
    button.innerHTML = '<span class="material-symbols-rounded">search</span>';
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

// Theme toggle handler
toggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  if (document.body.classList.contains('dark-mode')) {
    icon.textContent = 'light_mode';
    localStorage.setItem('theme', 'dark');
  } else {
    icon.textContent = 'dark_mode';
    localStorage.setItem('theme', 'light');
  }
});
