// simple summarizer fallback
function summarizeText(text) {
  // naive summary: first 30 words
  return text.split(/\s+/).slice(0, 30).join(" ") + "...";
}

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
    const summary = summarizeText(`${title}\n\n${description}`);

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
