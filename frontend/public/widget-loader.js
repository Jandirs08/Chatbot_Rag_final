(function () {
  try {
    var SVG_NS = "http://www.w3.org/2000/svg";

    var scriptEl = document.currentScript;
    if (!scriptEl) return;

    var defaultBg = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

    function sanitizeBackground(input) {
      if (!input) return defaultBg;
      var val = String(input);
      var lower = val.toLowerCase();
      if (lower.indexOf("url(") !== -1) return defaultBg;
      if (lower.indexOf("expression") !== -1) return defaultBg;
      if (lower.indexOf("javascript") !== -1) return defaultBg;
      if (!/^[a-z0-9#(),.%\s\-]*$/i.test(val)) return defaultBg;
      return val;
    }

    function parsePx(value, fallback) {
      var n = parseInt(String(value || ""), 10);
      if (!isFinite(n) || n <= 0) n = fallback;
      return n + "px";
    }

    function parsePosition(value) {
      var allowed = {
        "bottom-right": { propA: "bottom", propB: "right" },
        "bottom-left": { propA: "bottom", propB: "left" },
        "top-right": { propA: "top", propB: "right" },
        "top-left": { propA: "top", propB: "left" },
      };
      return allowed[value] ? value : "bottom-right";
    }

    function isSafeHttpUrl(u) {
      try {
        var parsed = new URL(u, window.location.href);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch (_) {
        return false;
      }
    }

    var chatUrl = scriptEl.getAttribute("data-chat-url");
    if (!chatUrl || !isSafeHttpUrl(chatUrl)) {
      return;
    }

    var widthPx = parsePx(scriptEl.getAttribute("data-width"), 400);
    var heightPx = parsePx(scriptEl.getAttribute("data-height"), 600);
    var position = parsePosition(scriptEl.getAttribute("data-position") || "");
    var bubbleBg = sanitizeBackground(
      scriptEl.getAttribute("data-bubble-background") || defaultBg
    );

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Abrir chat");
    button.style.position = "fixed";
    button.style.width = "60px";
    button.style.height = "60px";
    button.style.borderRadius = "50%";
    button.style.border = "none";
    button.style.padding = "0";
    button.style.cursor = "pointer";
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
    button.style.transition = "transform 0.2s ease";
    button.style.background = bubbleBg;
    button.style.zIndex = "1000";

    var iframe = document.createElement("iframe");
    iframe.title = "AI Chatbot Widget";
    iframe.setAttribute("frameborder", "0");
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.borderRadius = "16px";
    iframe.style.boxShadow = "0 8px 32px rgba(0,0,0,0.1)";
    iframe.style.display = "none";
    iframe.style.width = widthPx;
    iframe.style.height = heightPx;
    iframe.style.zIndex = "1000";
    iframe.src = chatUrl;

    var pos = {
      "bottom-right": function () {
        button.style.bottom = "20px";
        button.style.right = "20px";
        iframe.style.bottom = "90px";
        iframe.style.right = "20px";
      },
      "bottom-left": function () {
        button.style.bottom = "20px";
        button.style.left = "20px";
        iframe.style.bottom = "90px";
        iframe.style.left = "20px";
      },
      "top-right": function () {
        button.style.top = "20px";
        button.style.right = "20px";
        iframe.style.top = "90px";
        iframe.style.right = "20px";
      },
      "top-left": function () {
        button.style.top = "20px";
        button.style.left = "20px";
        iframe.style.top = "90px";
        iframe.style.left = "20px";
      },
    };
    (pos[position] || pos["bottom-right"])();

    function createMessageIcon() {
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "white");
      svg.setAttribute("stroke-width", "2");
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      );
      svg.appendChild(path);
      return svg;
    }

    function createCloseIcon() {
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "white");
      svg.setAttribute("stroke-width", "2");
      var p1 = document.createElementNS(SVG_NS, "path");
      p1.setAttribute("d", "M18 6L6 18");
      var p2 = document.createElementNS(SVG_NS, "path");
      p2.setAttribute("d", "M6 6L18 18");
      svg.appendChild(p1);
      svg.appendChild(p2);
      return svg;
    }

    var msgIcon = createMessageIcon();
    var xIcon = createCloseIcon();
    function setIconBaseStyles(el) {
      el.style.position = "absolute";
      el.style.top = "50%";
      el.style.left = "50%";
      el.style.transform = "translate(-50%, -50%)";
      el.style.opacity = "1";
      el.style.transition = "all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)";
      el.style.pointerEvents = "none";
    }
    setIconBaseStyles(msgIcon);
    setIconBaseStyles(xIcon);
    msgIcon.style.opacity = "1";
    msgIcon.style.transform = "translate(-50%, -50%) scale(1) rotate(0deg)";
    xIcon.style.opacity = "0";
    xIcon.style.transform = "translate(-50%, -50%) scale(0.5) rotate(-90deg)";
    button.appendChild(msgIcon);
    button.appendChild(xIcon);

    var open = false;
    button.addEventListener("click", function () {
      open = !open;
      iframe.style.display = open ? "block" : "none";
      button.setAttribute("aria-label", open ? "Cerrar chat" : "Abrir chat");
      if (open) {
        msgIcon.style.opacity = "0";
        msgIcon.style.transform = "translate(-50%, -50%) scale(0.5) rotate(90deg)";
        xIcon.style.opacity = "1";
        xIcon.style.transform = "translate(-50%, -50%) scale(1) rotate(0deg)";
      } else {
        msgIcon.style.opacity = "1";
        msgIcon.style.transform = "translate(-50%, -50%) scale(1) rotate(0deg)";
        xIcon.style.opacity = "0";
        xIcon.style.transform = "translate(-50%, -50%) scale(0.5) rotate(-90deg)";
      }
    });

    document.body.appendChild(button);
    document.body.appendChild(iframe);
  } catch (_) {
  }
})();