import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { I18nProvider } from "./contexts/I18nContext";

// Global error catcher for mobile debugging
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, col, error) {
    const errorMsg = `❌ Error: ${msg}\nAt: ${url}:${line}:${col}\nStack: ${error?.stack}`;
    console.error(errorMsg);
    // Create an overlay to show the error on phone screen
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.9);color:white;padding:20px;z-index:99999;overflow:auto;font-family:monospace;font-size:12px;';
    overlay.innerHTML = `<h3>⚠️ App Crash Caught</h3><pre style="white-space:pre-wrap">${errorMsg}</pre><button onclick="window.location.reload()" style="background:white;color:black;padding:10px;margin-top:10px;border-radius:5px;">Reload App</button><button onclick="localStorage.clear();window.location.reload()" style="background:black;color:white;padding:10px;margin-top:10px;margin-left:10px;border-radius:5px;">Clear Storage & Reload</button>`;
    document.body.appendChild(overlay);
    return false;
  };
}

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </I18nProvider>
);
