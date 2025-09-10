console.log("Fantasy Assistant content script loaded!");

// Example: inject a tip above the league title
const header = document.querySelector("h1"); // usually league name
if (header) {
  const tip = document.createElement("div");
  tip.innerText = "💡 Fantasy Assistant Tip: Start your studs!";
  tip.style.background = "#fffae6";
  tip.style.border = "1px solid #f0c000";
  tip.style.padding = "8px";
  tip.style.marginTop = "10px";
  tip.style.fontWeight = "bold";
  header.insertAdjacentElement("afterend", tip);
}
