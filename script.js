// Cache and state management
function loadSummaryCache() {
  try {
    return JSON.parse(localStorage.getItem("articleSummaries") || "{}");
  } catch (e) {
    return {};
  }
}

function saveSummaryCache(cache) {
  localStorage.setItem("articleSummaries", JSON.stringify(cache));
}

function loadReadArticles() {
  try {
    return JSON.parse(localStorage.getItem("readArticles") || "[]");
  } catch (e) {
    return [];
  }
}

function saveReadArticles(list) {
  localStorage.setItem("readArticles", JSON.stringify(list));
}

// Track known articles per source to detect new ones
function loadKnownArticles() {
  try {
    return JSON.parse(localStorage.getItem("knownArticles") || "{}");
  } catch (e) {
    return {};
  }
}

function saveKnownArticles(articles) {
  localStorage.setItem("knownArticles", JSON.stringify(articles));
}

// Background update checker
function startBackgroundUpdates() {
  // Check for updates every 5 minutes in case there are new things to do
  setInterval(async () => {
    console.log("Checking for updates...");
    const sites = loadFollowedSites();
    if (sites.length === 0) return;
    
    await checkForNewArticles(sites, true);
  }, 5 * 60 * 1000);
  
  // Also check immediately on page load to make sure we have latest
  const sites = loadFollowedSites();
  if (sites.length > 0) {
    checkForNewArticles(sites, true);
  }
}

// Summarizer function that calls the Cloudflare Worker with caching
async function summarizeText(text, cacheKey) {
  const cache = loadSummaryCache();
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  try {
    const res = await fetch("https://rss-summariser.sahas-shimpi.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error("Worker request failed");

    const data = await res.json();
    const summary = data.summary || "No summary available";
    
    // Cache the result
    cache[cacheKey] = summary;
    saveSummaryCache(cache);
    
    return summary;
  } catch (err) {
    console.error("Summarization error:", err);
    return "Error summarizing this article.";
  }
}

// Followed-sites UI + summarization across all followed feeds
const rssForm = document.getElementById("rss-form");
const followedListEl = document.getElementById("followed-sites-list");
const output = document.getElementById("summary-result");

function loadFollowedSites() {
  try {
    const raw = localStorage.getItem("followedSites");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveFollowedSites(list) {
  localStorage.setItem("followedSites", JSON.stringify(list));
}

function renderFollowedSites() {
  if (!followedListEl) return;
  const list = loadFollowedSites();
  followedListEl.innerHTML = "";
  list.forEach((url, idx) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = url;
    a.textContent = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-site";
    removeBtn.title = "Remove site";
    removeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const filtered = loadFollowedSites().filter((u) => u !== url);
      saveFollowedSites(filtered);
      renderFollowedSites();
      summarizeAllFollowedSites();
    });

    li.appendChild(a);
    li.appendChild(removeBtn);
    followedListEl.appendChild(li);
  });
}

function normalizeUrl(raw) {
  if (!raw) return raw;
  try {
    // if scheme missing, assume https
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    return u.href;
  } catch (e) {
    return raw;
  }
}

async function fetchFeedXml(url) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const txt = await res.text();
      return txt;
    }
    throw new Error("direct fetch failed");
  } catch (err) {
    // fallback to CORS proxy  for some reason this is meant to magically work better?
    try {
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const pres = await fetch(proxy);
      const json = await pres.json();
      return json.contents;
    } catch (e) {
      console.warn("Failed to fetch feed:", url, e);
      return null;
    }
  }
}

function extractItemsFromFeed(xmlString, sourceUrl, isInitialFetch = false) {
  if (!xmlString) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  // detect parse error
  if (doc.querySelector("parsererror")) return [];
  
  const items = Array.from(doc.querySelectorAll("item"));
  const mappedItems = items.map((item) => {
    const title = item.querySelector("title")?.textContent || "(no title)";
    const description = item.querySelector("description")?.textContent || "";
    const link = item.querySelector("link")?.textContent || "";
    const pub = item.querySelector("pubDate")?.textContent || item.querySelector("dc\\:date")?.textContent || "";
    const time = Date.parse(pub) || 0;
    return { title, description, link, pub, time, source: sourceUrl };
  });

  // Sort by date and limit if it's initial fetch
  mappedItems.sort((a, b) => b.time - a.time);
  return isInitialFetch ? mappedItems.slice(0, 5) : mappedItems;
}

async function checkForNewArticles(sites, isBackground = false) {
  const knownArticles = loadKnownArticles();
  let hasNewArticles = false;

  if (!isBackground && output) {
    updateProgress(0, sites.length, "Fetching RSS feeds...");
  }

  // fetch all feeds in parallel but track progress
  let completed = 0;
  const results = await Promise.allSettled(
    sites.map(async (s) => {
      const result = await fetchFeedXml(s);
      completed++;
      if (!isBackground && output) {
        updateProgress(completed, sites.length, "Fetching RSS feeds...");
      }
      return result;
    })
  );
  const allItems = [];
  
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) {
      const sourceUrl = sites[i];
      // Don't limit items when checking for updates
      const items = extractItemsFromFeed(res.value, sourceUrl, false);
      
      // Filter to only new articles we haven't seen before
      const knownUrls = knownArticles[sourceUrl] || [];
      const newItems = items.filter(item => !knownUrls.includes(item.link));
      
      if (newItems.length > 0) {
        hasNewArticles = true;
        // Update known articles for this source
        knownArticles[sourceUrl] = [
          ...new Set([...knownUrls, ...items.map(item => item.link)])
        ];
      }
      
      allItems.push(...newItems);
    }
  });

  if (hasNewArticles) {
    saveKnownArticles(knownArticles);
    if (!isBackground) {
      // For immediate display, show loading
      await displayArticles(allItems, true);
    } else if (allItems.length > 0) {
      // For background updates, show notification
      const notification = document.createElement("div");
      notification.className = "update-notification";
      notification.innerHTML = `
        <p>${allItems.length} new article${allItems.length === 1 ? '' : 's'} found! Updating...</p>
      `;
      document.body.appendChild(notification);
      await displayArticles(allItems, false);
      setTimeout(() => notification.remove(), 3000);
    }
  }
  
  return hasNewArticles;
}

async function summarizeAllFollowedSites(isInitialFetch = true) {
  if (!output) return;
  output.innerHTML = `
    <div id="loading-indicator" style="text-align:center; margin:20px 0;">
      <span class="material-symbols-rounded spinner">autorenew</span>
      <p>Loading articles from your followed sites...</p>
    </div>
  `;

  const sites = loadFollowedSites();
  if (sites.length === 0) {
    output.innerHTML = "Add a site to start summarising feeds.";
    return;
  }

  // fetch all feeds in parallel (settled so one failure doesn't break all)
  const results = await Promise.allSettled(sites.map((s) => fetchFeedXml(s)));
  const allItems = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) {
      const items = extractItemsFromFeed(res.value, sites[i], isInitialFetch);
      allItems.push(...items);
    }
  });
  
  await displayArticles(allItems, true);
}

function updateProgress(current, total, message) {
  const percent = Math.round((current / total) * 100);
  if (!output) return;
  
  output.innerHTML = `
    <div class="progress-container">
      <p>${message}</p>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="progress-text">${current}/${total} (${percent}%)</div>
    </div>
  `;
}

async function displayArticles(items, showLoading = true) {
  if (!output) return;
  
  // sort by date desc
  items.sort((a, b) => b.time - a.time);
  
  // filter out read articles
  const readArticles = loadReadArticles();
  const unreadItems = items.filter(item => !readArticles.includes(item.link));

  if (unreadItems.length === 0) {
    if (showLoading) {
      output.innerHTML = "No new articles found across your followed sites.";
    }
    return;
  }

  // summarize each item sequentially
  const resultsContainer = document.createElement("div");
  let completed = 0;
  const total = unreadItems.length;
  
  for (const item of unreadItems) {
    const title = item.title;
    const description = item.description || "";
    // use article URL as cache key
    const cacheKey = item.link || `${item.source}:${title}`;
    
    // Update progress before starting each summary
    updateProgress(completed, total, "Summarizing articles...");
    
    const summary = await summarizeText(`${title}\n\n${description}`, cacheKey);
    completed++;

    const div = document.createElement("div");
    div.className = "article-card";
    
    // format date nicely
    const dateStr = item.time ? new Date(item.time).toLocaleString() : "No date";
    const linkHtml = item.link ? `<a href="${item.link}" target="_blank" rel="noopener">source</a>` : "";
    
    div.innerHTML = `
      <h3>${title}</h3>
      <div class="article-meta">
        <span>${dateStr}</span>
        <span>•</span>
        <span>${item.source}</span>
        <span>•</span>
        ${linkHtml}
      </div>
      <p>${summary}</p>
      <button class="article-delete" title="Mark as read">
        <span class="material-symbols-rounded">check_circle</span>
      </button>
    `;

    // wire up delete button
    const deleteBtn = div.querySelector(".article-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        // mark as read
        if (item.link) {
          const read = loadReadArticles();
          read.push(item.link);
          saveReadArticles(read);
        }
        // remove from view with animation
        div.style.opacity = "0";
        setTimeout(() => div.remove(), 300);
      });
    }

    resultsContainer.appendChild(div);
  }

  output.innerHTML = "";
  output.appendChild(resultsContainer);
}

// wire up the form to add a site and summarise across all followed sites
if (rssForm) {
  rssForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const wrapper = document.getElementById("form-wrapper");
    if (wrapper) wrapper.classList.add("top");

    const input = document.getElementById("rss-url");
    const raw = input?.value?.trim();
    if (!raw) return;
    const url = normalizeUrl(raw);

    const sites = loadFollowedSites();
    if (!sites.includes(url)) {
      sites.push(url);
      saveFollowedSites(sites);
      renderFollowedSites();
      
      // Fetch first 5 articles from the new source
      const xml = await fetchFeedXml(url);
      if (xml) {
        const items = extractItemsFromFeed(xml, url, true); // true = initial fetch, limit 5
        if (items.length > 0) {
          // Track these articles as known
          const knownArticles = loadKnownArticles();
          knownArticles[url] = items.map(item => item.link);
          saveKnownArticles(knownArticles);
          // Display them
          await displayArticles(items);
        }
      }
    }
    // clear input
    if (input) input.value = "";
  });
} else {
  console.warn("rss-form not found in DOM; skipping follow-site wiring.");
}

// Add a notification style
const style = document.createElement('style');
style.textContent = `
  .update-notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4285f4;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    animation: slideIn 0.3s ease-out;
    z-index: 1000;
  }
  .update-notification p {
    margin: 0;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  body.dark-mode .update-notification {
    background: #2979ff;
  }
`;
document.head.appendChild(style);

// initial render and start background updates
renderFollowedSites();
startBackgroundUpdates();

// Dark mode toggle (guarded)
const toggleBtn = document.getElementById("dark-mode-toggle");
const icon = document.getElementById("dark-mode-icon");

if (toggleBtn && icon) {
  // store the user's preference in local storage
  const savedTheme = localStorage.getItem("theme");
  if (
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.body.classList.add("dark-mode");
    icon.textContent = "light_mode";
  }

  // make it actually work
  toggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
      icon.textContent = "light_mode";
      localStorage.setItem("theme", "dark");
    } else {
      icon.textContent = "dark_mode";
      localStorage.setItem("theme", "light");
    }
  });
} else {
  console.warn("Dark mode toggle elements not found; skipping dark-mode wiring.");
}

// WHY IS MY JS SO LONG
// all its meant to do is summarise rss feeds jeez
// and check for new ones every 5 minutes
// and cache summaries locally so it doesnt cost me money
// and have a progress bar
// and a loading spinner
// and dark mode
// and a notification for new articles
// and let you mark articles as read
// and let you add/remove rss feeds
// and store everything in local storage
// and handle CORS issues
// and format dates nicely
// and use a cloudflare worker to do the summarization
// and have proper error handling
// and be responsive
// oh ok now i get it