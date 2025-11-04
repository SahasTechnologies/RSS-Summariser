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

// Summarizer function that calls the Cloudflare Pages Function at /summarize
async function summarizeText(text) {
  try {
    const res = await fetch('/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    
    if (!res.ok) {
      // Handle specific error cases
      if (res.status === 503) {
        throw new Error('Summarization service is temporarily unavailable. Please try again in a few minutes.');
      }
      if (data.error) {
        if (data.details) {
          throw new Error(`${data.error}: ${typeof data.details === 'string' ? data.details : JSON.stringify(data.details)}`);
        }
        throw new Error(data.error);
      }
      throw new Error(`Request failed with status ${res.status}`);
    }

    if (!data.summary) {
      throw new Error('No summary was generated. Please try again.');
    }
    
    return data.summary;
  } catch (err) {
    console.error('Summarization error:', err);
    if (err.message.includes('Failed to fetch')) {
      return 'Unable to connect to the summarization service. Please try again later.';
    }
    // Return a user-friendly error message
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
      
      const div = document.createElement('div');
      div.className = 'article-summary';
      
      // Show article title and loading indicator while summarizing
      div.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        <p><span class="material-symbols-rounded spinner">autorenew</span> Summarizing...</p>
        <hr/>
      `;
      resultsContainer.appendChild(div);
      
      // Start summarization
      const summary = await summarizeText(`${title}\n\n${description}`);
      
      // Update with the summary
      div.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(summary)}</p>
        <hr/>
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
