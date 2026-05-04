(function () {
  try {
    var SVG_NS = "http://www.w3.org/2000/svg";
    var WIDGET_READY_TYPE = "chatbot-widget-ready";
    var LOAD_TIMEOUT_MS = 25000; // tolerante a cold-starts (Vercel/Render)

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
        "bottom-right": 1,
        "bottom-left": 1,
        "top-right": 1,
        "top-left": 1,
      };
      return allowed[value] ? value : "bottom-right";
    }

    function isSafeHttpUrl(u) {
      try {
        // Requiere URL absoluta. Relativa = chatOrigin caería al host page,
        // confundiendo el handshake postMessage.
        if (!/^https?:\/\//i.test(u)) return false;
        var parsed = new URL(u);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch (_) {
        return false;
      }
    }

    function parseChatOrigin(u) {
      try {
        return new URL(u).origin;
      } catch (_) {
        return null;
      }
    }

    var chatUrl = scriptEl.getAttribute("data-chat-url");
    if (!chatUrl || !isSafeHttpUrl(chatUrl)) return;
    var chatOrigin = parseChatOrigin(chatUrl);

    var widthPx = parsePx(scriptEl.getAttribute("data-width"), 400);
    var heightPx = parsePx(scriptEl.getAttribute("data-height"), 600);
    var position = parsePosition(scriptEl.getAttribute("data-position") || "");
    var bubbleBg = sanitizeBackground(
      scriptEl.getAttribute("data-bubble-background") || defaultBg,
    );

    function detectMobile() {
      try {
        if (window.matchMedia) {
          return window.matchMedia("(max-width: 640px)").matches;
        }
      } catch (_) {}
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent || "",
      );
    }

    var isMobile = detectMobile();

    // ---- State machine ----
    // idle: iframe no creado / src no asignado
    // loading: src asignado, esperando ready
    // ready: postMessage ready recibido
    // errored: timeout o error de red
    var state = "idle";
    var loadTimer = null;
    var open = false;
    var savedBodyOverflow = null;
    var srcAssigned = false;

    function clearLoadTimer() {
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
    }

    function setState(next) {
      state = next;
      if (next !== "loading") clearLoadTimer();
    }

    // ---- Button ----
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
    button.style.zIndex = "2147483647";

    // ---- Iframe ----
    var iframe = document.createElement("iframe");
    iframe.title = "AI Chatbot Widget";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    );
    iframe.setAttribute("loading", "lazy");
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.borderRadius = isMobile ? "0" : "16px";
    iframe.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.25)";
    iframe.style.zIndex = "2147483646";
    // Hide via visibility + offscreen (no display:none — display:none cancela
    // fetch en algunos navegadores y rompe semántica de load events).
    iframe.style.visibility = "hidden";
    iframe.style.pointerEvents = "none";

    function applyIframeGeometry() {
      // Limpia bordes antes de re-aplicar; transición desktop↔mobile dejaba
      // valores stale (ej. top:0 colgando al volver a desktop).
      iframe.style.top = "";
      iframe.style.right = "";
      iframe.style.bottom = "";
      iframe.style.left = "";
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
        iframe.style.borderRadius = "0";
      } else {
        iframe.style.width = widthPx;
        iframe.style.height = heightPx;
        iframe.style.maxHeight = "";
        iframe.style.maxWidth = "";
        iframe.style.margin = "";
        iframe.style.borderRadius = "16px";
      }
    }
    applyIframeGeometry();

    // ---- Error overlay ----
    var errorOverlay = document.createElement("div");
    errorOverlay.style.position = "fixed";
    errorOverlay.style.display = "none";
    errorOverlay.style.flexDirection = "column";
    errorOverlay.style.alignItems = "center";
    errorOverlay.style.justifyContent = "center";
    errorOverlay.style.padding = "24px";
    errorOverlay.style.background = "#ffffff";
    errorOverlay.style.borderRadius = isMobile ? "0" : "16px";
    errorOverlay.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.25)";
    errorOverlay.style.fontFamily = "system-ui, -apple-system, sans-serif";
    errorOverlay.style.color = "#374151";
    errorOverlay.style.textAlign = "center";
    errorOverlay.style.zIndex = "2147483645";
    var errorTitle = document.createElement("div");
    errorTitle.textContent = "Chat no disponible";
    errorTitle.style.fontWeight = "600";
    errorTitle.style.fontSize = "16px";
    errorTitle.style.marginBottom = "8px";
    var errorBody = document.createElement("div");
    errorBody.textContent = "No se pudo conectar. Intenta nuevamente más tarde.";
    errorBody.style.fontSize = "13px";
    errorBody.style.opacity = "0.8";
    errorBody.style.marginBottom = "16px";
    var retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Reintentar";
    retryBtn.style.padding = "8px 16px";
    retryBtn.style.borderRadius = "8px";
    retryBtn.style.border = "1px solid #d1d5db";
    retryBtn.style.background = "#f9fafb";
    retryBtn.style.cursor = "pointer";
    retryBtn.style.fontSize = "13px";
    errorOverlay.appendChild(errorTitle);
    errorOverlay.appendChild(errorBody);
    errorOverlay.appendChild(retryBtn);

    function syncOverlayGeometry() {
      var rect = iframe.getBoundingClientRect();
      errorOverlay.style.top = rect.top + "px";
      errorOverlay.style.left = rect.left + "px";
      errorOverlay.style.width = rect.width + "px";
      errorOverlay.style.height = rect.height + "px";
      errorOverlay.style.right = "";
      errorOverlay.style.bottom = "";
      errorOverlay.style.borderRadius = isMobile ? "0" : "16px";
    }

    // ---- Splash overlay ----
    // Cubre el iframe blanco mientras /chat compila/carga. Disfraz puro,
    // cero requests. Spinner usa color del bubble. Se oculta al recibir
    // postMessage ready.
    var splashOverlay = document.createElement("div");
    splashOverlay.style.position = "fixed";
    splashOverlay.style.display = "none";
    splashOverlay.style.alignItems = "center";
    splashOverlay.style.justifyContent = "center";
    splashOverlay.style.background = "#ffffff";
    splashOverlay.style.borderRadius = isMobile ? "0" : "16px";
    splashOverlay.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.25)";
    splashOverlay.style.zIndex = "2147483644";
    splashOverlay.style.transition = "opacity 0.25s ease";

    var spinnerStyleId = "chatbot-widget-spinner-style";
    if (!document.getElementById(spinnerStyleId)) {
      var styleEl = document.createElement("style");
      styleEl.id = spinnerStyleId;
      styleEl.textContent =
        "@keyframes chatbot-widget-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(styleEl);
    }

    var spinner = document.createElement("div");
    spinner.style.width = "40px";
    spinner.style.height = "40px";
    spinner.style.borderRadius = "50%";
    spinner.style.border = "3px solid rgba(0,0,0,0.08)";
    // Borde top con color del bubble (extrae primer hex del gradiente)
    var spinnerColor = "#667eea";
    var hexMatch = String(bubbleBg).match(/#[0-9a-fA-F]{3,8}/);
    if (hexMatch) spinnerColor = hexMatch[0];
    spinner.style.borderTopColor = spinnerColor;
    spinner.style.animation = "chatbot-widget-spin 0.9s linear infinite";
    splashOverlay.appendChild(spinner);

    function syncSplashGeometry() {
      var rect = iframe.getBoundingClientRect();
      splashOverlay.style.top = rect.top + "px";
      splashOverlay.style.left = rect.left + "px";
      splashOverlay.style.width = rect.width + "px";
      splashOverlay.style.height = rect.height + "px";
      splashOverlay.style.right = "";
      splashOverlay.style.bottom = "";
      splashOverlay.style.borderRadius = isMobile ? "0" : "16px";
    }

    function showSplash() {
      syncSplashGeometry();
      splashOverlay.style.opacity = "1";
      splashOverlay.style.display = "flex";
    }

    function hideSplash() {
      splashOverlay.style.opacity = "0";
      setTimeout(function () {
        splashOverlay.style.display = "none";
      }, 250);
    }

    function showError() {
      setState("errored");
      iframe.style.visibility = "hidden";
      iframe.style.pointerEvents = "none";
      hideSplash();
      if (open) {
        syncOverlayGeometry();
        errorOverlay.style.display = "flex";
      }
    }

    function hideError() {
      errorOverlay.style.display = "none";
    }

    function showIframeReady() {
      setState("ready");
      iframe.style.visibility = "visible";
      iframe.style.pointerEvents = "auto";
      hideError();
      hideSplash();
    }

    function startLoadTimer() {
      clearLoadTimer();
      loadTimer = setTimeout(function () {
        if (state === "loading") showError();
      }, LOAD_TIMEOUT_MS);
    }

    function loadIframe() {
      if (srcAssigned) return;
      srcAssigned = true;
      setState("loading");
      iframe.src = chatUrl;
      startLoadTimer();
    }

    function reload() {
      hideError();
      clearLoadTimer();
      setState("loading");
      // about:blank reset; el load listener ignora about:blank.
      iframe.src = "about:blank";
      setTimeout(function () {
        iframe.src = chatUrl;
        startLoadTimer();
      }, 50);
    }

    // ---- postMessage handshake ----
    // /chat envía {type: "chatbot-widget-ready"} cuando montó. Único método
    // confiable: load events disparan en error pages, error events no disparan
    // cross-origin. postMessage confirma vida real.
    window.addEventListener("message", function (event) {
      if (chatOrigin && event.origin !== chatOrigin) return;
      var data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === WIDGET_READY_TYPE) {
        if (state === "loading" || state === "errored") {
          showIframeReady();
        }
      }
    });

    // load event solo lo usamos para limpiar about:blank reset; no lo tratamos
    // como señal de éxito (puede dispararse en 4xx/5xx/CSP block).
    iframe.addEventListener("load", function () {
      try {
        if (iframe.src === "about:blank") return;
      } catch (_) {}
      // Espera handshake real; timer sigue corriendo.
    });

    retryBtn.addEventListener("click", reload);

    // ---- Position ----
    function applyPosition() {
      var pos = {
        "bottom-right": function () {
          button.style.bottom = "20px";
          button.style.right = "20px";
          button.style.top = "";
          button.style.left = "";
          if (!isMobile) {
            iframe.style.bottom = "100px";
            iframe.style.right = "20px";
            iframe.style.top = "";
            iframe.style.left = "";
          }
        },
        "bottom-left": function () {
          button.style.bottom = "20px";
          button.style.left = "20px";
          button.style.top = "";
          button.style.right = "";
          if (!isMobile) {
            iframe.style.bottom = "100px";
            iframe.style.left = "20px";
            iframe.style.top = "";
            iframe.style.right = "";
          }
        },
        "top-right": function () {
          button.style.top = "20px";
          button.style.right = "20px";
          button.style.bottom = "";
          button.style.left = "";
          if (!isMobile) {
            iframe.style.top = "100px";
            iframe.style.right = "20px";
            iframe.style.bottom = "";
            iframe.style.left = "";
          }
        },
        "top-left": function () {
          button.style.top = "20px";
          button.style.left = "20px";
          button.style.bottom = "";
          button.style.right = "";
          if (!isMobile) {
            iframe.style.top = "100px";
            iframe.style.left = "20px";
            iframe.style.bottom = "";
            iframe.style.right = "";
          }
        },
      };
      (pos[position] || pos["bottom-right"])();
    }
    applyPosition();

    // ---- Icons ----
    function buildIcon(d) {
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
      path.setAttribute("d", d);
      svg.appendChild(path);
      return svg;
    }
    var msgIcon = buildIcon(
      "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    );
    var chevronIcon = buildIcon("M6 9l6 6 6-6");

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
      el.style.transition = "all 0.5s ease-in-out";
      el.style.pointerEvents = "none";
    }
    setIconBaseStyles(msgIcon);
    setIconBaseStyles(chevronIcon);
    msgIcon.style.opacity = "1";
    msgIcon.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
    chevronIcon.style.opacity = "0";
    chevronIcon.style.transform =
      "translate(-50%, -50%) rotate(-180deg) scale(0.5)";
    iconContainer.appendChild(msgIcon);
    iconContainer.appendChild(chevronIcon);

    // ---- Hover ----
    button.addEventListener("mouseenter", function () {
      if (!open) button.style.transform = "translateY(-4px)";
    });
    button.addEventListener("mouseleave", function () {
      if (!open) button.style.transform = "translateY(0)";
    });

    // ---- Toggle ----
    function lockBodyScroll() {
      if (!isMobile) return;
      if (savedBodyOverflow === null) {
        savedBodyOverflow = document.body.style.overflow || "";
      }
      document.body.style.overflow = "hidden";
    }
    function unlockBodyScroll() {
      if (!isMobile) return;
      if (savedBodyOverflow !== null) {
        document.body.style.overflow = savedBodyOverflow;
        savedBodyOverflow = null;
      }
    }

    function toggleChat() {
      open = !open;
      if (open) {
        if (state === "errored") {
          // Reabrir tras error → reintentar automáticamente; usuario no debería
          // tener que apretar "Reintentar" si solo cerró y volvió a abrir.
          reload();
        } else {
          loadIframe(); // first time only; subsequent are no-ops
        }
      }

      if (open) {
        if (state === "ready") {
          iframe.style.visibility = "visible";
          iframe.style.pointerEvents = "auto";
          hideError();
          hideSplash();
        } else if (state === "errored") {
          // mostrar overlay; iframe oculto
          syncOverlayGeometry();
          errorOverlay.style.display = "flex";
          iframe.style.visibility = "hidden";
          iframe.style.pointerEvents = "none";
          hideSplash();
        } else {
          // loading: mostrar splash sobre iframe blanco hasta handshake.
          iframe.style.visibility = "visible";
          iframe.style.pointerEvents = "auto";
          showSplash();
        }
        lockBodyScroll();
      } else {
        iframe.style.visibility = "hidden";
        iframe.style.pointerEvents = "none";
        hideError();
        hideSplash();
        unlockBodyScroll();
      }

      button.setAttribute("aria-label", open ? "Cerrar chat" : "Abrir chat");

      if (open) {
        button.style.transform = "scale(1.05)";
        setTimeout(function () {
          button.style.transform = "scale(1)";
        }, 200);
        msgIcon.style.opacity = "0";
        msgIcon.style.transform =
          "translate(-50%, -50%) rotate(180deg) scale(0.5)";
        chevronIcon.style.opacity = "1";
        chevronIcon.style.transform =
          "translate(-50%, -50%) rotate(0deg) scale(1)";
      } else {
        button.style.transform = "translateY(0)";
        msgIcon.style.opacity = "1";
        msgIcon.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
        chevronIcon.style.opacity = "0";
        chevronIcon.style.transform =
          "translate(-50%, -50%) rotate(-180deg) scale(0.5)";
      }
    }

    button.addEventListener("click", toggleChat);

    // ---- Resize handling ----
    var resizeRaf = null;
    function onResize() {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(function () {
        var nextMobile = detectMobile();
        if (nextMobile !== isMobile) {
          isMobile = nextMobile;
          applyIframeGeometry();
          applyPosition();
          errorOverlay.style.borderRadius = isMobile ? "0" : "16px";
        }
        if (errorOverlay.style.display !== "none") {
          syncOverlayGeometry();
        }
        if (splashOverlay.style.display !== "none") {
          syncSplashGeometry();
        }
      });
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    document.body.appendChild(button);
    document.body.appendChild(iframe);
    document.body.appendChild(splashOverlay);
    document.body.appendChild(errorOverlay);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[chatbot-widget] Error al inicializar widget:", err);
  }
})();
