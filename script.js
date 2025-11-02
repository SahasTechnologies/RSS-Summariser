// logic for the actual thing
document.getElementById("rss-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const url = document.getElementById("rss-url").value;
    const output = document.getElementById("summary-result");
    output.innerHTML = "Loading...";

  let data;

  //first fetch the thing and send to cors if it doesnt work
  try {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Normal fetch failed"); //error if the normal fetch doesnt work
  const text = await res.text();
  data = { contents: text };
} catch (err) {
    //now go to the cors proxy
    const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    data = await proxyRes.json();
  }
  }
  
// turn the rss into actual stuff
const parser = new DOMParser();
const xml = parser.parseFromString(data.contents, "text/xml");

//get the 5 latest posts so that its not summarising stuff from 5 years ago
const items = Array.from(xml.querySelectorAll("item")).slice(0, 5); //ily autocomplete
output.innerHTML = ""; //clear previous output

if (items.length === 0) {
    output.innerHTML = "There's nothing here... check if you got the right one"
    return;
}

//for loop for sending the stuff to the ai
for (let item of items) {
    const title = item.querySelector("title")?.textContent || "";
    const description = item.querySelector("description")?.textContent || ""; //wow autocomplete
    const summary = await summarizeText(`${title}\n\n${description}`);

    const div = document.createElement("div");
    div.innerHTML = '<strong>' + title + '</strong><p>' + summary + '</p><hr/>';
    output.appendChild(div);
    }

    function summarizeText(text) {
        //placeholder for now
        return text.length > 200 ? text.slice(0, 200) + "..." : text;
    }