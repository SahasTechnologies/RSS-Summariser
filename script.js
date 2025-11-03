document.getElementById("rss-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const button = e.target.querySelector("button");
  const url = document.getElementById("rss-url").value;
  const output = document.getElementById("summary-result");

  // disable button to prevent spam
  button.disabled = true;
  button.textContent = "Please wait...";
  setTimeout(() => {
    button.disabled = false;
    button.innerHTML = '<span class="material-icons">search</span>';
  }, 60000);

  output.innerHTML = "Loading...";

  let data;

  // first try direct fetch
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Normal fetch failed");
    const text = await res.text();
    data = { contents: text };
  } catch (err) {
    // fallback to CORS proxy
    const proxyRes = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    );
    data = await proxyRes.json();
  }

  // parse RSS
  const parser = new DOMParser();
  const xml = parser.parseFromString(data.contents, "text/xml");

  // get the 5 latest posts
  const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);
  output.innerHTML = "";

  if (items.length === 0) {
    output.innerHTML = "There's nothing here... check if you got the right one";
    return;
  }

  // loop through items and summarise
  for (let item of items) {
    const title = item.querySelector("title")?.textContent || "";
    const description = item.querySelector("description")?.textContent || "";
    const summary = await summarizeText(`${title}\n\n${description}`);

    const div = document.createElement("div");
    div.innerHTML = `<strong>${title}</strong><p>${summary}</p><hr/>`;
    output.appendChild(div);
  }
});

// helper function
async function summarizeText(text) {
  const res = await fetch("https://rss-summariser.sahas-shimpi.workers.dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const data = await res.json();
  return data[0]?.summary_text || text;
}
