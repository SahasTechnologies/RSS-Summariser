document.getElementById("rss-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const url = document.getElementById("rss-url").value;
  const output = document.getElementById("summary-result");
  output.innerHTML = "Loading...";

  let data;

  // first fetch the thing and send to cors if it doesnt work
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Normal fetch failed");
    const text = await res.text();
    data = { contents: text };
  } catch (err) {
    // now go to the cors proxy
    const proxyRes = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    );
    data = await proxyRes.json();
  }

  // turn the rss into actual stuff
  const parser = new DOMParser();
  const xml = parser.parseFromString(data.contents, "text/xml");

  // get the 5 latest posts
  const items = Array.from(xml.querySelectorAll("item")).slice(0, 5);
  output.innerHTML = "";

  if (items.length === 0) {
    output.innerHTML = "There's nothing here... check if you got the right one";
    return;
  }

  // for loop for sending the stuff to the ai
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
  headers: { "Content-Type": "application/json"},
  body: JSON.stringify({ text }),
 });

 const data = await res.json();
 //the hugging face actual thing
 return data[0]?.summary_text || text;
 
}
