// client-side script for RSS Summariser (Pages-first)

// Summarizer function that calls the Cloudflare Pages Function at /summarize
// this was the WORST part of coding this i hate ai
// why cant inspect element just hide the api key
// now i need to host another worker just to do this
async function summarizeText(text) {
  try {
    const res = await fetch('/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error('Summarize request failed');

    const data = await res.json();
    return data.summary || 'No summary available';
  } catch (err) {
    console.error('Summarization error:', err);
    return 'Error summarizing this article.';
  }
}

// Form submit handler
document.getElementById('rss-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const button = e.target.querySelector('button');
  const url = document.getElementById('rss-url').value;
  const output = document.getElementById('summary-result');

  // disable button
  button.disabled = true;
  button.innerHTML = '<span class="material-symbols-rounded">search</span>';

  // show spinner
  output.innerHTML = `
    <div id="loading-indicator" style="text-align:center; margin:20px 0;">
      <span class="material-symbols-rounded spinner">autorenew</span>
      <p>Loading articles...</p>
    </div>
  `;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Normal fetch failed');
    const text = await res.text();
    data = { contents: text };
  } catch (err) {
    // CORS fallback in case it doesnt work
    // is cors legal btw
    const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    data = await proxyRes.json();
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(data.contents, 'text/xml');
  const items = Array.from(xml.querySelectorAll('item')).slice(0, 5);

  if (items.length === 0) {
    output.innerHTML = "There's nothing here... check if you got the right one";
    button.disabled = false;
    button.innerHTML = '<span class="material-symbols-rounded">search</span>';
    return;
  }

  // build results
  const resultsContainer = document.createElement('div');

  for (let item of items) {
    const title = item.querySelector('title')?.textContent || '';
    const description = item.querySelector('description')?.textContent || '';
    const summary = await summarizeText(`${title}\n\n${description}`);

    const div = document.createElement('div');
    div.innerHTML = `<strong>${title}</strong><p>${summary}</p><hr/>`;
    resultsContainer.appendChild(div);
  }

  // replace spinner with results
  output.innerHTML = '';
  output.appendChild(resultsContainer);

  // re-enable button
  button.disabled = false;
  button.innerHTML = '<span class="material-symbols-rounded">search</span>';
});


// Dark mode toggle
const toggleBtn = document.getElementById('dark-mode-toggle');
const icon = document.getElementById('dark-mode-icon');

// store the user's preference in local storage
const savedTheme = localStorage.getItem('theme');
if (
  savedTheme === 'dark' ||
  (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
) {
  // Clean, single copy of client-side script
  // Calls Cloudflare Pages Function at /summarize and handles UI.

  // Summarizer function that calls the Cloudflare Pages Function at /summarize
  async function summarizeText(text) {
    try {
      const res = await fetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error('Summarize request failed: ' + (errText || res.status));
      }

      const data = await res.json();
      return data.summary || 'No summary available';
    } catch (err) {
      console.error('Summarization error:', err);
      return 'Error summarizing this article.';
    }
  }

  // Form submit handler
  const form = document.getElementById('rss-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const button = form.querySelector('button');
      const url = document.getElementById('rss-url').value;
      const output = document.getElementById('summary-result');

      if (!button || !output) return;

      // disable button
      button.disabled = true;
      button.innerHTML = '<span class="material-symbols-rounded">search</span>';

      // show spinner
      output.innerHTML = `
        <div id="loading-indicator" style="text-align:center; margin:20px 0;">
          <span class="material-symbols-rounded spinner">autorenew</span>
          <p>Loading articles...</p>
        </div>
      `;

      let data;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Normal fetch failed');
        const text = await res.text();
        data = { contents: text };
      } catch (err) {
        // CORS fallback
        try {
          const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
          data = await proxyRes.json();
        } catch (proxyErr) {
          output.innerHTML = 'Failed to fetch the RSS feed.';
          button.disabled = false;
          button.innerHTML = '<span class="material-symbols-rounded">search</span>';
          return;
        }
      }

      const parser = new DOMParser();
      const xml = parser.parseFromString(data.contents || '', 'text/xml');
      const items = Array.from(xml.querySelectorAll('item')).slice(0, 5);

      if (items.length === 0) {
        output.innerHTML = "There's nothing here... check if you got the right one";
        button.disabled = false;
        button.innerHTML = '<span class="material-symbols-rounded">search</span>';
        return;
      }

      // build results
      const resultsContainer = document.createElement('div');

      for (let item of items) {
        const title = item.querySelector('title')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const summary = await summarizeText(`${title}\n\n${description}`);

        const div = document.createElement('div');
        div.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(summary)}</p><hr/>`;
        resultsContainer.appendChild(div);
      }

      // replace spinner with results
      output.innerHTML = '';
      output.appendChild(resultsContainer);

      // re-enable button
      button.disabled = false;
      button.innerHTML = '<span class="material-symbols-rounded">search</span>';
    });
  }

  // Dark mode toggle
  const toggleBtn = document.getElementById('dark-mode-toggle');
  const icon = document.getElementById('dark-mode-icon');

  if (toggleBtn && icon) {
    // store the user's preference in local storage
    const savedTheme = localStorage.getItem('theme');
    if (
      savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      document.body.classList.add('dark-mode');
      icon.textContent = 'light_mode';
    }

    // make it actually work
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
  }

  // small helper to avoid putting the html itself
  //just in case
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }}
