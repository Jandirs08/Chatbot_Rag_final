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
      scriptEl.getAttribute("data-bubble-background") || defaultBg,
    );

    // --- DETECCIÓN MÓVIL Y RESPONSIVIDAD ---
    var isMobile = false;
    try {
      isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
    } catch (_) {}

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
    button.style.transition = "transform 0.3s ease, box-shadow 0.3s ease";
    button.style.background = bubbleBg;
    // Z-Index alto para sobresalir sobre otros elementos (z-50 equivalent usually 50, but we use high number to be safe)
    button.style.zIndex = "2147483647";

    var iframe = document.createElement("iframe");
    iframe.title = "AI Chatbot Widget";
    iframe.setAttribute("frameborder", "0");
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.borderRadius = isMobile ? "0" : "16px";
    // Sombra fuerte (shadow-2xl)
    iframe.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.25)";
    iframe.style.display = "none";

    // Ajuste responsivo del iframe
    if (isMobile) {
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.bottom = "0";
      iframe.style.right = "0";
      iframe.style.left = "0";
      iframe.style.top = "0";
      iframe.style.margin = "0";
      iframe.style.maxHeight = "100%";
      iframe.style.maxWidth = "100%";
    } else {
      iframe.style.width = widthPx;
      iframe.style.height = heightPx;
    }

    iframe.style.zIndex = "2147483646"; // Un nivel menos que el botón
    iframe.src = chatUrl;

    var pos = {
      "bottom-right": function () {
        button.style.bottom = "20px";
        button.style.right = "20px";
        if (!isMobile) {
          iframe.style.bottom = "100px"; // 20px (btn) + 60px (height) + 20px (gap)
          iframe.style.right = "20px";
        }
      },
      "bottom-left": function () {
        button.style.bottom = "20px";
        button.style.left = "20px";
        if (!isMobile) {
          iframe.style.bottom = "100px";
          iframe.style.left = "20px";
        }
      },
      "top-right": function () {
        button.style.top = "20px";
        button.style.right = "20px";
        if (!isMobile) {
          iframe.style.top = "100px";
          iframe.style.right = "20px";
        }
      },
      "top-left": function () {
        button.style.top = "20px";
        button.style.left = "20px";
        if (!isMobile) {
          iframe.style.top = "100px";
          iframe.style.left = "20px";
        }
      },
    };
    (pos[position] || pos["bottom-right"])();

    function createMessageIcon() {
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "28");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "white");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      );
      svg.appendChild(path);
      return svg;
    }

    function createChevronIcon() {
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "28");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "white");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", "M6 9l6 6 6-6");
      svg.appendChild(path);
      return svg;
    }

    var msgIcon = createMessageIcon();
    var chevronIcon = createChevronIcon();

    // Contenedor relativo para los iconos
    var iconContainer = document.createElement("div");
    iconContainer.style.position = "relative";
    iconContainer.style.width = "100%";
    iconContainer.style.height = "100%";
    iconContainer.style.display = "flex";
    iconContainer.style.alignItems = "center";
    iconContainer.style.justifyContent = "center";
    button.appendChild(iconContainer);

    function setIconBaseStyles(el) {
      el.style.position = "absolute";
      el.style.top = "50%";
      el.style.left = "50%";
      el.style.transformOrigin = "center center";
      el.style.transition = "all 0.5s ease-in-out"; // Transición suave
      el.style.pointerEvents = "none";
    }

    setIconBaseStyles(msgIcon);
    setIconBaseStyles(chevronIcon);

    // Estado inicial
    msgIcon.style.opacity = "1";
    msgIcon.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
    
    chevronIcon.style.opacity = "0";
    chevronIcon.style.transform = "translate(-50%, -50%) rotate(-180deg) scale(0.5)"; // Empieza rotado

    iconContainer.appendChild(msgIcon);
    iconContainer.appendChild(chevronIcon);

    var open = false;

    // Hover effect (Micro-interacción)
    button.addEventListener("mouseenter", function() {
      if (!open) {
        button.style.transform = "translateY(-4px)";
      }
    });

    button.addEventListener("mouseleave", function() {
      if (!open) {
        button.style.transform = "translateY(0)";
      }
    });

    function toggleChat() {
      open = !open;
      iframe.style.display = open ? "block" : "none";
      button.setAttribute("aria-label", open ? "Cerrar chat" : "Abrir chat");

      // Efecto de rebote (bounce)
      if (open) {
        button.style.transform = "scale(1.05)";
        setTimeout(function() {
          button.style.transform = "scale(1)";
        }, 200);
      } else {
         button.style.transform = "translateY(0)";
      }

      if (open) {
        // ABRIR: Morphing a Chevron
        msgIcon.style.opacity = "0";
        msgIcon.style.transform = "translate(-50%, -50%) rotate(180deg) scale(0.5)";
        
        chevronIcon.style.opacity = "1";
        chevronIcon.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";

        if (isMobile) {
          // En móvil: El botón SIGUE visible y controla el cierre
          document.body.style.overflow = "hidden";
          // Ajustar iframe para que no tape el botón si es necesario, 
          // pero como el botón es z-index mayor, flotará encima.
        }
      } else {
        // CERRAR: Morphing a Message
        msgIcon.style.opacity = "1";
        msgIcon.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
        
        chevronIcon.style.opacity = "0";
        chevronIcon.style.transform = "translate(-50%, -50%) rotate(-180deg) scale(0.5)";

        if (isMobile) {
          document.body.style.overflow = "";
        }
      }
    }

    button.addEventListener("click", toggleChat);

    document.body.appendChild(button);
    document.body.appendChild(iframe);
    
  } catch (_) {}
})();
