// Summarizer function that calls the Cloudflare Worker
async function summarizeText(text) {
  try {
    const res = await fetch("https://rss-summariser.sahas-shimpi.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error("Worker request failed");

    const data = await res.json();
    return data.summary || "No summary available";
  } catch (err) {
    console.error("Summarization error:", err);
    return "Error summarizing this article.";
  }
}

// Form submit handler
document.getElementById("rss-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const button = e.target.querySelector("button");
  const url = document.getElementById("rss-url").value;
  const output = document.getElementById("summary-result");

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
    if (!res.ok) throw new Error("Normal fetch failed");
    const text = await res.text();
    data = { contents: text };
  } catch (err) {
    const proxyRes = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    );
    data = await proxyRes.json();
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(data.contents, "text/xml");
  const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);

  if (items.length === 0) {
    output.innerHTML = "There's nothing here... check if you got the right one";
    button.disabled = false;
    button.innerHTML = '<span class="material-symbols-rounded">search</span>';
    return;
  }

  // build results
  const resultsContainer = document.createElement("div");

  for (let item of items) {
    const title = item.querySelector("title")?.textContent || "";
    const description = item.querySelector("description")?.textContent || "";
    const summary = await summarizeText(`${title}\n\n${description}`);

    const div = document.createElement("div");
    div.innerHTML = `<strong>${title}</strong><p>${summary}</p><hr/>`;
    resultsContainer.appendChild(div);
  }

  // replace spinner with results
  output.innerHTML = "";
  output.appendChild(resultsContainer);

  // re-enable button
  button.disabled = false;
  button.innerHTML = '<span class="material-symbols-rounded">search</span>';
});


// Dark mode toggle
const toggleBtn = document.getElementById("dark-mode-toggle");
const icon = document.getElementById("dark-mode-icon");

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
