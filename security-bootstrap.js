(() => {
  if (new URLSearchParams(location.search).get("demo") === "1") {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    window.__fdeAuth = {
      user: { role: "legacy_test", displayName: "公开演示顾问", username: "public-demo" },
      writeToken: "demo-write-token",
      expiresAt,
      absoluteExpiresAt: expiresAt,
    };
    window.fdeSessionReady = Promise.resolve(window.__fdeAuth);
    return;
  }
  const nativeFetch = window.fetch.bind(window);
  const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  let sessionPromise = null;
  let lastUserActivityAt = 0;
  let warningElement = null;
  const RECENT_ACTIVITY_MS = 10 * 60 * 1000;
  const WARNING_WINDOW_MS = 5 * 60 * 1000;
  const allowedRouteParams = new Set([
    "projectSection",
    "sourceType",
    "prepSection",
    "reportType",
    "reportSection",
    "settingsSection",
    "enterpriseId",
  ]);

  function markUserActivity() {
    lastUserActivityAt = Date.now();
  }

  function hasRecentActivity() {
    return Date.now() - lastUserActivityAt <= RECENT_ACTIVITY_MS;
  }

  function renewalHeaders() {
    return hasRecentActivity() ? { "x-fde-session-renew": "active" } : {};
  }

  function goToLogin() {
    const current = new URL(location.href);
    for (const key of [...current.searchParams.keys()])
      if (!allowedRouteParams.has(key)) current.searchParams.delete(key);
    const next = `${current.pathname}${current.search}${current.hash}`;
    location.replace(`/login.html?next=${encodeURIComponent(next)}`);
  }

  function loadSession({ refresh = false } = {}) {
    if (refresh) sessionPromise = null;
    if (!sessionPromise)
      sessionPromise = nativeFetch("/api/session", {
        cache: "no-store",
        headers: { accept: "application/json", ...renewalHeaders() },
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          goToLogin();
          throw new Error("登录已失效");
        }
        if (!response.ok || !payload.writeToken || !payload.user)
          throw new Error(payload.message || "无法建立安全会话");
        window.__fdeAuth = {
          user: payload.user,
          writeToken: payload.writeToken,
          expiresAt: payload.expiresAt,
          absoluteExpiresAt: payload.absoluteExpiresAt,
        };
        updateExpiryWarning();
        return window.__fdeAuth;
      });
    return sessionPromise;
  }

  async function secureFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(
      init.method || request?.method || "GET",
    ).toUpperCase();
    const target = new URL(request?.url || String(input), location.href);
    if (target.origin !== location.origin) return nativeFetch(input, init);
    const headers = new Headers(request?.headers || undefined);
    new Headers(init.headers || undefined).forEach((value, key) =>
      headers.set(key, value),
    );
    if (hasRecentActivity()) headers.set("x-fde-session-renew", "active");
    if (writeMethods.has(method)) {
      if (!headers.has("content-type"))
        headers.set("content-type", "application/json");
      headers.set("x-fde-write-token", (await loadSession()).writeToken);
    }
    let response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401) {
      goToLogin();
      return response;
    }
    if (response.status === 403 && writeMethods.has(method)) {
      const payload = await response
        .clone()
        .json()
        .catch(() => ({}));
      if (payload.error === "write_token_invalid") {
        headers.set(
          "x-fde-write-token",
          (await loadSession({ refresh: true })).writeToken,
        );
        response = await nativeFetch(input, { ...init, headers });
      }
    }
    return response;
  }

  function ensureExpiryWarning() {
    if (warningElement || !document.body) return warningElement;
    warningElement = document.createElement("aside");
    warningElement.className = "session-expiry-warning";
    warningElement.hidden = true;
    warningElement.setAttribute("role", "status");
    warningElement.setAttribute("aria-live", "polite");
    warningElement.innerHTML =
      '<div><strong>登录即将到期</strong><span data-session-expiry-text>请保存当前内容，或继续使用以延长本次会话。</span></div><button type="button" data-session-renew>继续使用</button>';
    warningElement
      .querySelector("[data-session-renew]")
      .addEventListener("click", async () => {
        markUserActivity();
        await loadSession({ refresh: true });
      });
    document.body.append(warningElement);
    return warningElement;
  }

  function updateExpiryWarning() {
    const warning = ensureExpiryWarning();
    const expiresAt = Date.parse(window.__fdeAuth?.expiresAt || "");
    if (!warning || !Number.isFinite(expiresAt)) return;
    const remaining = expiresAt - Date.now();
    warning.hidden = remaining > WARNING_WINDOW_MS;
    if (!warning.hidden) {
      const minutes = Math.max(0, Math.ceil(remaining / 60000));
      warning.querySelector("[data-session-expiry-text]").textContent =
        remaining > 0
          ? `约 ${minutes} 分钟后到期，请保存当前内容或继续使用。`
          : "会话已到期，正在重新验证登录状态。";
    }
    if (remaining <= 0) loadSession({ refresh: true }).catch(() => {});
  }

  ["pointerdown", "keydown", "touchstart", "input"].forEach((eventName) =>
    document.addEventListener(eventName, markUserActivity, {
      capture: true,
      passive: eventName !== "keydown" && eventName !== "input",
    }),
  );
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateExpiryWarning();
      if (hasRecentActivity()) loadSession({ refresh: true }).catch(() => {});
    }
  });
  setInterval(() => {
    updateExpiryWarning();
    if (!document.hidden && hasRecentActivity())
      loadSession({ refresh: true }).catch(() => {});
  }, 5 * 60 * 1000);
  setInterval(updateExpiryWarning, 30 * 1000);

  window.fdeSessionReady = loadSession();
  window.fetch = secureFetch;
})();
