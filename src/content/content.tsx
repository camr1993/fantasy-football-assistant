import React from "react";
import ReactDOM from "react-dom/client";

function Tip() {
  return (
    <div
      style={{
        background: "#fffae6",
        border: "1px solid #f0c000",
        padding: "8px",
        marginTop: "10px",
        fontWeight: "bold",
      }}
    >
      💡 Fantasy Assistant Tip: Start your studs!
    </div>
  );
}

// Find a place to inject
const header = document.querySelector("h1");
if (header) {
  const mount = document.createElement("div");
  mount.id = "fantasy-assistant-root";
  header.insertAdjacentElement("afterend", mount);

  ReactDOM.createRoot(mount).render(<Tip />);
}
