// logic for the actual thing
document.getElementById("loadButton").addEventListener("click", loadFeed);

// for some reason we need a cors proxy
const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    const data = await res.json(); //the autocomplete in vscode keeps trying to tell me this is wrong but it works

// turn the rss into actual stuff
const parser = new DOMParser();
const xml = parser.parseFromString(data.contents, "text/xml");
const items = xml.querySelectorAll("item"); //actually autocomplete is quite good this line is entirely autocomplete other than the note

//get the 5 latest posts so that its not summarising stuff from 5 years ago
const items = Array.from(xml.querySelectorAll("item")).slice(0, 5); //ily autocomplete
output.innerHTML = ""; //clear previous output

//send this over to hack clubs ai that was down the time i was testing this :(
const summary = await getSummaryFromAI(postsText);