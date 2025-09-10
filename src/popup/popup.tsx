import React from "react";
import ReactDOM from "react-dom/client";

function Popup() {
  return (
    <div style={{ padding: "1rem", width: "200px" }}>
      <h3>Fantasy Assistant</h3>
      <button onClick={() => alert("Test tip!")}>Test</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Popup />);
