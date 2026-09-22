import { gsap as gsapRuntime } from "./vendor/gsap/index.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const statusTone = {
  recommended: "good",
  conditional: "warn",
  not_recommended: "bad",
};
const projectSections = [
  ["overview", "项目总览"],
  ["delivery-plan", "诊断方案"],
  ["connectors", "数据接入"],
  ["mappings", "批次与映射"],
  ["diagnosis", "诊断结果"],
  ["confirmation", "企业确认"],
  ["decision", "决策记录"],
  ["delivery", "方案与验证"],
];
const projectNavGroups = [
  { label: "项目上下文", english: "CONTEXT", keys: ["overview", "delivery-plan"] },
  { label: "证据与诊断", english: "EVIDENCE", keys: ["connectors", "mappings", "diagnosis", "confirmation"] },
  { label: "交付与验证", english: "DELIVERY", keys: ["decision", "delivery"] },
];
const sourceTypeLabel = {
  system: "系统",
  system_partial: "系统（部分）",
  database: "数据库",
  api: "API",
  spreadsheet: "表格文件",
  questionnaire: "企业问卷",
  upload: "上传资料",
  manual: "人工记录",
  chat: "聊天记录",
};
const stageOrder = ["input", "sources", "evidence", "recommendation", "report"];
const enterpriseAccountRoles = new Set([
  "enterprise_owner",
  "enterprise_admin",
  "enterprise_authorizer",
  "enterprise_process_owner",
  "enterprise_result_reviewer",
]);
const isEnterpriseAccount = (role = authContext?.user?.role) => enterpriseAccountRoles.has(role);
const enterpriseEntryRole = (role = authContext?.user?.role) => role === "enterprise_owner" ? "enterprise_authorizer" : role;
let screenings = [],
  lifecycleItems = [],
  selected = null,
  currentRole = "fde_owner",
  activeView = "queue",
  activeFilter = "all",
  settingsSection =
    new URLSearchParams(location.search).get("settingsSection") || "archived",
  activeStage = "input",
  activeProjectSection = "overview",
  activeSourceType = "all",
  diagnosticSubnavOpen = localStorage.getItem("fde-diagnostic-subnav-collapsed") !== "true",
  activeReportSection = "01",
  activeReportType = "screening",
  activePrepSection = "materials",
  stageProgress = {},
  prepChecks = {},
  enterpriseActionState = {},
  enterpriseActiveAction = null,
  enterpriseError = "",
  samplePreview = null,
  actionBusy = false,
  settingsLoading = false,
  authContext = null;
const renderLifecycle = Object.fromEntries(
  ["project", "enterprise", "prep", "reports", "settings"].map((view) => [view, new Set()]),
);
const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
function animateDiagnosticSidebarSubnav(open) {
  const list = document.querySelector("#diagnostic-subnav-list");
  const gsap = gsapRuntime;
  if (!list || !gsap || prefersReducedMotion()) return;
  gsap.killTweensOf(list);
  if (open) {
    gsap.fromTo(
      list,
      { autoAlpha: 0, y: -4 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.22,
        ease: "power2.out",
        clearProps: "opacity,visibility,transform",
      },
    );
    return;
  }
  gsap.to(list, {
    autoAlpha: 0,
    y: -4,
    duration: 0.16,
    ease: "power2.out",
    onComplete: () => gsap.set(list, { clearProps: "opacity,visibility,transform" }),
  });
}
function animateWorkspaceView(view) {
  const panel = document.querySelector(`#fde-view > [data-view-panel="${view}"]`);
  const gsap = gsapRuntime;
  if (!panel || panel.hidden || !gsap || prefersReducedMotion()) return;
  gsap.killTweensOf(panel);
  gsap.fromTo(
    panel,
    { autoAlpha: 0, y: 8 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.22,
      ease: "power2.out",
      clearProps: "opacity,visibility,transform",
    },
  );
}
function onRendered(view, listener) {
  renderLifecycle[view]?.add(listener);
  return () => renderLifecycle[view]?.delete(listener);
}
function notifyRendered(view) {
  for (const listener of renderLifecycle[view] || []) {
    try {
      listener();
    } catch (error) {
      console.error(`render hook failed: ${view}`, error);
      showNotice(`页面增强模块未完成：${error.message}`, "error");
    }
  }
}
const nativeFetch = window.fetch.bind(window);
const allowedRouteParams = new Set([
  "demo",
  "projectSection",
  "sourceType",
  "prepSection",
  "reportType",
  "reportSection",
  "settingsSection",
  "enterpriseId",
  "entry",
  "connectorRole",
]);
const fetch = (input, init) =>
  nativeFetch(
    location.protocol === "file:" &&
      typeof input === "string" &&
      input.startsWith("/")
      ? `http://127.0.0.1:4174${input}`
      : input,
    init,
  );

function localJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}
function sanitizeRouteUrl() {
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()])
    if (!allowedRouteParams.has(key)) url.searchParams.delete(key);
  if (authContext?.user?.role !== "legacy_test") {
    url.searchParams.delete("entry");
    url.searchParams.delete("connectorRole");
  }
  if (isEnterpriseAccount())
    url.searchParams.delete("enterpriseId");
  history.replaceState(null, "", url);
}
function updateUrl(view) {
  sanitizeRouteUrl();
  const url = new URL(location.href);
  for (const key of [
    "projectSection",
    "sourceType",
    "prepSection",
    "reportType",
    "reportSection",
    "settingsSection",
  ])
    url.searchParams.delete(key);
  url.hash = view;
  if (view === "project") {
    url.searchParams.set("projectSection", activeProjectSection);
    url.searchParams.set("sourceType", activeSourceType);
  }
  if (view === "prep") url.searchParams.set("prepSection", activePrepSection);
  if (view === "reports") {
    url.searchParams.set("reportType", activeReportType);
    url.searchParams.set("reportSection", activeReportSection);
  }
  if (view === "settings")
    url.searchParams.set("settingsSection", settingsSection);
  if (
    view === "enterprise" &&
    selected?.enterpriseId &&
    authContext?.user?.role === "legacy_test"
  ) {
    url.searchParams.set("enterpriseId", selected.enterpriseId);
    if (currentRole !== "fde_owner") url.searchParams.set("entry", currentRole);
  } else {
    url.searchParams.delete("entry");
    if (isEnterpriseAccount())
      url.searchParams.delete("enterpriseId");
  }
  history.replaceState(null, "", url);
}
function renderDiagnosticSidebarSubnav({ animate = false, rebuild = true } = {}) {
  const list = document.querySelector("#diagnostic-subnav-list");
  const navButton = document.querySelector('.sidebar-nav [data-view="project"]');
  if (!list) return;
  const visible = currentRole === "fde_owner" && !document.querySelector("#fde-view")?.hidden;
  list.hidden = !visible;
  list.classList.toggle("is-collapsed", !visible || !diagnosticSubnavOpen);
  list.setAttribute("aria-hidden", String(!visible || !diagnosticSubnavOpen));
  navButton?.setAttribute("aria-expanded", String(visible && diagnosticSubnavOpen));
  if (!visible) {
    list.replaceChildren();
    return;
  }
  if (rebuild || !list.children.length) {
    let index = 0;
    list.innerHTML = projectNavGroups.map(({ label, english, keys }) => `<div class="sidebar-subnav-group" data-nav-group="${english.toLowerCase()}"><span class="sidebar-subnav-group-label">${english} · ${label}</span>${keys.map((key) => {
      const item = projectSections.find(([section]) => section === key);
      if (!item) return "";
      index += 1;
      const active = key === activeProjectSection;
      return `<button type="button" class="sidebar-subnav-item ${active ? "active" : ""}" data-project-section="${key}" data-nav-index="${String(index).padStart(2, "0")}" aria-current="${active ? "page" : "false"}">${item[1]}</button>`;
    }).join("")}</div>`).join("");
    list.querySelectorAll("[data-project-section]").forEach((button) => {
      button.addEventListener("click", () => {
        activeProjectSection = button.dataset.projectSection;
        setView("project");
      });
    });
  }
  if (animate) animateDiagnosticSidebarSubnav(diagnosticSubnavOpen);
}
function toggleDiagnosticSidebarSubnav() {
  if (currentRole !== "fde_owner") return;
  if (activeView !== "project") {
    diagnosticSubnavOpen = true;
    localStorage.setItem("fde-diagnostic-subnav-collapsed", "false");
    setView("project");
    return;
  }
  diagnosticSubnavOpen = !diagnosticSubnavOpen;
  localStorage.setItem("fde-diagnostic-subnav-collapsed", String(!diagnosticSubnavOpen));
  renderDiagnosticSidebarSubnav({ animate: true, rebuild: false });
}
function viewHeading(view) {
  return (
    document.querySelector(`#${view}-title`) ||
    (currentRole === "fde_owner" && view !== "enterprise"
      ? document.querySelector(".workspace-topbar h1")
      : null)
  );
}
const fdeWorkspaceHeadings = {
  queue: {
    eyebrow: "FDE DELIVERY CONSOLE / 01",
    title: "驻场前的初筛",
    description: "先远程确认数据基础，再决定是否投入现场顾问。",
  },
  project: {
    eyebrow: "FDE DELIVERY CONSOLE / 02",
    title: "诊断项目",
    description: "一条目标流程，一组证据，一个驻场决策。",
  },
  prep: {
    eyebrow: "FDE DELIVERY CONSOLE / 03",
    title: "介入与验证",
    description: "按 FDE 决策进入远程补证、试点、条件驻场、驻场准备与结果观察。",
  },
  reports: {
    eyebrow: "FDE DELIVERY CONSOLE / 04",
    title: "跨项目交付资产",
    description: "集中查看初筛、诊断、决策与介入结果，不受当前业务阶段限制。",
  },
  settings: {
    eyebrow: "FDE DELIVERY CONSOLE / 05",
    title: "系统治理",
    description: "管理全局规则、权限、契约、审计和项目生命周期。",
  },
};
function updateFdeWorkspaceHeading(view) {
  if (currentRole !== "fde_owner") return;
  const heading = fdeWorkspaceHeadings[view] || fdeWorkspaceHeadings.queue;
  const eyebrow = document.querySelector(".workspace-topbar .eyebrow");
  const title = document.querySelector(".workspace-topbar h1");
  const description = document.querySelector("#workspace-topbar-description");
  if (eyebrow) eyebrow.textContent = heading.eyebrow;
  if (title) title.textContent = heading.title;
  if (description) description.textContent = heading.description;
}
function setView(view, { writeUrl = true, focus = true } = {}) {
  if (authContext?.user?.role === "admin") view = "settings";
  if (currentRole !== "fde_owner" && view !== "enterprise") view = "enterprise";
  if (currentRole === "admin") view = "settings";
  if (currentRole === "fde_owner" && view === "enterprise") view = "queue";
  if (
    !["queue", "project", "prep", "reports", "settings", "enterprise"].includes(
      view,
    )
  )
    view = "queue";
  activeView = view;
  updateFdeWorkspaceHeading(view);
  document.body.dataset.activeView = view;
  renderDiagnosticSidebarSubnav();
  document
    .querySelectorAll("#fde-view > [data-view-panel]")
    .forEach((panel) => {
      panel.hidden =
        currentRole !== "fde_owner" || panel.dataset.viewPanel !== view;
    });
  document.querySelector("#enterprise").hidden =
    currentRole === "fde_owner" || view !== "enterprise";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const roleAllows =
      currentRole === "admin"
        ? button.dataset.view === "settings"
        : currentRole === "fde_owner"
          ? button.dataset.view !== "enterprise"
          : button.dataset.view === "enterprise";
    const active = button.dataset.view === view && roleAllows;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (view === "queue") {
    renderMetrics();
    renderQueue();
    renderContext();
  }
  if (view === "project") renderProject();
  if (view === "prep") renderPrep();
  if (view === "reports") renderReports();
  if (view === "settings") openSettings();
  if (view === "enterprise") renderEnterprise();
  animateWorkspaceView(view);
  if (writeUrl) updateUrl(view);
  if (focus) {
    const heading = viewHeading(view);
    if (heading) heading.focus({ preventScroll: true });
  }
}
function syncRoute() {
  sanitizeRouteUrl();
  const params = new URLSearchParams(location.search);
  activeProjectSection = params.get("projectSection") || activeProjectSection;
  activeSourceType = params.get("sourceType") || activeSourceType;
  activePrepSection = params.get("prepSection") || activePrepSection;
  activeReportType = normalizeReportType(params.get("reportType") || activeReportType);
  activeReportSection = params.get("reportSection") || activeReportSection;
  settingsSection = params.get("settingsSection") || settingsSection;
  const routedEnterprise = params.get("enterpriseId");
  if (routedEnterprise)
    selected =
      screenings.find((item) => item.enterpriseId === routedEnterprise) ||
      selected;
  if (isEnterpriseAccount()) {
    setRole(enterpriseEntryRole(), { fromRoute: true });
    return;
  }
  if (authContext?.user?.role === "admin") {
    setRole("admin", { fromRoute: true });
    return;
  }
  if (authContext?.user?.role === "legacy_test") {
    const entry = params.get("entry");
    if (["enterprise_authorizer", "enterprise_process_owner"].includes(entry)) {
      setRole(entry, { fromRoute: true });
      return;
    }
  }
  if (currentRole !== "fde_owner") setRole("fde_owner", { fromRoute: true });
  else setView(location.hash.slice(1) || "queue", { writeUrl: false });
}
function selectScreening(item) {
  if (!item) return;
  selected = item;
  activeStage = "input";
  activeProjectSection = "overview";
  activeReportSection = "01";
  renderQueue();
  renderContext();
  if (activeView !== "queue") setView("project");
}
function renderEnterpriseProjectSwitcher(current = selected) {
  if (currentRole !== "fde_owner") return "";
  const items = screenings.filter((item) => !item.archived && !item.deleted);
  if (items.length < 2) return "";
  return `<div class="context-project-switcher"><div class="context-project-switcher-head"><span class="eyebrow">当前企业项目</span><span class="context-project-switcher-mode">FDE 可切换</span></div><select id="context-enterprise-project" aria-label="切换当前企业项目；仅切换项目上下文，不改变登录身份或权限" data-enterprise-project-switcher>${items.map((item) => `<option value="${esc(item.enterpriseId)}" ${item.enterpriseId === current?.enterpriseId ? "selected" : ""}>${esc(item.name)} · ${esc(item.statusLabel)}</option>`).join("")}</select></div>`;
}
function switchEnterpriseProject(enterpriseId) {
  if (currentRole !== "fde_owner") return;
  const next = screenings.find((item) => item.enterpriseId === enterpriseId && !item.archived && !item.deleted);
  if (!next || next.enterpriseId === selected?.enterpriseId) return;
  selected = next;
  const url = new URL(location.href);
  url.searchParams.set("enterpriseId", next.enterpriseId);
  history.replaceState(null, "", url);
  if (activeView === "queue") {
    renderMetrics();
    renderQueue();
    renderContext();
  } else if (activeView === "project") {
    renderProject();
    renderContext();
  } else if (activeView === "reports") {
    renderReports();
  } else if (activeView === "prep") {
    renderPrep();
  }
  showNotice(`已切换到企业项目：${next.name}`, "success");
}
function showNotice(message, tone = "success") {
  const node = document.querySelector("#status");
  node.hidden = false;
  node.className = `notice ${tone === "error" ? "error" : tone === "warning" ? "warning" : "success"}`;
  node.textContent = message;
  node.setAttribute("role", tone === "error" ? "alert" : "status");
}
function renderBootError(error) {
  const node = document.querySelector("#status");
  node.hidden = false;
  node.className = "notice error";
  node.innerHTML = `无法读取初筛项目：${esc(error.message)} <button type="button" class="inline-retry" data-retry>重试</button>`;
  node.querySelector("[data-retry]").addEventListener("click", boot);
}

async function stageAction(stage) {
  if (!selected || actionBusy) return;
  if (stage === "report") {
    setView("reports");
    return;
  }
  if (stage === "recommendation") {
    await recordDecision();
    return;
  }
  actionBusy = true;
  stageProgress[selected.id] ??= {};
  stageProgress[selected.id][stage] = "running";
  renderProject();
  showNotice(
    stage === "input"
      ? "正在核对企业输入…"
      : stage === "sources"
        ? "正在检查数据来源…"
        : "正在运行证据检查…",
    "warning",
  );
  await new Promise((resolve) => setTimeout(resolve, 260));
  stageProgress[selected.id][stage] = "completed";
  actionBusy = false;
  const next = stageOrder[stageOrder.indexOf(stage) + 1] || "recommendation";
  activeStage = next;
  renderProject();
  showNotice(
    stage === "input"
      ? "企业输入已确认，进入数据来源检查。"
      : stage === "sources"
        ? "数据来源检查完成，进入证据检查。"
        : "证据检查完成：结果仅基于当前合成数据。",
    "success",
  );
}
function renderMetrics() {
  const active = screenings.filter((x) => !x.archived).sort((a,b)=>(b.work?.priority||0)-(a.work?.priority||0));
  const total = active.length,
    ready = active.filter((x) => x.status === "recommended").length,
    conditional = active.filter((x) => x.status === "conditional").length,
    no = active.filter((x) => x.status === "not_recommended").length;
  document.querySelector("#metric-strip").innerHTML = [
    ["待决策企业", total, "当前筛选队列"],
    ["具备远程诊断基础", ready, "仍需 FDE 记录路径"],
    ["需要补充", conditional, "远程验证可继续"],
    ["暂缺可验证数据", no, "先补齐最小样本"],
  ]
    .map(
      ([label, value, note]) =>
        `<div class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`,
    )
    .join("");
}
function renderQueue() {
  const list = document.querySelector("#screening-list");
  if (!list) return;
  const active = screenings.filter((x) => !x.archived);
  const items =
    activeFilter === "all"
      ? active
      : activeFilter === "archived"
        ? screenings.filter((x) => x.archived)
        : active.filter((x) => x.status === activeFilter);
  const count = document.querySelector("#queue-count");
  if (count) count.textContent = items.length;
  const counts = {
    all: active.length,
    recommended: active.filter((x) => x.status === "recommended").length,
    conditional: active.filter((x) => x.status === "conditional").length,
    not_recommended: active.filter((x) => x.status === "not_recommended")
      .length,
    archived: screenings.filter((x) => x.archived).length,
  };
  list.setAttribute("aria-busy", "false");
  list.innerHTML = items.length
    ? items
        .map(
          (item, index) =>
            `<article class="screening-card ${selected?.id === item.id ? "selected" : ""} ${item.archived ? "is-archived" : ""}"><button type="button" class="screening-card-main" data-screening-id="${esc(item.id)}"><span class="card-index">${String(index + 1).padStart(2, "0")}</span><span class="card-main"><span class="card-kicker">${esc(item.industry)} · ${esc(item.flow)}</span><strong>${esc(item.name)}</strong><span class="card-summary">${esc(item.summary)}</span><span class="card-meta"><span class="status-badge ${statusTone[item.status] || "warn"}">${esc(item.statusLabel)}</span>${item.archived ? '<span class="archived-label">已归档</span>' : ""}<span>更新 ${esc(item.updated)}</span></span></span><span class="card-score"><strong>五维</strong><small>判断面</small><span>不合成总分</span></span><span class="card-arrow" aria-hidden="true">→</span></button><div class="screening-card-actions" aria-label="${esc(item.name)}项目操作"><button type="button" class="screening-card-action" data-screening-action="archive" data-screening-id="${esc(item.id)}">${item.archived ? "恢复" : "归档"}</button><button type="button" class="screening-card-action danger" data-screening-action="delete" data-screening-id="${esc(item.id)}">删除</button></div></article>`,
        )
        .join("")
    : `<div class="empty-state"><strong>${activeFilter === "archived" ? "暂无已归档项目" : "当前筛选没有项目"}</strong><span>${activeFilter === "archived" ? "归档后的项目会保留在这里，必要时可以恢复。" : "清除筛选后查看全部企业。"}</span><button type="button" class="quiet-button" data-clear-filter>查看全部</button></div>`;
  for(const item of items){
    if(!item.work)continue;
    const button=[...list.querySelectorAll('.screening-card-main')].find(node=>node.dataset.screeningId===item.id);
    if(!button)continue;
    button.querySelector('.card-summary').textContent=`${item.work.phase} · ${item.work.reason}`;
    const score=button.querySelector('.card-score');score.innerHTML=`<strong>${item.work.priority}</strong><small>处理优先级</small><span>不是诊断分数</span>`;
    const detail=document.createElement('span');detail.className='card-summary';
    const role={fde:'FDE顾问',enterprise_authorizer:'企业授权人',enterprise_process_owner:'企业流程负责人',enterprise_admin:'企业管理员',enterprise_result_reviewer:'企业验收人'}[item.work.ownerRole]||'待分配';
    detail.textContent=`下一步：${item.work.nextAction} · 责任：${role} · 最近动作：${item.work.updatedAt?new Date(item.work.updatedAt).toLocaleString():'尚无已完成动作'}。${item.work.risk}`;
    button.querySelector('.card-main').append(detail);
  }
  list
    .querySelectorAll(".screening-card-main")
    .forEach((button) =>
      button.addEventListener("click", () =>
        selectScreening(
          screenings.find((x) => x.id === button.dataset.screeningId),
        ),
      ),
    );
  list.querySelectorAll("[data-screening-action]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      updateScreeningLifecycle(
        screenings.find((x) => x.id === button.dataset.screeningId),
        button.dataset.screeningAction,
      );
    }),
  );
  list.querySelector("[data-clear-filter]")?.addEventListener("click", () => {
    activeFilter = "all";
    renderQueue();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === activeFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    const badge = button.querySelector("span");
    if (badge) badge.textContent = counts[button.dataset.filter] ?? 0;
  });
}
async function updateScreeningLifecycle(item, action) {
  if (!item || actionBusy) return;
  if (
    action === "delete" &&
    !window.confirm(
      `确定从企业项目台移除“${item.name}”吗？项目历史会保留，可追溯但不会继续出现在队列中。`,
    )
  )
    return;
  const isArchive = action === "archive";
  actionBusy = true;
  try {
    const response = await fetch(
      `/api/screenings/${encodeURIComponent(item.id)}${isArchive ? "/archive" : ""}`,
      {
        method: isArchive ? "PATCH" : "DELETE",
        headers: {
          "content-type": "application/json",
          "x-actor-id": "fde-demo",
          "x-role": "fde",
          "x-enterprise-id": "portfolio",
        },
        ...(isArchive
          ? { body: JSON.stringify({ archived: !item.archived }) }
          : {}),
      },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error);
    const index = screenings.findIndex((x) => x.id === item.id);
    if (action === "delete") {
      screenings.splice(index, 1);
      if (selected?.id === item.id) {
        selected = screenings.find((x) => !x.archived) || screenings[0] || null;
        activeFilter = "all";
      }
    } else {
      screenings[index] = payload.screening;
      if (selected?.id === item.id) selected = payload.screening;
    }
    if (!selected && activeView !== "queue") setView("queue");
    else {
      renderMetrics();
      renderQueue();
      renderContext();
    }
    showNotice(
      action === "delete"
        ? "项目已从企业项目台移除，历史记录已保留。"
        : item.archived
          ? "项目已恢复到企业项目台。"
          : "项目已归档，可在“已归档”中查看。",
      "success",
    );
  } catch (error) {
    showNotice(`项目操作失败：${error.message}`, "error");
  } finally {
    actionBusy = false;
  }
}
function renderContext() {
  const box = document.querySelector("#context-content");
  if (!box) return;
  if (!selected) {
    box.innerHTML =
      '<div class="empty-state"><strong>尚未选择企业</strong><span>从企业项目台选择一个项目查看详情。</span></div>';
    return;
  }
  // Project context belongs to the workflow projection, not the score summary.
  if (activeView === "project") {
    if (box.querySelector(".project-flow-context")?.dataset.enterpriseId !== selected.enterpriseId)
      box.innerHTML = '<div class="loading-state" role="status">正在核对项目阶段与企业最新提交…</div>';
    return;
  }
  box.innerHTML = `${renderEnterpriseProjectSwitcher(selected)}<div class="context-company"><span class="context-symbol">${esc(selected.short)}</span><div><strong>${esc(selected.name)}</strong><small>${esc(selected.industry)}</small></div></div><div class="context-decision ${statusTone[selected.status] || "warn"}"><span>当前建议</span><strong>${esc(selected.statusLabel)}</strong><p>${esc(selected.gate)}</p></div><div class="context-stat"><span>数据准备度</span><strong>${esc(selected.readiness)}</strong></div><div class="context-stat"><span>目标流程</span><strong>${esc(selected.flow)}</strong></div><button class="rail-action" type="button" data-open-project>打开诊断项目 →</button>`;
  box.querySelector("[data-enterprise-project-switcher]")?.addEventListener("change", (event) => switchEnterpriseProject(event.currentTarget.value));
  box
    .querySelector("[data-open-project]")
    .addEventListener("click", () => setView("project"));
}
function projectSectionRows(key) {
  const e = selected.evidence || [];
  const sourceCatalog = selected.sourceCatalog || { types: [], readRoutes: [] };
  if (key === "overview")
    return [
      ["项目", selected.id],
      ["企业", selected.name],
      ["行业", selected.industry],
      ["当前状态", selected.statusLabel],
      [
        "企业问卷",
        selected.questionnaire
          ? `v${selected.questionnaire.version} · 已提交`
          : "尚未提交",
      ],
    ];
  if (key === "objective")
    return [
      ["业务目标", `远程判断 ${selected.flow} 是否值得驻场`],
      ["当前痛点", selected.summary],
      [
        "企业问卷",
        selected.questionnaire
          ? `已收到 v${selected.questionnaire.version}，待与样本证据交叉核验`
          : "等待企业填写结构化问卷",
      ],
      ["责任边界", "FDE 负责判断与记录，企业负责提供和确认事实"],
    ];
  if (key === "flow")
    return [
      ["目标流程", selected.flow],
      ["流程对象", "订单 / 任务 / 案件及其状态变化"],
      ["进入条件", "先完成数据基础和可追溯性检查"],
    ];
  if (key === "sources") {
    const sourceRows = (selected.sources || [])
      .filter((x) => activeSourceType === "all" || x[1] === activeSourceType)
      .map((x) => [x[0], `${sourceTypeLabel[x[1]] || x[1]} · ${x[2]}`]);
    return [
      ...(sourceRows.length
        ? sourceRows
        : [
            [
              sourceTypeLabel[activeSourceType] || activeSourceType,
              "尚未提供该类型来源样例",
            ],
          ]),
      ["未来来源类型", sourceCatalog.types.map((x) => x[0]).join("、")],
      [
        "读取接口族",
        `${sourceCatalog.readRoutes.length} 个预留动作：discover、preview、read-runs、pause、revoke`,
      ],
      ["读取接口状态", "接口边界已预留；当前仅合成演示"],
    ];
  }
  if (key === "data") return e.map((x) => [x[0], `${x[1]} · ${x[2]}`]);
  if (key === "trace")
    return [
      ["案件/订单编号", e.find((x) => x[0] === "结构化程度")?.[1] || "待确认"],
      ["活动与状态变化", e.find((x) => x[0] === "流程可追溯")?.[1] || "待确认"],
      [
        "时间与责任角色",
        selected.status === "recommended" ? "已具备" : "待补充",
      ],
      [
        "远程验证问题",
        selected.signals?.length ? "已发现问题信号" : "尚未形成可计算信号",
      ],
    ];
  if (key === "signals")
    return selected.signals?.length
      ? selected.signals.map((x) => [x[0], `${x[1]} · ${x[2]}`])
      : [["阻断信号", "核心流程没有可读取的电子事件链"]];
  if (key === "score")
    return [
      ["判断面", "业务价值 · AI/Agent 适配度 · 数据与知识准备度 · 交付与评测准备度 · 安全与合规风险"],
      ["当前准备度", selected.readiness],
      ["FDE 当前状态", selected.statusLabel],
      ["人工门禁", "系统不自动建议驻场、批准 Agent 或执行写回"],
    ];
  return [
    ["系统生成", "已生成本轮初筛结论"],
    [
      "企业确认",
      selected.consultantDecision
        ? "已记录顾问决定"
        : "待企业确认字段、流程和异常含义",
    ],
    [
      "顾问决策",
      selected.consultantDecision
        ? `${selected.consultantDecision.statusLabel} · ${selected.consultantDecision.at}`
        : "待 FDE 顾问记录",
    ],
    ["审计边界", "只记录本地合成演示动作"],
  ];
}
function stageLabel(stage) {
  const progress = stageProgress[selected?.id] || {};
  if (progress[stage] === "running") return "执行中…";
  if (progress[stage] === "completed") return "已完成";
  if (stage === "report") return "可查看";
  return "待执行";
}
function renderProject() {
  const box = document.querySelector("#project-content");
  if (!box || !selected) return;
  const steps = [
    ["input", "01", "企业输入"],
    ["sources", "02", "数据来源"],
    ["evidence", "03", "证据检查"],
    ["recommendation", "04", "驻场建议"],
    ["report", "05", "报告输出"],
  ];
  const current = steps.find((x) => x[0] === activeStage) || steps[0];
  const rows = projectSectionRows(activeProjectSection);
  const sectionTitle =
    projectSections.find((x) => x[0] === activeProjectSection)?.[1] ||
    "项目概览";
  box.innerHTML = `<div class="project-header"><div><span class="eyebrow">${esc(selected.industry)} / ${esc(selected.flow)}</span><h3>${esc(selected.name)}</h3><p>${esc(selected.summary)}</p></div><span class="status-badge ${statusTone[selected.status] || "warn"}">${esc(selected.statusLabel)}</span></div><div class="stepper" role="tablist" aria-label="诊断项目执行流程">${steps.map(([key, n, label]) => `<button type="button" class="step ${key === activeStage ? "current" : ""}" data-stage="${key}" role="tab" aria-selected="${key === activeStage}" aria-controls="project-stage-panel"><span>${n}</span><span><b>${label}</b><small>${stageLabel(key)}</small></span></button>`).join("")}</div><div class="project-architecture"><nav class="project-subnav" aria-label="诊断项目内容导航">${projectSections.map(([key, label]) => `<button type="button" class="project-subnav-item ${key === activeProjectSection ? "active" : ""}" data-project-section="${key}" aria-current="${key === activeProjectSection ? "page" : "false"}">${label}<span>→</span></button>`).join("")}</nav><section id="project-stage-panel" class="project-section-panel" role="tabpanel" aria-labelledby="project-stage-title"><span class="eyebrow">02 / ${esc(sectionTitle)}</span><h4 id="project-stage-title" tabindex="-1">${esc(sectionTitle)}</h4><div class="project-section-rows">${rows.map(([label, value]) => `<div class="project-section-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div><button type="button" class="primary-button" data-project-action="${current[0]}" ${actionBusy ? "disabled" : ""}>${current[0] === "input" ? "确认企业输入" : current[0] === "sources" ? "运行数据来源检查" : current[0] === "evidence" ? "运行证据检查" : current[0] === "recommendation" ? "记录顾问决定" : "打开初筛报告"}</button></section></div><div class="decision-banner ${statusTone[selected.status] || "warn"}"><div><span class="eyebrow">SYSTEM RECOMMENDATION</span><h4>${esc(selected.statusLabel)}</h4><p>${esc(selected.recommendation)}</p></div><div class="decision-actions"><button type="button" class="primary-button" data-report>查看初筛报告</button><button type="button" class="secondary-button" data-decision>进入诊断工作台 · 决策记录</button></div></div>`;
  box.querySelector(".project-details-disclosure")?.remove();
  box.querySelectorAll("[data-stage]").forEach((button) =>
    button.addEventListener("click", () => {
      activeStage = button.dataset.stage;
      renderProject();
    }),
  );
  box.querySelectorAll("[data-project-section]").forEach((button) =>
    button.addEventListener("click", () => {
      activeProjectSection = button.dataset.projectSection;
      renderProject();
    }),
  );
  box
    .querySelector("[data-project-action]")
    .addEventListener("click", () => stageAction(current[0]));
  box
    .querySelector("[data-report]")
    .addEventListener("click", () => setView("reports"));
  box
    .querySelector("[data-decision]")
    .addEventListener("click", recordDecision);
}
function renderPrep() {
  const box = document.querySelector("#prep-content");
  if (!box || !selected) return;
  const sections = [
    ["materials", "材料清单", selected.materials.map((x) => ["待补材料", x])],
    [
      "assumptions",
      "待验证假设",
      (selected.signals?.length ? selected.signals : selected.risks).map((x) =>
        Array.isArray(x) ? ["假设", `${x[0]}：${x[2]}`] : ["假设", x],
      ),
    ],
    [
      "interviewees",
      "访谈对象",
      [
        ["核心负责人", `${selected.flow} 负责人`],
        ["协同部门", "业务、数据、IT 或系统管理员"],
        ["企业确认人", "授权人 / 流程负责人"],
      ],
    ],
    [
      "agenda",
      "现场议程",
      [
        ["01", "确认目标流程与成功标准"],
        ["02", "抽查数据字段和责任节点"],
        ["03", "核验等待、返工或异常信号"],
        ["04", "确定后续方案与边界"],
      ],
    ],
    ["gaps", "数据和权限缺口", selected.risks.map((x) => ["缺口", x])],
    ["risks", "风险与限制", selected.risks.map((x) => ["风险", x])],
    [
      "package",
      "驻场任务包",
      [
        [
          "进入条件",
          selected.status === "not_recommended" ? "未满足" : "可带条件进入",
        ],
        ["现场目标", selected.recommendation],
        ["数据边界", "仅使用企业授权范围内的必要字段"],
      ],
    ],
  ];
  const materialState = prepChecks[selected.id] || {};
  const materialCount = sections[0][2].length;
  const materialDone = Object.values(materialState).filter(Boolean).length;
  box.innerHTML = `<div class="prep-progress"><div><span class="eyebrow">FIELD READINESS</span><strong>驻场准备完成度</strong></div><span>${materialDone} / ${materialCount} 项材料已确认</span></div><div class="prep-layout"><nav class="prep-subnav" aria-label="驻场准备内容导航">${sections.map(([key, label]) => `<button type="button" class="prep-subnav-item ${key === activePrepSection ? "active" : ""}" data-prep-section="${key}" aria-current="${key === activePrepSection ? "page" : "false"}">${label}<span>→</span></button>`).join("")}</nav><div class="prep-sections">${sections.map(([key, label, rows]) => `<section id="prep-${key}" class="prep-section" ${key !== activePrepSection ? "hidden" : ""} aria-labelledby="prep-heading-${key}"><div class="panel-heading"><div><span class="eyebrow">${key.toUpperCase()}</span><h4 id="prep-heading-${key}">${label}</h4></div><span class="source-count">${rows.length} 项</span></div>${key === "materials" ? `<div class="material-checklist">${rows.map(([name, value], index) => `<label class="material-check-row"><input type="checkbox" data-material-index="${index}" ${materialState[index] ? "checked" : ""}><span><b>${esc(value)}</b><small>${materialState[index] ? "已确认，可纳入现场包" : "待补充或核验"}</small></span></label>`).join("")}</div>` : `<div class="project-section-rows">${rows.map(([name, value]) => `<div class="project-section-row"><span>${esc(name)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>`}</section>`).join("")}</div></div>`;
  box.querySelectorAll("[data-prep-section]").forEach((button) =>
    button.addEventListener("click", () => {
      activePrepSection = button.dataset.prepSection;
      updateUrl("prep");
      renderPrep();
    }),
  );
  box.querySelectorAll("[data-material-index]").forEach((input) =>
    input.addEventListener("change", () => {
      prepChecks[selected.id] ??= {};
      prepChecks[selected.id][input.dataset.materialIndex] = input.checked;
      localStorage.setItem(
        "fde-core-prep-checks-v1",
        JSON.stringify(prepChecks),
      );
      renderPrep();
    }),
  );
  notifyRendered("prep");
}
const baseRenderProject = renderProject;
renderProject = function () {
  baseRenderProject();
  if (activeProjectSection !== "sources") return;
  const panel = document.querySelector("#project-stage-panel");
  const catalog = selected?.sourceCatalog?.types || [];
  if (!panel || !catalog.length) return;
  const nav = document.createElement("div");
  nav.className = "source-subnav";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "数据来源类型");
  nav.innerHTML = [
    ["all", "全部来源"],
    ...catalog.map((item) => [item[1], item[0]]),
  ]
    .map(
      ([key, label]) =>
        `<button type="button" role="tab" aria-selected="${activeSourceType === key}" class="${activeSourceType === key ? "active" : ""}" data-source-type="${esc(key)}">${esc(label)}</button>`,
    )
    .join("");
  const contract = document.createElement("details");
  contract.className = "source-contract";
  contract.open = true;
  contract.innerHTML = `<summary><span><b>读取接口契约</b><small>只读 · 合成演示</small></span><strong>${selected.sourceCatalog.readRoutes.length} 个预留动作</strong></summary><div class="source-contract-body"><p>当前没有连接真实 CRM、ERP、数据库或 API；以下是未来接入时必须经过授权的边界。</p><div>${selected.sourceCatalog.readRoutes.map((route) => `<code>${esc(route)}</code>`).join("")}</div></div>`;
  panel.querySelector(".project-section-rows")?.before(nav, contract);
  nav.querySelectorAll("[data-source-type]").forEach((button) =>
    button.addEventListener("click", () => {
      activeSourceType = button.dataset.sourceType;
      updateUrl("project");
      renderProject();
    }),
  );
};
function reportSectionsFor(item) {
  const sections = structuredClone(item.reportSections || []);
  const reportStatusLabels = {
    remote_supplement: "远程补充材料",
    remote_pilot: "远程诊断试点",
    conditional_onsite: "条件式驻场",
    onsite_recommended: "需 FDE 决策",
    awaiting_authorization: "等待企业授权",
    data_connected: "数据来源已连接",
    batch_validated: "数据批次已验收",
    mapping_complete: "数据映射已完成",
    diagnosis_generated: "诊断已生成",
    awaiting_enterprise_confirmation: "等待企业确认",
    decision_ready: "可以形成顾问决策",
    intervention_active: "介入执行中",
    observing: "结果观察中",
    closed: "已结项",
  };
  for (const section of sections)
    section.items = section.items.map((entry) =>
      entry[0] === "当前流程状态" && reportStatusLabels[entry[1]]
        ? ["系统建议路径", reportStatusLabels[entry[1]], entry[2]]
        : entry,
    );
  const decision = sections.find((section) => section.id === "14");
  if (decision && item.consultantDecision)
    decision.items = [
      ["系统建议", item.statusLabel],
      [
        "顾问决定",
        `${item.consultantDecision.statusLabel} · ${item.consultantDecision.at}`,
      ],
      ["记录边界", "顾问决定已写入本地后端审计记录"],
    ];
  return sections;
}
function renderReportTypes() {
  return `<div class="report-package-bar"><div class="report-package-copy"><strong>项目报告包</strong><span>三类交付成果：初筛报告、决策记录、介入结果；证据章节按需展开。</span></div><div class="report-package-actions"><div class="report-types" role="tablist" aria-label="报告类型">${[
    ["screening","初筛报告"],["decision","决策记录"],["outcome","介入结果"]
  ].map(([key,label])=>`<button type="button" role="tab" aria-selected="${activeReportType===key}" class="${activeReportType===key?"active":""}" data-report-type="${key}">${label}</button>`).join("")}</div><button type="button" class="quiet-button report-history-tool" data-report-type="history" aria-pressed="${activeReportType==="history"}">查看诊断版本</button></div></div>`;
}
function normalizeReportType(value) { return value === "process" ? "screening" : value; }
function reportVersionLabel(item) {
  const version=item.connectorDiagnosis?.diagnosisVersion?.current;
  return version ? `诊断 V${version.version} · ${new Date(version.createdAt).toLocaleString("zh-CN",{hour12:false})}${version.status==="generated"?"":" · 待重跑"}` : "尚未生成系统诊断版本";
}

function recordDecision() {
  if (!selected) return;
  activeProjectSection = "decision";
  setView("project");
  updateUrl("project");
  renderProject();
}

function setRole(role, { fromRoute = false } = {}) {
  if (authContext?.user?.role === "admin") {
    currentRole = "admin";
    document.body.dataset.workspaceRole = currentRole;
    document.querySelector("#fde-view").hidden = false;
    document.querySelector("#enterprise").hidden = true;
    document.querySelector("#context-rail").hidden = true;
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.hidden = button.dataset.view !== "settings";
    });
    document.querySelector("#role-switch").hidden = true;
    document.querySelector("#role-menu").hidden = true;
    document.querySelector("#enterprise-entry-label").hidden = true;
    document.querySelector(".workspace-topbar .eyebrow").textContent =
      "PLATFORM ADMINISTRATION";
    document.querySelector(".workspace-topbar h1").textContent = "平台管理";
    document.querySelector("#workspace-topbar-description").textContent =
      "管理成员、邀请、审计与平台级配置。";
    setView("settings", { writeUrl: !fromRoute, focus: false });
    return;
  }
  if (isEnterpriseAccount())
    role = enterpriseEntryRole();
  else if (authContext?.user?.role !== "legacy_test") role = "fde_owner";
  currentRole = role === "fde_owner" ? "fde_owner" : role;
  document.body.dataset.workspaceRole = currentRole;
  const enterprise = currentRole !== "fde_owner";
  const processOwner = currentRole === "enterprise_process_owner";
  const company = selected?.name || "当前企业";
  document.querySelector("#fde-view").hidden = enterprise;
  document.querySelector("#enterprise").hidden = !enterprise;
  const contextRail = document.querySelector("#context-rail");
  contextRail.hidden = false;
  contextRail.setAttribute("aria-label", enterprise ? "当前任务指引" : "当前项目摘要");
  const contextRailHeading = contextRail.querySelector(".rail-heading .eyebrow");
  const contextRailPin = contextRail.querySelector(".rail-heading .rail-pin");
  if (contextRailHeading) contextRailHeading.textContent = enterprise ? "当前任务指引" : "当前项目";
  if (contextRailPin) contextRailPin.textContent = enterprise ? "GUIDE" : "LIVE";
  const contextRailToggle = document.querySelector("#context-rail-toggle");
  if (contextRailToggle) {
    const railLabel = enterprise ? "当前任务指引" : "当前项目摘要";
    const collapsed = document.body.classList.contains("context-rail-collapsed");
    contextRailToggle.setAttribute("aria-label", collapsed ? `展开${railLabel}` : `收起${railLabel}`);
    contextRailToggle.title = collapsed ? `展开${railLabel}` : `收起${railLabel}`;
  }
  document.querySelector(".app-sidebar").hidden = currentRole === "admin";
  document
    .querySelectorAll("[data-fde]")
    .forEach((x) => (x.hidden = enterprise));
  document
    .querySelectorAll("[data-enterprise]")
    .forEach((x) => (x.hidden = !enterprise));
  const canSwitchDemoRole = authContext?.user?.role === "legacy_test";
  const roleSwitch = document.querySelector("#role-switch");
  roleSwitch.hidden = !canSwitchDemoRole;
  roleSwitch.textContent = enterprise ? "企业协作⌄" : "FDE 工作台⌄";
  roleSwitch.setAttribute("aria-label", "切换工作台角色");
  document.querySelector("#enterprise-entry-label").hidden = !enterprise;
  document.querySelector("#enterprise-entry-label").textContent =
    `${company} · 协作入口`;
  document.querySelector("#enterprise-title").textContent = "驻场前初筛协作";
  document.querySelector("#enterprise > .section-heading p").textContent =
    "同企业成员可填写信息、提交资料、管理授权、确认事实及查看结论；每次提交保留版本与时间。";
  document.querySelector(
    "#enterprise .enterprise-card-head strong",
  ).textContent = company;
  document.querySelector("#enterprise-role-badge").textContent = processOwner
    ? "企业流程负责人"
    : "企业授权人";
  document
    .querySelector(".app-sidebar")
    .setAttribute(
      "aria-label",
      enterprise ? "企业协作入口" : "FDE Core 工作台导航",
    );
  document.querySelector(".workspace-topbar .eyebrow").textContent = enterprise
    ? "企业协作"
    : "FDE DELIVERY CONSOLE / 01";
  document.querySelector(".workspace-topbar h1").textContent = enterprise
    ? `${company} · 协作入口`
    : "驻场前的初筛";
  document.querySelector("#workspace-topbar-description").textContent = enterprise
    ? "按步骤提交最小必要材料，帮助服务方在驻场前完成远程初筛。"
    : fdeWorkspaceHeadings.queue.description;
  document.querySelector("#role-menu").hidden = true;
  document.querySelector("#role-switch").setAttribute("aria-expanded", "false");
  if (enterprise) {
    activeView = "enterprise";
    setView("enterprise", { writeUrl: !fromRoute, focus: false });
  } else
    setView(location.hash.slice(1) || "queue", {
      writeUrl: !fromRoute,
      focus: false,
    });
}

function openNewScreening() {
  document.querySelector("#new-screening-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "new-screening-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-screening-title"><button type="button" class="modal-close" data-close-modal aria-label="关闭">×</button><span class="eyebrow">NEW SCREENING</span><h2 id="new-screening-title">新建企业筛选</h2><p>先建立企业与目标流程，随后生成岗位邀请。系统接入和材料上传由企业进入后选择。</p><form id="new-screening-form"><label>企业名称<input name="name" required autocomplete="organization" placeholder="例如：苏州启衡智能制造"><small data-name-check>名称用于区分项目，不可与现有企业重复。</small></label><label>所属行业<select name="industry" required><option value="">请选择行业</option><option>离散制造 / 装备制造</option><option>流程制造 / 化工材料</option><option>零售 / 品牌电商</option><option>物流 / 供应链</option><option>建筑 / 工程</option><option>专业服务</option><option>其他</option></select></label><label>优先诊断流程<select name="flowTemplate" required><option value="">请选择流程</option><option>采购申请 → 审批 → 付款 → 入库</option><option>订单接收 → 履约 → 发货 → 回款</option><option>售后受理 → 派工 → 完成 → 复核</option><option>生产计划 → 领料 → 报工 → 入库</option><option value="custom">其他流程（自行补充）</option></select></label><label data-custom-flow hidden>补充流程名称<input name="customFlow" maxlength="80" placeholder="例如：质量异常 → 责任判定 → 整改关闭"></label><div class="modal-actions"><button type="button" class="quiet-button" data-close-modal>取消</button><button type="submit" class="primary-button">创建企业筛选</button></div></form></section>`;
  const screeningForm=modal.querySelector('#new-screening-form');
  const industrySelect=screeningForm.elements.industry,industryInput=document.createElement('input');
  industryInput.name='industry';industryInput.required=true;industryInput.setAttribute('list','screening-industries');industryInput.placeholder='选择或输入行业';industrySelect.replaceWith(industryInput);
  screeningForm.insertAdjacentHTML('beforeend','<datalist id="screening-industries"><option value="离散制造 / 装备制造"><option value="流程制造 / 化工材料"><option value="零售 / 品牌电商"><option value="物流 / 供应链"><option value="建筑 / 工程"><option value="专业服务"><option value="其他"></datalist>');
  screeningForm.insertAdjacentHTML('beforeend','<input type="hidden" name="flow">');
  screeningForm.elements.flowTemplate.required=false;
  document.body.append(modal);
  modal
    .querySelectorAll("[data-close-modal]")
    .forEach((button) =>
      button.addEventListener("click", () => modal.remove()),
    );
  modal.querySelector("input")?.focus();
  const nameInput=modal.querySelector('[name="name"]'),nameHint=modal.querySelector('[data-name-check]');
  nameInput?.addEventListener('input',()=>{const duplicate=screenings.some(item=>!item.deleted&&String(item.name).trim()===nameInput.value.trim());nameInput.setCustomValidity(duplicate?'该企业名称已存在，请直接打开现有项目或使用可区分的名称。':'');nameHint.textContent=duplicate?'该企业名称已存在。':'名称用于区分项目，不可与现有企业重复。';});
  modal.querySelector('[name="flowTemplate"]')?.addEventListener('change',event=>{const custom=event.currentTarget.value==='custom',label=modal.querySelector('[data-custom-flow]');label.hidden=!custom;label.querySelector('input').required=custom;screeningForm.elements.flow.value=custom?'':event.currentTarget.value;});
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (actionBusy) return;
    actionBusy = true;
    const submit = event.currentTarget.querySelector("[type=submit]");
    submit.disabled = true;
    submit.textContent = "正在保存…";
    try {
      const data = new FormData(event.currentTarget);
      const flow=data.get("flowTemplate")==='custom'?String(data.get("customFlow")||'').trim():String(data.get("flow")||data.get("flowTemplate")||'').trim();
      if(!flow){event.currentTarget.elements.flowTemplate.setCustomValidity('请选择优先诊断流程');event.currentTarget.elements.flowTemplate.reportValidity();throw new Error('请选择优先诊断流程');}
      const response = await fetch("/api/screenings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-actor-id": "fde-demo",
          "x-role": "fde",
          "x-enterprise-id": "portfolio",
        },
        body: JSON.stringify({
          name: data.get("name"),
          industry: data.get("industry"),
          flow,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error);
      screenings.push(payload.screening);
      selected = payload.screening;
      modal.remove();
      renderMetrics();
      renderQueue();
      renderContext();
      showNotice(
        "筛选项目已创建并保存到本地 SQLite，下一步请补充企业输入。",
        "success",
      );
      setView("project");
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "创建企业筛选";
      modal.querySelector("p").textContent = `创建失败：${error.message}`;
      modal.querySelector("p").className = "modal-error";
    } finally {
      actionBusy = false;
    }
  });
}
function buildLocalReportSections(item) {
  return [
    "企业和本次筛选项目概况",
    "目标业务流程",
    "已确认的数据来源",
    "数据电子化判断",
    "数据结构化判断",
    "流程追溯判断",
    "数据质量和覆盖范围",
    "发现的问题信号",
    "五个判断面与证据依据",
    "风险点和未知信息",
    "FDE 路径判断与理由",
    "驻场前必须补充的材料",
    "建议现场验证的问题",
    "顾问最终决策记录",
  ].map((title, index) => ({
    id: String(index + 1).padStart(2, "0"),
    title,
    items:
      index === 0
        ? [
            ["企业", item.name],
            ["行业", item.industry],
            ["数据边界", "本地合成项目"],
          ]
        : index === 1
          ? [["流程", item.flow]]
          : index === 10
            ? [
                ["结论", item.statusLabel],
                ["建议动作", item.recommendation],
              ]
            : index === 11
              ? item.materials.map((value) => ["待补材料", value])
              : [["状态", "待确认"]],
  }));
}

function parseCsvLine(line) {
  const values = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      value += '"';
      i++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
      continue;
    }
    value += char;
  }
  values.push(value.trim());
  return values;
}
function parseSample(text, name = "") {
  const value = String(text || "").trim();
  if (!value) throw new Error("请先选择文件或粘贴样本内容");
  if (value.length > 1_000_000) throw new Error("样本超过 1MB，请缩小后再试");
  if (
    name.toLowerCase().endsWith(".json") ||
    value.startsWith("{") ||
    value.startsWith("[")
  ) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("JSON 格式无效，请检查逗号和引号");
    }
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.items)
        ? parsed.items
        : [parsed];
    if (
      !items.length ||
      items.some(
        (item) => !item || typeof item !== "object" || Array.isArray(item),
      )
    )
      throw new Error("JSON 样本必须是对象数组或对象");
    return items;
  }
  const [header, ...lines] = value.split(/\r?\n/).filter((line) => line.trim());
  const fields = parseCsvLine(header).filter(Boolean);
  if (!fields.length) throw new Error("CSV 首行必须包含字段名");
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      fields.map((field, index) => [field, values[index] || ""]),
    );
  });
}
function enterpriseId() {
  return selected?.enterpriseId || null;
}
function enterpriseEndpoint(path) {
  const id = enterpriseId();
  if (!id) throw new Error("当前账号没有可用企业项目");
  return `/api/enterprises/${encodeURIComponent(id)}${path}`;
}
function enterpriseRequestHeaders() {
  const id = enterpriseId();
  if (!id) throw new Error("当前账号没有可用企业项目");
  return {
    "content-type": "application/json",
    "x-actor-id": `owner-${id}`,
    "x-role": "enterprise_owner",
    "x-enterprise-id": id,
  };
}
async function enterpriseRequest(path, body, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: enterpriseRequestHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || payload.error);
  return payload;
}
async function evidenceFilesPayload(files) {
  const maxFileBytes = 2 * 1024 * 1024;
  const maxPackageBytes = 8 * 1024 * 1024;
  if (files.length > 20) throw new Error("单次最多上传 20 个文件");
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > maxPackageBytes) throw new Error("单次文件总量不能超过 8 MB");
  const payload = [];
  for (const file of files) {
    if (file.size > maxFileBytes) throw new Error(`${file.name} 超过单文件 2 MB 限制`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    payload.push({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      contentBase64: btoa(binary),
    });
  }
  return payload;
}
async function uploadEvidenceFiles(files, purposes, sourceSystem, period, verificationNote) {
  return enterpriseRequest(enterpriseEndpoint("/evidence-files"), {
    files: await evidenceFilesPayload(files),
    purposes,
    sourceSystem,
    period,
    verificationNote,
  });
}
function renderEnterprise() {
  const processOwner = currentRole === "enterprise_process_owner";
  const checklist = processOwner
    ? [
        ["01", "核对流程节点", "确认责任人、异常节点和业务含义"],
        ["02", "审阅证据解释", "指出字段与实际业务不一致之处"],
        ["03", "确认企业结论", "确认哪些事实可以进入后续诊断"],
      ]
    : [
        ["01", "补充企业输入", "说明核心业务如何记录，声明数据来源"],
        ["02", "填写企业问卷", "结构化回答电子化、可追溯和责任配合情况"],
        ["03", "提交数据样例", "上传 CSV / JSON，先预览再提交"],
        ["04", "确认初筛事实", "核对字段含义、时间范围和使用目的"],
      ];
  document.querySelector("#enterprise-checklist").innerHTML = checklist
    .map(
      ([n, title, note]) =>
        `<div><span>${n}</span><b>${title}</b><small>${note}</small></div>`,
    )
    .join("");
  const actions = processOwner
    ? [
        ["confirm", "确认流程解释"],
        ["accept", "确认结果观察"],
      ]
    : [
        ["questionnaire", "填写企业问卷"],
        ["intake", "提交补充材料"],
        ["authorize", "审阅授权范围"],
        ["confirm", "确认初筛事实"],
        ["accept", "确认结果观察"],
      ];
  document.querySelector("#enterprise-actions").innerHTML = actions
    .map(
      ([key, label]) =>
        `<button type="button" class="${enterpriseActionState[key] ? "is-complete" : ""} ${enterpriseActiveAction === key ? "is-active" : ""}" data-enterprise-action="${key}" aria-pressed="${enterpriseActionState[key] ? "true" : "false"}">${enterpriseActionState[key] ? "✓ " : ""}${label}</button>`,
    )
    .join("");
  document.querySelectorAll("[data-enterprise-action]").forEach((button) =>
    button.addEventListener("click", () => {
      enterpriseActiveAction = button.dataset.enterpriseAction;
      enterpriseError = "";
      renderEnterprise();
    }),
  );
  const detail = document.querySelector("#enterprise-detail");
  if (!enterpriseActiveAction) {
    detail.innerHTML =
      '<p class="muted">请选择一项操作。每个动作都会显示提交范围、前置条件和结果状态。</p>';
    return;
  }
  renderEnterpriseDetail(detail, enterpriseActiveAction);
  if (enterpriseError) {
    const error = document.createElement("div");
    error.className = "operation-result error";
    error.tabIndex = -1;
    error.textContent = enterpriseError;
    detail.prepend(error);
  }
}
function renderEnterpriseDetail(box, action) {
  if (enterpriseError)
    box.innerHTML = `<div class="operation-result error" tabindex="-1">${esc(enterpriseError)}</div>`;
  if (action === "intake") {
    box.innerHTML = `<span class="eyebrow">DATA INTAKE</span><h3>提交 CSV / JSON 样本</h3><p>样本先在本地浏览器解析并预览，再写入当前企业的合成接导接口；Excel 请先导出为 CSV。</p><form class="enterprise-upload-form"><label class="upload-field">样本文件<input name="sample-file" type="file" accept=".csv,.json,text/csv,application/json"></label><label class="upload-field">或粘贴样本<textarea name="sample-text" rows="5" placeholder="order_ref,delay_hours\nSYN-001,6"></textarea></label><button type="submit" class="primary-button" ${actionBusy ? "disabled" : ""}>${actionBusy ? "正在生成预览…" : "生成样本预览"}</button><p data-upload-result class="upload-result" aria-live="polite"></p></form>${samplePreview ? renderSamplePreview(samplePreview) : ""}`;
    box.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      submitEnterpriseSample(event.currentTarget);
    });
    box
      .querySelector("[data-confirm-sample]")
      ?.addEventListener("click", confirmEnterpriseSample);
    box.querySelector("[data-reset-sample]")?.addEventListener("click", () => {
      samplePreview = null;
      renderEnterprise();
    });
    return;
  }
  if (action === "authorize") {
    const fields = [
      "order_ref",
      "delay_hours",
      "sku",
      "quantity",
      "status",
      "event_at",
    ];
    box.innerHTML = `<span class="eyebrow">READ-ONLY AUTHORIZATION</span><h3>审阅授权范围</h3><p>只授权初筛所需字段；范围会写入本地授权记录，不允许生产写回。</p><form class="enterprise-upload-form"><fieldset><legend>允许读取的字段</legend><div class="field-grid">${fields.map((field) => `<label><input type="checkbox" name="field" value="${field}" checked> ${field}</label>`).join("")}</div></fieldset><label class="upload-field">时间范围<input name="time-range" required value="近 90 天"></label><label class="upload-field">使用目的<input name="purpose" required value="驻场前远程初筛"></label><button type="submit" class="primary-button">确认并保存授权</button></form>`;
    box
      .querySelector("form")
      .addEventListener("submit", submitEnterpriseAuthorization);
    return;
  }
  if (action === "confirm") {
    box.innerHTML = `<span class="eyebrow">ENTERPRISE CONFIRMATION</span><h3>${currentRole === "enterprise_process_owner" ? "确认流程解释" : "确认初筛事实"}</h3><p>${currentRole === "enterprise_process_owner" ? "请确认流程节点、责任角色和异常含义。" : "请确认企业输入、字段含义和数据范围是否准确。确认必须绑定已接收的企业证据。"}</p><form class="enterprise-upload-form"><label class="upload-field">确认说明<textarea name="conclusion" rows="4" required>${currentRole === "enterprise_process_owner" ? "流程节点、责任人和异常含义已核对" : "字段含义、时间范围和初筛事实已核对"}</textarea></label><button type="submit" class="primary-button">读取证据并提交确认</button><p class="upload-result" data-confirm-result aria-live="polite"></p></form>`;
    box
      .querySelector("form")
      .addEventListener("submit", submitEnterpriseConfirmation);
    return;
  }
  box.innerHTML = `<span class="eyebrow">OUTCOME OBSERVATION</span><h3>确认结果观察</h3><p>该动作只记录企业对本地合成观察的确认；如果 FDE 尚未完成远程介入，系统会明确提示前置条件，不会伪造完成。</p><button type="button" class="primary-button" data-submit-accept>确认并提交观察</button>`;
  box
    .querySelector("[data-submit-accept]")
    .addEventListener("click", submitEnterpriseAcceptance);
}
function renderSamplePreview({ body, preview }) {
  const items = body.items || [];
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))];
  return `<div class="sample-preview"><div class="preview-heading"><strong>样本预览</strong><span>${preview.rowCount} 行 · ${keys.length} 个字段 · ${esc(preview.status)}</span></div><div class="preview-table" role="table"><div class="preview-row preview-head">${keys.map((key) => `<span>${esc(key)}</span>`).join("")}</div>${items
    .slice(0, 5)
    .map(
      (item) =>
        `<div class="preview-row">${keys.map((key) => `<span>${esc(item[key] ?? "")}</span>`).join("")}</div>`,
    )
    .join(
      "",
    )}</div><p class="upload-result">确认后才会创建接导批次。最多展示前 5 行。</p><div class="modal-actions"><button type="button" class="quiet-button" data-reset-sample>返回修改</button><button type="button" class="primary-button" data-confirm-sample>确认提交样本</button></div></div>`;
}
const baseEnterpriseRender = renderEnterprise;
renderEnterprise = () => {
  const processOwner = currentRole === "enterprise_process_owner";
  const order = processOwner
    ? ["confirm", "accept"]
    : ["questionnaire", "authorize", "intake", "confirm", "accept"];
  const next = order.find((key) => !enterpriseActionState[key]) || order.at(-1);
  if (
    !enterpriseActiveAction ||
    !order.includes(enterpriseActiveAction) ||
    enterpriseActionState[enterpriseActiveAction]
  )
    enterpriseActiveAction = next;
  baseEnterpriseRender();
  const completed = order.filter((key) => enterpriseActionState[key]).length;
  const checklist = document.querySelector("#enterprise-checklist");
  if (checklist)
    checklist.innerHTML = `<div class="enterprise-flow-label"><b>协作进度</b><span>${completed} / ${order.length} 已完成 · 下一步：${enterpriseActionLabel(next)}</span></div><div class="enterprise-flow-steps" role="list">${order.map((key, index) => `<div class="enterprise-flow-step ${enterpriseActionState[key] ? "is-complete" : ""} ${key === next ? "is-next" : ""}" role="listitem"><span>${String(index + 1).padStart(2, "0")}</span><b>${enterpriseActionLabel(key)}</b><small>${enterpriseActionState[key] ? "已完成" : key === next ? "当前步骤" : "待解锁"}</small></div>`).join("")}</div>`;
  const actions = document.querySelector("#enterprise-actions");
  if (!actions) return;
  const buttons = [...actions.querySelectorAll("[data-enterprise-action]")];
  const firstIncomplete = order.findIndex((key) => !enterpriseActionState[key]);
  order.forEach((key, index) => {
    const button = buttons.find(
      (item) => item.dataset.enterpriseAction === key,
    );
    if (!button) return;
    actions.append(button);
    const locked = firstIncomplete >= 0 && index > firstIncomplete;
    button.disabled = locked;
    button.classList.toggle("is-locked", locked);
    button.setAttribute("aria-disabled", String(locked));
    button.title = locked ? "请先完成前一步，再进入此步骤" : "";
  });
};
function enterpriseActionLabel(key) {
  return (
    {
      questionnaire: "填写企业问卷",
      authorize: "确认授权范围",
      intake: "提交数据样本",
      confirm:
        currentRole === "enterprise_process_owner"
          ? "确认流程解释"
          : "确认初筛事实",
      accept: "确认结果观察",
    }[key] || key
  );
}
function renderQuestionnaire(box) {
  box.innerHTML = `<span class="eyebrow">STRUCTURED INTAKE / v1</span><h3>填写企业问卷</h3><p>只收集驻场前判断所需的最小信息；提交后保存版本和答复，作为待验证事实，不直接生成驻场结论。</p><form class="enterprise-upload-form questionnaire-form"><fieldset><legend>数据基础判断</legend><label>核心流程是否已电子化<select name="electronicized" required><option value="">请选择</option><option>是，大部分在系统中</option><option>部分电子化</option><option>否，主要依赖纸面或聊天</option></select></label><label>记录是否结构化且有统一编号<select name="structured" required><option value="">请选择</option><option>是</option><option>部分是</option><option>否</option></select></label><label>流程是否能按事件、时间和责任人追溯<select name="traceable" required><option value="">请选择</option><option>可以</option><option>部分可以</option><option>不可以</option></select></label><label>企业是否能提供只读样本或导出文件<select name="accessible" required><option value="">请选择</option><option>可以</option><option>需要协调</option><option>暂时不能</option></select></label></fieldset><fieldset><legend>业务现场信号</legend><label>当前最明显的流程痛点<textarea name="painPoint" rows="3" required placeholder="例如：跨部门交接后等待时间长"></textarea></label><label>最常见的异常或无人值守风险<textarea name="exception" rows="3" required placeholder="例如：审批退回没有统一原因"></textarea></label><label>可参与核验的负责人或部门<textarea name="owner" rows="2" required placeholder="例如：采购负责人、OA 管理员"></textarea></label></fieldset><button type="submit" class="primary-button" ${actionBusy ? "disabled" : ""}>${actionBusy ? "正在保存…" : "保存问卷 v1"}</button><p class="upload-result" aria-live="polite">回答会进入企业问卷版本记录。</p></form>`;
  box
    .querySelector("form")
    .addEventListener("submit", submitEnterpriseQuestionnaire);
}
const baseEnterpriseDetail = renderEnterpriseDetail;
renderEnterpriseDetail = (box, action) => {
  if (action === "questionnaire") {
    renderQuestionnaire(box);
    return;
  }
  baseEnterpriseDetail(box, action);
  if (action === "intake") {
    box
      .querySelector("form")
      ?.insertAdjacentHTML(
        "afterbegin",
        `<div class="upload-guidance"><b>提交什么样本？</b><p>推荐使用日常系统导出的 CSV 或 JSON 事件表。通用事件日志通常需要案件/订单编号、操作步骤、发生时间；本 MVP 可提交字段为订单编号、等待时长、商品编码、数量、状态、发生时间。</p><p>只支持文字和表格数据，不支持截图、图片或 Word/PDF。Excel 请先另存为 CSV。单文件不超过 1 MB，预览最多显示前 5 行，确认后才入库。</p><details><summary>查看可复制模板</summary><pre>order_ref,delay_hours,sku,quantity,status,event_at\nORD-2026-001,6,SKU-001,2,待审批,2026-08-31 10:00:00</pre></details></div>`,
      );
  }
  if (action === "authorize") {
    const form = box.querySelector("form");
    const labels = {
      order_ref: "订单或申请编号",
      delay_hours: "等待时长（小时）",
      sku: "商品或物料编码",
      quantity: "数量",
      status: "当前状态",
      event_at: "事件发生时间",
    };
    const fieldset = form?.querySelector("fieldset");
    if (fieldset)
      fieldset.innerHTML = `<legend>允许读取的字段</legend><div class="field-grid">${Object.entries(
        labels,
      )
        .map(
          ([key, label]) =>
            `<label><input type="checkbox" name="field" value="${key}" checked> ${label}</label>`,
        )
        .join("")}</div>`;
    const time = form?.querySelector('[name="time-range"]');
    if (time)
      time.outerHTML =
        '<select name="time-range" required><option>近 7 天</option><option selected>近 30 天</option><option>近 90 天</option><option>自定义时间范围（后续接入）</option></select>';
    const purpose = form?.querySelector('[name="purpose"]');
    if (purpose)
      purpose.outerHTML =
        '<select name="purpose" required><option selected>驻场前远程初筛</option><option>核对目标流程和数据基础</option><option>验证异常等待与责任节点</option></select>';
  }
};
async function submitEnterpriseSample(form) {
  if (actionBusy) return;
  actionBusy = true;
  enterpriseError = "";
  renderEnterprise();
  try {
    const file = form.querySelector('[name="sample-file"]').files[0];
    const pasted = form.querySelector('[name="sample-text"]').value;
    const items = parseSample(
      file ? await file.text() : pasted,
      file?.name || "sample.csv",
    );
    const body = { kind: "synthetic_orders", items };
    const preview = await enterpriseRequest(
      enterpriseEndpoint("/intake/preview"),
      body,
    );
    if (preview.status !== "accepted")
      throw new Error(`样本未通过范围检查：${preview.reason}`);
    samplePreview = { body, preview };
    actionBusy = false;
    renderEnterprise();
    showNotice("样本预览已生成，请确认字段和行数后再提交。", "success");
  } catch (error) {
    actionBusy = false;
    enterpriseError = `样本预览失败：${error.message}`;
    renderEnterprise();
    document.querySelector("#enterprise-detail")?.focus();
  }
}
const baseSubmitEnterpriseSample = submitEnterpriseSample;
submitEnterpriseSample = async (form) => {
  const file = form.querySelector('[name="sample-file"]')?.files?.[0];
  if (file?.size > 1_000_000) {
    enterpriseError = "样本文件超过 1 MB，请拆分后再提交。";
    renderEnterprise();
    return;
  }
  return baseSubmitEnterpriseSample(form);
};
async function confirmEnterpriseSample() {
  if (!samplePreview || actionBusy) return;
  actionBusy = true;
  renderEnterprise();
  try {
    const result = await enterpriseRequest(
      enterpriseEndpoint("/intake"),
      samplePreview.body,
    );
    samplePreview = null;
    completeEnterpriseAction(
      `样本已接收：${result.rowCount} 行，批次 ${result.id}；当前仍为合成演示数据。`,
    );
  } catch (error) {
    actionBusy = false;
    enterpriseError = `样本未接收：${error.message}`;
    renderEnterprise();
  }
}
async function submitEnterpriseAuthorization(event) {
  event.preventDefault();
  if (actionBusy) return;
  actionBusy = true;
  const form = event.currentTarget;
  try {
    const fields = [
      ...form.querySelectorAll('input[name="field"]:checked'),
    ].map((input) => input.value);
    await enterpriseRequest(enterpriseEndpoint("/authorization"), {
      status: "limited",
      allowedFields: fields,
      timeRange: form.querySelector('[name="time-range"]').value,
      purpose: form.querySelector('[name="purpose"]').value,
    });
    completeEnterpriseAction(
      `有限授权已保存：${fields.length} 个字段；时间范围和用途已记录在本次演示上下文。`,
    );
  } catch (error) {
    actionBusy = false;
    enterpriseError = `授权未保存：${error.message}`;
    renderEnterprise();
  }
}
async function submitEnterpriseQuestionnaire(event) {
  event.preventDefault();
  if (actionBusy) return;
  actionBusy = true;
  const form = event.currentTarget;
  try {
    const answers = Object.fromEntries(new FormData(form).entries());
    const result = await enterpriseRequest(
      enterpriseEndpoint("/questionnaire"),
      { answers },
    );
    completeEnterpriseAction(
      `企业问卷 v${result.questionnaire.version} 已保存；仍需结合样本和来源证据判断。`,
    );
  } catch (error) {
    actionBusy = false;
    enterpriseError = `问卷未保存：${error.message}`;
    renderEnterprise();
  }
}
async function submitEnterpriseConfirmation(event) {
  event.preventDefault();
  if (actionBusy) return;
  actionBusy = true;
  const form = event.currentTarget;
  try {
    const workspace = await enterpriseRequest(
      enterpriseEndpoint("/workspace"),
      null,
      "GET",
    );
    const record =
      workspace.evidence?.find((item) => item.layer === "source") ||
      workspace.evidence?.[0];
    if (!record) throw new Error("当前没有已接收证据，请先提交并确认数据样本");
    await enterpriseRequest(enterpriseEndpoint("/confirmations"), {
      recordId: record.id,
      conclusion: form.querySelector('[name="conclusion"]').value,
    });
    completeEnterpriseAction(
      "企业确认已写入：已绑定本企业已接收证据，并保留确认说明。",
    );
  } catch (error) {
    actionBusy = false;
    enterpriseError = `确认未提交：${error.message}`;
    renderEnterprise();
  }
}
async function submitEnterpriseAcceptance() {
  if (actionBusy) return;
  actionBusy = true;
  try {
    const result = await enterpriseRequest("/api/product-actions", {
      tenantId: enterpriseId(),
      actorRole: currentRole,
      action: "accept",
    });
    if (result.status !== "completed")
      throw new Error(`等待前置条件：${result.step || "FDE 远程介入尚未完成"}`);
    completeEnterpriseAction("结果观察确认已记录，等待后续企业验收。");
  } catch (error) {
    actionBusy = false;
    enterpriseError = `结果观察未提交：${error.message}`;
    renderEnterprise();
  }
}
function completeEnterpriseAction(message) {
  actionBusy = false;
  enterpriseActionState[enterpriseActiveAction] = true;
  enterpriseError = "";
  samplePreview = null;
  renderEnterprise();
  showNotice(message, "success");
  document.querySelector("#enterprise-detail")?.focus();
}

async function boot() {
  try {
    authContext = await window.fdeSessionReady;
    sanitizeRouteUrl();
    const response = await fetch("/api/screenings", {
      headers:
        authContext.user.role === "legacy_test"
          ? {
              "x-actor-id": "fde-demo",
              "x-role": "fde",
              "x-enterprise-id": "portfolio",
            }
          : {},
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error);
    screenings = payload.screenings;
    const params = new URLSearchParams(location.search);
    selected =
      screenings.find(
        (item) => item.enterpriseId === params.get("enterpriseId"),
      ) || screenings[0] || null;
    prepChecks = localJson("fde-core-prep-checks-v1", {});
    renderMetrics();
    renderQueue();
    renderContext();
    activeProjectSection = params.get("projectSection") || activeProjectSection;
    activeSourceType = params.get("sourceType") || activeSourceType;
    activePrepSection = params.get("prepSection") || activePrepSection;
    activeReportType = normalizeReportType(params.get("reportType") || activeReportType);
    activeReportSection = params.get("reportSection") || activeReportSection;
    if (isEnterpriseAccount(authContext.user.role)) {
      selected =
        screenings.find(
          (item) => item.enterpriseId === authContext.user.enterpriseId,
        ) || null;
      setRole(enterpriseEntryRole(authContext.user.role), { fromRoute: true });
    } else if (authContext.user.role === "admin") {
      setRole("admin", { fromRoute: true });
    } else if (authContext.user.role === "legacy_test") {
      const entry = params.get("entry");
      if (["enterprise_authorizer", "enterprise_process_owner"].includes(entry))
        setRole(entry, { fromRoute: true });
      else setRole("fde_owner", { fromRoute: true });
    } else {
      currentRole = "fde_owner";
      setRole("fde_owner", { fromRoute: true });
      setView(location.hash.slice(1) || "queue", {
        writeUrl: false,
        focus: false,
      });
    }
    if (authContext.user.role !== "legacy_test") updateUrl(activeView);
    document.querySelector("#status")?.setAttribute("hidden", "");
  } catch (error) {
    renderBootError(error);
  }
}
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      button.dataset.view === "project"
        ? toggleDiagnosticSidebarSubnav()
        : setView(button.dataset.view),
    ),
  );
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    renderQueue();
  }),
);
document
  .querySelector('[data-action="new-screening"]')
  .addEventListener("click", openNewScreening);
document.querySelector("#role-switch").addEventListener("click", (event) => {
  const menu = document.querySelector("#role-menu");
  menu.hidden = !menu.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
});
document
  .querySelectorAll("[data-role]")
  .forEach((button) =>
    button.addEventListener("click", () => setRole(button.dataset.role)),
  );
window.addEventListener("hashchange", syncRoute);
window.addEventListener("popstate", syncRoute);
boot();
startConnectionMonitor();
const enterpriseActivityEnhancement = renderEnterpriseDetail;
renderEnterpriseDetail = (box, action) => {
  enterpriseActivityEnhancement(box, action);
  if (action === "authorize") {
    const labels = {
      order_ref: "订单或申请编号",
      activity: "操作步骤/活动",
      delay_hours: "等待时长（小时）",
      sku: "商品或物料编码",
      quantity: "数量",
      status: "当前状态",
      event_at: "事件发生时间",
    };
    const fieldset = box.querySelector("fieldset");
    if (fieldset)
      fieldset.innerHTML = `<legend>允许读取的字段</legend><div class="field-grid">${Object.entries(
        labels,
      )
        .map(
          ([key, label]) =>
            `<label><input type="checkbox" name="field" value="${key}" checked> ${label}</label>`,
        )
        .join("")}</div>`;
  }
  if (action === "intake") {
    const input = box.querySelector('[name="sample-text"]');
    if (input)
      input.placeholder = "order_ref,activity,delay_hours\nSYN-001,审批提交,6";
    const guidance = box.querySelector(".upload-guidance p");
    if (guidance)
      guidance.textContent =
        "推荐使用日常系统导出的 CSV 或 JSON 事件表。通用事件日志通常需要案件/订单编号、操作步骤、发生时间；本 MVP 可提交字段为订单编号、操作步骤/活动、等待时长、商品编码、数量、状态、事件发生时间。";
  }
};
let enterpriseTier = "tier0",
  tier1Mode = "manifest",
  tier0Complete = false,
  tier1Complete = false,
  tier2Complete = false,
  tier2Eligible = false,
  tierBusy = false;
const tierDefinitions = [
  ["tier0", "准入自述", "5 分钟表单，只收判断赛道、诉求、系统台账和决策条件"],
  ["tier1", "流程证据", "只收能复核的流程、时效、数据、系统和痛点痕迹"],
  [
    "tier2",
    "异常升级",
    "系统检测到证据缺口、异常信号或明确意向后开放，再选择实际触发方式",
  ],
];
const enterprisePrinciples = [
  ["01", "最小必要", "只交够判断的材料，不交全量数据"],
  ["02", "可验证", "提交证据痕迹，不用自述替代事实"],
  ["03", "标准化并行", "按统一格式接入，支持批量复核"],
  ["04", "异常才升级", "出现异常或高意向时再补深度材料"],
];
const evidenceDefinition = [
  [
    "process",
    "流程证据",
    "还原真实步骤和交接点，用来定位流程卡点、返工和责任断点",
  ],
  ["timing", "时效证据", "核对每一步耗时，用来识别等待、积压和无人值守"],
  ["data", "数据证据", "确认字段和记录结构，用来判断能否统计、追踪和自动化"],
  ["system", "系统证据", "确认数据从哪里读取，用来判断接口或导出是否可接入"],
  ["pain", "痛点证据", "量化错误和积压，用来判断问题规模和是否值得驻场"],
];
const baseTieredRender = renderEnterprise;
renderEnterprise = () => {
  if (enterpriseAccountRoles.has(currentRole)) renderTieredEnterprise();
  else baseTieredRender();
};
function renderTieredEnterprise() {
  const checklist = document.querySelector("#enterprise-checklist");
  const actions = document.querySelector("#enterprise-actions");
  const detail = document.querySelector("#enterprise-detail");
  if (!checklist || !actions || !detail) return;
  const completeCount = [tier0Complete, tier1Complete, tier2Complete].filter(
    Boolean,
  ).length;
  checklist.innerHTML = `<div class="tier-flow-rule"><b>企业只交够判断的材料</b><span>先低摩擦准入，再取可复核证据；异常才升级。</span></div><div class="enterprise-guardrails" role="list">${enterprisePrinciples.map(([index, title, note]) => `<div class="enterprise-guardrail" role="listitem"><span>${index}</span><div><b>${title}</b><small>${note}</small></div></div>`).join("")}</div><div class="tier-flow-steps" role="list">${tierDefinitions
    .map(([key, label, note], index) => {
      const done =
        key === "tier0"
          ? tier0Complete
          : key === "tier1"
            ? tier1Complete
            : tier2Complete;
      const next = key === enterpriseTier;
      return `<div class="tier-flow-step ${done ? "is-complete" : ""} ${next ? "is-next" : ""} ${key === "tier2" && !tier2Eligible && !tier2Complete ? "is-deferred" : ""}" role="listitem"><span>${index + 1}</span><b>${label}</b><small>${done ? "已完成" : key === "tier2" && !tier2Eligible ? "未触发" : next ? "当前步骤" : "待处理"}</small><em>${note}</em></div>`;
    })
    .join("")}</div>`;
  actions.innerHTML = `<button type="button" class="tier-action ${tier0Complete ? "is-complete" : ""} ${enterpriseTier === "tier0" ? "is-active" : ""}" data-tier-action="tier0" aria-pressed="${enterpriseTier === "tier0"}">${tier0Complete ? "✓ " : ""}填写准入自述</button><button type="button" class="tier-action ${tier1Complete ? "is-complete" : ""} ${enterpriseTier === "tier1" ? "is-active" : ""}" data-tier-action="tier1" aria-pressed="${enterpriseTier === "tier1"}">${tier1Complete ? "✓ " : ""}填写流程证据</button>${tier2Eligible || tier2Complete ? `<button type="button" class="tier-action ${tier2Complete ? "is-complete" : ""} ${enterpriseTier === "tier2" ? "is-active" : ""}" data-tier-action="tier2" aria-pressed="${enterpriseTier === "tier2"}">${tier2Complete ? "✓ " : ""}发起异常升级</button>` : ""}`;
  actions.querySelectorAll("[data-tier-action]").forEach((button) =>
    button.addEventListener("click", () => {
      enterpriseTier = button.dataset.tierAction;
      tier1Mode = "manifest";
      enterpriseError = "";
      renderTieredEnterprise();
    }),
  );
  detail.innerHTML = "";
  if (enterpriseTier === "tier0") renderTier0(detail);
  else if (enterpriseTier === "tier1") renderTier1(detail);
  else renderTier2(detail);
  void completeCount;
}
function renderTier0(box) {
  box.innerHTML = `<span class="eyebrow">准入信息</span><h3>准入自述：约 5 分钟</h3><p>只收判断赛道、诉求、系统清单和合作条件。自述是诊断线索，不会直接生成结论。</p><form class="enterprise-upload-form tier-form"><fieldset><legend>企业基本情况</legend><label>行业<select name="industry" required><option value="">请选择</option><option>离散制造 / 装备制造</option><option>流程制造 / 化工材料</option><option>零售 / 品牌电商</option><option>物流 / 供应链</option><option>建筑 / 工程</option><option>专业服务</option><option>其他</option></select></label><label>员工规模<select name="employeeRange" required><option value="">请选择</option><option>50 人以下</option><option>50–200 人</option><option>200–1000 人</option><option>1000 人以上</option></select></label><label>营收区间<select name="revenueRange" required><option value="">请选择</option><option>1000 万以下</option><option>1000 万–1 亿</option><option>1 亿–10 亿</option><option>10 亿以上</option></select></label><label>核心业务系统部署方式<select name="coreSystemCloud" required><option value="">请选择</option><option>云端系统（浏览器或 SaaS）</option><option>云端与本地都有</option><option>企业本地服务器</option><option>不确定</option></select><small>用于判断后续如何安全接入，不要求了解技术架构。</small></label></fieldset><fieldset><legend>诉求与合作条件</legend><label>最想解决的主要问题<select name="painPoints" required><option value="">请选择</option><option>审批等待时间长</option><option>跨部门交接与返工多</option><option>异常无人跟进或难追责</option><option>多系统数据对不上</option><option>报表依赖人工整理</option><option>其他（可在后续材料中说明）</option></select></label><label>现有系统清单（用于准备接入）<textarea name="systemLedger" rows="2" required placeholder="例如：ERP 管采购，OA 管审批，Excel 管日报；这里只登记，不代表已经授权连接"></textarea></label><label>项目牵头岗位<select name="decisionMaker" required><option value="">请选择</option><option>企业负责人 / 总经理</option><option>运营负责人</option><option>信息化 / IT 负责人</option><option>财务负责人</option><option>采购 / 供应链负责人</option><option>其他业务负责人</option></select></label><div class="tier-inline-fields"><label>预算情况<select name="budgetRange" required><option value="">请选择</option><option>已有预算</option><option>待评估</option><option>暂未安排</option></select></label><label>期望周期<select name="targetCycle" required><option value="">请选择</option><option>1 个月内</option><option>1–3 个月</option><option>3 个月以上</option><option>暂不确定</option></select></label></div></fieldset><button type="submit" class="primary-button" ${tierBusy ? "disabled" : ""}>${tierBusy ? "正在保存…" : "提交准入信息"}</button><p class="upload-result" aria-live="polite">提交后选择“系统只读接入、批量上传材料或两者结合”。</p></form>`;
  box.querySelector("form").addEventListener("submit", submitTier0);
}
function renderTier1(box) {
  if (tier1Mode === "sample") {
    renderEnterpriseDetail(box, "intake");
    box.insertAdjacentHTML(
      "afterbegin",
      '<button type="button" class="quiet-button tier-back" data-tier-back>← 返回流程证据清单</button>',
    );
    box.querySelector("[data-tier-back]").addEventListener("click", () => {
      tier1Mode = "manifest";
      renderTieredEnterprise();
    });
    return;
  }
  box.innerHTML = `<span class="eyebrow">流程证据</span><h3>可验证流程证据：交痕迹，不交说法</h3><p>至少提交流程、时效、数据三类核心证据；系统只记录材料和复核线索，不把“审批很慢”当成事实。</p><form class="enterprise-upload-form tier-form tier1-form"><div class="evidence-grid">${evidenceDefinition.map(([kind, label, note]) => `<fieldset class="evidence-item"><legend><label><input type="checkbox" name="evidence-kind" value="${kind}" ${["process", "timing", "data"].includes(kind) ? "checked" : ""}> ${label}</label></legend><small>${note}</small><label>材料名称/导出文件名<input name="artifact-${kind}" placeholder="例如：审批流-近30天.csv"></label><label>来源系统<input name="source-${kind}" placeholder="例如：OA / ERP / Excel"></label><label>时间范围<input name="period-${kind}" placeholder="例如：2026-08-01 至 2026-08-31"></label><label>可复核说明<textarea name="note-${kind}" rows="2" placeholder="说明服务方拿到后能核对什么"></textarea></label></fieldset>`).join("")}</div><button type="button" class="secondary-button" data-tier1-sample>打开结构化 CSV / JSON 样本预览</button><button type="submit" class="primary-button" ${tierBusy ? "disabled" : ""}>${tierBusy ? "正在登记…" : "登记流程证据"}</button><p class="upload-result" aria-live="polite">文件内容仍需经过脱敏、字段检查和企业确认；没有证据就退回补充。</p></form>`;
  box.querySelector("[data-tier1-sample]").addEventListener("click", () => {
    tier1Mode = "sample";
    enterpriseActiveAction = "intake";
    renderTieredEnterprise();
  });
  box.querySelector("form").addEventListener("submit", submitTier1);
}
function renderTier2(box) {
  box.innerHTML = `<span class="eyebrow">异常升级</span><h3>异常升级：只在必要时请求深度材料</h3><p>异常升级不是默认资料清单。只有流程证据暴露关键缺口、异常信号，或合作意向明确时才进入。</p><form class="enterprise-upload-form tier-form"><label>触发原因<select name="reason" required><option value="">请选择</option><option>核心流程仍缺关键时间/责任证据</option><option>已发现高频异常，需要深挖</option><option>企业明确希望进入现场诊断</option></select></label><label>请求的深度材料<textarea name="requestedItems" rows="4" required placeholder="例如：临时只读账号、网络/架构说明、全量灰度样本"></textarea></label><label>企业侧负责人<input name="owner" required placeholder="例如：信息化负责人"></label><label>预计提供日期<input name="targetDate" type="date" required></label><button type="submit" class="primary-button" ${tierBusy ? "disabled" : ""}>登记异常升级请求</button><p class="upload-result">默认不收临时账号、全量数据或网络架构细节。</p></form>`;
  box.querySelector("form").addEventListener("submit", submitTier2);
}
async function submitTier0(event) {
  event.preventDefault();
  if (tierBusy) return;
  tierBusy = true;
  const form = event.currentTarget;
  try {
    const answers = Object.fromEntries(new FormData(form).entries());
    await enterpriseRequest(enterpriseEndpoint("/intake/tier0"), { answers });
    tier0Complete = true;
    enterpriseTier = "tier1";
    tierBusy = false;
    renderTieredEnterprise();
    showNotice("准入自述已保存：下一步只提交可验证证据。", "success");
    window.dispatchEvent(new CustomEvent("fde:project-facts-changed", { detail: { view: "enterprise" } }));
  } catch (error) {
    tierBusy = false;
    enterpriseError = `准入自述未保存：${error.message}`;
    renderTieredEnterprise();
  }
}
async function submitTier1(event) {
  event.preventDefault();
  if (tierBusy) return;
  const form = event.currentTarget;
  if (!tier0Complete) {
    const result = form.querySelector(".upload-result");
    if (result) {
      result.className = "upload-result error";
      result.textContent = "请先完成“准入自述”，再提交流程证据。";
    }
    return;
  }
  const selected = [
    ...form.querySelectorAll('input[name="evidence-kind"]:checked'),
  ];
  const requiredKinds = ["process", "timing", "data"];
  const missingCore = requiredKinds.filter(
    (kind) => !selected.some((input) => input.value === kind),
  );
  if (missingCore.length) {
    const result = form.querySelector(".upload-result");
    if (result) {
      result.className = "upload-result error";
      result.textContent = "流程、时效、数据三类核心证据必须同时勾选。";
    }
    return;
  }
  const incomplete = selected.find((input) => {
    const kind = input.value;
    return (
      !form.querySelector(`[name="artifact-${kind}"]`).value.trim() ||
      !form.querySelector(`[name="source-${kind}"]`).value.trim() ||
      !form.querySelector(`[name="period-${kind}"]`).value.trim() ||
      !form.querySelector(`[name="note-${kind}"]`).value.trim()
    );
  });
  if (incomplete) {
    const result = form.querySelector(".upload-result");
    if (result) {
      result.className = "upload-result error";
      result.textContent =
        "已勾选的每类证据都必须填写材料名称、来源系统、时间范围和可复核说明。";
    }
    return;
  }
  tierBusy = true;
  try {
    const items = selected.map((input) => {
      const kind = input.value;
      return {
        kind,
        artifactName: form
          .querySelector(`[name="artifact-${kind}"]`)
          .value.trim(),
        sourceSystem: form
          .querySelector(`[name="source-${kind}"]`)
          .value.trim(),
        period: form.querySelector(`[name="period-${kind}"]`).value.trim(),
        verificationNote: form
          .querySelector(`[name="note-${kind}"]`)
          .value.trim(),
      };
    });
    const result = await enterpriseRequest(
      enterpriseEndpoint("/evidence-manifest"),
      { items },
    );
    tier1Complete = true;
    tier2Eligible = Boolean(result.escalation?.eligible);
    enterpriseTier = tier2Eligible ? "tier2" : "tier1";
    tierBusy = false;
    renderTieredEnterprise();
    showNotice(
      tier2Eligible
        ? "流程证据已登记：系统识别到证据仍需异常升级。"
        : "流程证据已登记：核心证据已齐，暂不触发异常升级。",
      "success",
    );
    window.dispatchEvent(new CustomEvent("fde:project-facts-changed", { detail: { view: "enterprise" } }));
  } catch (error) {
    tierBusy = false;
    enterpriseError = `流程证据未登记：${error.message}`;
    renderTieredEnterprise();
  }
}
async function submitTier2(event) {
  event.preventDefault();
  if (tierBusy) return;
  tierBusy = true;
  const form = event.currentTarget;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    await enterpriseRequest(enterpriseEndpoint("/escalation"), {
      ...data,
      requestedItems: data.requestedItems
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
    tier2Complete = true;
    tierBusy = false;
    renderTieredEnterprise();
    showNotice(
      "异常升级请求已登记，等待 FDE 判断是否继续取数或安排驻场。",
      "success",
    );
  } catch (error) {
    tierBusy = false;
    enterpriseError = `异常升级未登记：${error.message}`;
    renderTieredEnterprise();
  }
}
const baseCompleteEnterpriseAction = completeEnterpriseAction;
completeEnterpriseAction = (message) => {
  baseCompleteEnterpriseAction(message);
  if (enterpriseActiveAction === "intake") {
    tier1Mode = "manifest";
    enterpriseTier = "tier1";
    renderTieredEnterprise();
  }
};
const baseRenderTier1 = renderTier1;
renderTier1 = (box) => {
  baseRenderTier1(box);
  box.querySelectorAll(".evidence-item").forEach((item) => {
    const kind = item.querySelector('[name="evidence-kind"]')?.value;
    if (!kind) return;
    const source = item.querySelector(`[name="artifact-${kind}"]`);
    source?.insertAdjacentHTML(
      "afterend",
      `<input type="file" name="file-${kind}" accept=".csv,.json,.xlsx,.pdf,.png,.jpg,.jpeg,.mp4,.mov">`,
    );
  });
  const form = box.querySelector(".tier1-form");
  form?.addEventListener(
    "submit",
    () => {
      box.querySelectorAll(".evidence-item").forEach((item) => {
        const kind = item.querySelector('[name="evidence-kind"]')?.value;
        const file = item.querySelector(`[name="file-${kind}"]`)?.files?.[0];
        const source = item.querySelector(`[name="artifact-${kind}"]`);
        if (file && source && !source.value)
          source.value = `${file.name}（${Math.ceil(file.size / 1024)} KB）`;
      });
    },
    { capture: true },
  );
};
let tier0HighIntent = false;
const baseSubmitTier0 = submitTier0;
submitTier0 = async (event) => {
  const answers = Object.fromEntries(
    new FormData(event.currentTarget).entries(),
  );
  tier0HighIntent =
    answers.budgetRange === "已有预算" && answers.targetCycle === "1 个月内";
  return baseSubmitTier0(event);
};
const baseSubmitTier1 = submitTier1;
submitTier1 = async (event) => {
  await baseSubmitTier1(event);
  if (tier1Complete && tier0HighIntent) {
    tier2Eligible = true;
    enterpriseTier = "tier2";
    renderTieredEnterprise();
  }
};
const baseRenderTier0Readable = renderTier0;
renderTier0 = (box) => {
  baseRenderTier0Readable(box);
  const form = box.querySelector("form");
  if (!form) return;
  form.querySelector("fieldset")?.classList.add("basic-grid");
  const industry = form.querySelector('[name="industry"]');
  if (industry)
    industry.innerHTML =
      '<option value="">请选择行业</option><option>品牌电商 / 零售</option><option>制造业 / 工业</option><option>物流 / 供应链</option><option>餐饮 / 连锁服务</option><option>医疗 / 教育</option><option>建筑 / 工程</option><option>专业服务</option><option>其他</option>';
  const recordMode = form.querySelector('[name="coreSystemCloud"]');
  const recordLabel = recordMode?.closest("label");
  if (recordLabel && recordMode) {
    recordLabel.firstChild.textContent = "日常业务记录方式";
    recordMode.innerHTML =
      '<option value="">请选择记录方式</option><option>已有线上系统（如 ERP、OA、CRM）</option><option>系统和表格并用</option><option>主要靠表格、纸面或聊天记录</option><option>不确定</option>';
  }
  const ledger = form.querySelector('[name="systemLedger"]');
  const ledgerLabel = ledger?.closest("label");
  if (ledgerLabel && ledger) {
    ledgerLabel.firstChild.textContent = "现有工具 / 系统（名称 + 用途）";
    if (!ledgerLabel.querySelector(".field-hint")) {
      const hint = document.createElement("small");
      hint.className = "field-hint";
      hint.textContent =
        "列出日常使用的软件、表格或纸面记录，以及各自负责什么。";
      ledgerLabel.insertBefore(hint, ledger);
    }
  }
  const decision = form.querySelector('[name="decisionMaker"]');
  const decisionLabel = decision?.closest("label");
  if (decisionLabel) {
    decisionLabel.outerHTML =
      '<fieldset class="role-choice-fieldset"><legend>企业协作角色（最多选 2 项）</legend><small class="field-hint">建议选择一位决策角色和一位实际配合核验的角色。</small><div class="role-choice-grid"><label><input type="checkbox" name="decisionMakerRole" value="企业老板 / 总经理">企业老板 / 总经理</label><label><input type="checkbox" name="decisionMakerRole" value="业务负责人">业务负责人</label><label><input type="checkbox" name="decisionMakerRole" value="运营负责人">运营负责人</label><label><input type="checkbox" name="decisionMakerRole" value="信息化 / IT 负责人">信息化 / IT 负责人</label><label><input type="checkbox" name="decisionMakerRole" value="财务负责人">财务负责人</label><label><input type="checkbox" name="decisionMakerRole" value="流程实际操作人">流程实际操作人</label></div></fieldset>';
  }
  const roles = [...form.querySelectorAll('[name="decisionMakerRole"]')];
  const syncRoles = () => {
    const checked = roles.filter((input) => input.checked);
    roles.forEach((input) => {
      input.disabled = !input.checked && checked.length >= 2;
    });
  };
  roles.forEach((input) => input.addEventListener("change", syncRoles));
  syncRoles();
};
const baseSubmitTier0Roles = submitTier0;
submitTier0 = async (event) => {
  const form = event.currentTarget;
  const roles = [
    ...form.querySelectorAll('[name="decisionMakerRole"]:checked'),
  ].map((input) => input.value);
  if (!roles.length) {
    const result = form.querySelector(".upload-result");
    if (result) {
      result.className = "upload-result error";
      result.textContent = "请至少选择 1 个企业协作角色，最多选择 2 个。";
    }
    return;
  }
  let hidden = form.querySelector('[name="decisionMaker"][type="hidden"]');
  if (!hidden) {
    hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "decisionMaker";
    form.append(hidden);
  }
  hidden.value = roles.join("、");
  return baseSubmitTier0(event);
};
const baseRenderTier2Readable = renderTier2;
renderTier2 = (box) => {
  baseRenderTier2Readable(box);
  const trigger = box.querySelector('[name="reason"]')?.closest("label");
  if (trigger) {
    trigger.firstChild.textContent = "触发方式";
    if (!trigger.querySelector(".field-hint")) {
      const hint = document.createElement("small");
      hint.className = "field-hint";
      hint.textContent =
        "系统检测到异常信号或明确合作意向后开放；这里选择实际触发原因。";
      trigger.append(hint);
    }
  }
};
const baseRenderTieredLabels = renderTieredEnterprise;
renderTieredEnterprise = () => {
  baseRenderTieredLabels();
  const labels = { tier0: "准入自述", tier1: "流程证据", tier2: "异常升级" };
  document
    .querySelectorAll("#enterprise-actions [data-tier-action]")
    .forEach((button) => {
      const key = button.dataset.tierAction;
      button.innerHTML = `${button.classList.contains("is-complete") ? "✓ " : ""}${labels[key] || button.textContent}`;
    });
};
const evidenceAcceptByKind = {
  process: ".csv,.json,.xlsx,.pdf,.png,.jpg,.jpeg",
  timing: ".csv,.json,.xlsx,.pdf,.png,.jpg,.jpeg",
  data: ".csv,.json,.xlsx,.pdf",
  system: ".csv,.json,.xlsx,.pdf,.png,.jpg,.jpeg",
  pain: ".csv,.json,.xlsx,.pdf,.png,.jpg,.jpeg",
};
const evidenceSourceGroups = [
  [
    "财务 / ERP / 进销存",
    [
      "用友",
      "金蝶",
      "浪潮",
      "SAP",
      "Oracle",
      "鼎捷",
      "管家婆",
      "速达",
      "其他 ERP / 财务系统",
    ],
  ],
  [
    "OA / 协同办公",
    [
      "钉钉",
      "飞书",
      "企业微信",
      "泛微 e-cology",
      "致远互联",
      "蓝凌 EKP",
      "其他 OA / 协同系统",
    ],
  ],
  [
    "CRM / 客服 / 营销",
    [
      "纷享销客",
      "销售易",
      "神州云动",
      "八百客",
      "有赞",
      "微盟",
      "企微 SCRM",
      "其他 CRM / 客服系统",
    ],
  ],
  [
    "制造 / 供应链 / 仓储",
    [
      "用友 U8 / U9",
      "金蝶云·星空",
      "鼎捷 T100",
      "浪潮 GS",
      "赛意 MES",
      "宝信 MES",
      "富勒 WMS",
      "科箭 TMS",
      "其他 MES / WMS / SCM",
    ],
  ],
  [
    "项目 / 工单 / 研发",
    [
      "禅道",
      "PingCode",
      "Teambition",
      "Jira",
      "ServiceNow",
      "简道云",
      "明道云",
      "其他项目 / 工单系统",
    ],
  ],
  [
    "表格 / 数据 / 自建",
    [
      "Excel",
      "WPS 表格",
      "企业自建系统",
      "MySQL / PostgreSQL",
      "数据仓库 / BI",
      "API / 开放平台",
      "纸质单据 / 手工记录",
      "微信 / 邮件 / 聊天记录",
    ],
  ],
  ["其他", ["未列出，补充在可复核说明", "暂不确定"]],
];
const evidenceSourceOptions = evidenceSourceGroups
  .map(
    ([group, options]) =>
      `<optgroup label="${group}">${options.map((option) => `<option>${option}</option>`).join("")}</optgroup>`,
  )
  .join("");
const evidencePeriods = [
  "近 7 天",
  "近 30 天",
  "近 90 天",
  "近 6 个月",
  "近 12 个月",
  "今年以来",
  "最近一个完整月",
  "最近一个季度",
  "自定义（在可复核说明补充）",
];
const baseRenderTier1Disclosure = renderTier1;
renderTier1 = (box) => {
  baseRenderTier1Disclosure(box);
  if (tier1Mode === "sample") return;
  const form = box.querySelector(".tier1-form");
  if (!form) return;
  box.querySelectorAll(".evidence-item").forEach((card, index) => {
    const kind = card.querySelector('[name="evidence-kind"]')?.value;
    if (!kind) return;
    const sourceInput = card.querySelector(`[name="source-${kind}"]`);
    if (sourceInput) {
      const sourceSelect = document.createElement("select");
      sourceSelect.name = sourceInput.name;
      sourceSelect.required = true;
      sourceSelect.innerHTML =
        '<option value="">请选择来源系统</option>' + evidenceSourceOptions;
      sourceInput.replaceWith(sourceSelect);
    }
    const periodInput = card.querySelector(`[name="period-${kind}"]`);
    if (periodInput) {
      const periodSelect = document.createElement("select");
      periodSelect.name = periodInput.name;
      periodSelect.required = true;
      periodSelect.innerHTML =
        '<option value="">请选择时间范围</option>' +
        evidencePeriods.map((period) => `<option>${period}</option>`).join("");
      periodInput.replaceWith(periodSelect);
    }
    const artifact = card.querySelector(`[name="artifact-${kind}"]`);
    const file = card.querySelector(`[name="file-${kind}"]`);
    if (file) {
      file.required = true;
      file.multiple = false;
      file.accept = evidenceAcceptByKind[kind] || ".csv,.json,.xlsx,.pdf";
      const fileRow = document.createElement("div");
      fileRow.className = "file-picker-row";
      file.replaceWith(fileRow);
      fileRow.append(file);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "file-remove";
      remove.textContent = "移除文件";
      remove.hidden = !file.files.length;
      remove.addEventListener("click", () => {
        file.value = "";
        if (artifact) artifact.value = "";
        remove.hidden = true;
      });
      file.addEventListener("change", () => {
        const selected = file.files?.[0];
        if (selected && artifact && !artifact.value)
          artifact.value = `${selected.name}（${Math.ceil(selected.size / 1024)} KB）`;
        remove.hidden = !selected;
      });
    }
    const legend = card.querySelector("legend");
    const checkbox = legend?.querySelector('[name="evidence-kind"]');
    const title = (legend?.textContent || kind).replace(/\s+/g, " ").trim();
    const note = card.querySelector("small");
    const details = document.createElement("details");
    details.className = "evidence-disclosure";
    details.open = index === 0;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="evidence-summary-main"><span class="evidence-summary-title"><b>${esc(title)}</b><small>${esc(note?.textContent || "")}</small></span></span><span class="evidence-summary-toggle">展开</span>`;
    if (checkbox)
      summary.querySelector(".evidence-summary-main").prepend(checkbox);
    const body = document.createElement("div");
    body.className = "evidence-disclosure-body";
    [...card.children].forEach((child) => {
      if (child !== legend && child !== note) body.append(child);
    });
    details.append(summary, body);
    card.replaceWith(details);
  });
  form.addEventListener(
    "submit",
    () => {
      form.querySelectorAll(".evidence-disclosure").forEach((card) => {
        const file = card.querySelector('input[type="file"]');
        const remove = card.querySelector(".file-remove");
        if (remove) remove.hidden = !file?.files?.length;
      });
    },
    { capture: true },
  );
};
const baseRenderTier2Gate = submitTier2;
submitTier2 = async (event) => {
  if (!tier2Eligible && !tier2Complete) {
    const result = event.currentTarget.querySelector(".upload-result");
    if (result) {
      result.className = "upload-result error";
      result.textContent =
        "当前尚未触发异常升级：请先提交流程证据，或由系统识别到明确合作意向。";
    }
    return;
  }
  return baseRenderTier2Gate(event);
};
const baseSetRoleHeader = setRole;
setRole = (role, options) => {
  baseSetRoleHeader(role, options);
  if (role !== "fde_owner") {
    const label = document.querySelector("#enterprise-entry-label");
    if (label) label.textContent = "杭州青杉户外 · 协作入口";
    const eyebrow = document.querySelector(
      "#enterprise > .section-heading .eyebrow",
    );
    if (eyebrow) eyebrow.textContent = "企业协作 / 驻场前初筛";
    const title = document.querySelector("#enterprise-title");
    if (title) title.textContent = "驻场前初筛协作";
    const topEyebrow = document.querySelector(".workspace-topbar .eyebrow");
    if (topEyebrow) topEyebrow.textContent = "企业协作";
    const topTitle = document.querySelector(".workspace-topbar h1");
    if (topTitle) topTitle.textContent = "杭州青杉户外 · 协作入口";
    const topDescription = document.querySelector("#workspace-topbar-description");
    if (topDescription)
      topDescription.textContent =
        "按步骤提交最小必要材料，帮助服务方在驻场前完成远程初筛。";
    const company = selected?.name || "当前企业";
    if (label) label.textContent = `${company} · 协作入口`;
    if (topTitle) topTitle.textContent = `${company} · 协作入口`;
  }
};
const baseRenderTier2Action = renderTieredEnterprise;
renderTieredEnterprise = () => {
  baseRenderTier2Action();
  const actions = document.querySelector("#enterprise-actions");
  if (!actions || actions.querySelector('[data-tier-action="tier2"]')) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tier-action is-deferred-action";
  button.dataset.tierAction = "tier2";
  button.setAttribute("aria-pressed", "false");
  button.textContent = "异常升级";
  button.title = "查看异常升级触发规则";
  button.addEventListener("click", () => {
    enterpriseTier = "tier2";
    tier1Mode = "manifest";
    enterpriseError = "";
    renderTieredEnterprise();
  });
  actions.append(button);
};

function settingsHeaders() {
  return {
    "x-actor-id": "fde-demo",
    "x-role": "fde",
    "x-enterprise-id": "portfolio",
  };
}
const projectStageDefinitions = [
  [
    "input",
    "01",
    "企业输入",
    "核对企业问卷、目标流程和协作边界。",
    "确认企业输入",
  ],
  [
    "sources",
    "02",
    "数据来源",
    "确认系统、表格、API 和其他来源是否可读取。",
    "运行数据来源检查",
  ],
  [
    "evidence",
    "03",
    "证据检查",
    "检查结构化程度、时间字段、责任人和流程可追溯性。",
    "运行证据检查",
  ],
  [
    "recommendation",
    "04",
    "FDE 路径判断",
    "结合证据缺口和问题信号记录顾问决定。",
    "记录顾问决定",
  ],
  [
    "report",
    "05",
    "报告输出",
    "汇总证据、评分、风险、材料清单和最终决定。",
    "打开初筛报告",
  ],
];
const baseRenderTier1Validation = renderTier1;
renderTier1 = (box) => {
  baseRenderTier1Validation(box);
  const form = box.querySelector(".tier1-form");
  if (!form) return;
  const syncRequired = () => {
    form
      .querySelectorAll('input[type="file"][name^="file-"]')
      .forEach((file) => {
        const kind = file.name.slice(5);
        const checkbox = form.querySelector(
          'input[name="evidence-kind"][value="' + kind + '"]',
        );
        file.required = Boolean(checkbox?.checked);
      });
  };
  syncRequired();
  form
    .querySelectorAll('input[name="evidence-kind"]')
    .forEach((input) => input.addEventListener("change", syncRequired));
};
const baseSubmitTier1Validation = submitTier1;
submitTier1 = async (event) => {
  const form = event.currentTarget;
  const resultBox = form.querySelector(".upload-result");
  if (form.querySelector("[data-package-enhanced]")) {
    event.preventDefault();
    if (tierBusy) return;
    const kinds = [
      ...form.querySelectorAll('input[name="evidence-kind"]:checked'),
    ].map((input) => input.value);
    const requiredKinds = ["process", "timing", "data"];
    const missingCore = requiredKinds.filter((kind) => !kinds.includes(kind));
    const common = form.querySelector(".evidence-package-common");
    const sourceText = "manual_upload";
    const period =
      (common?.querySelector('select[name^="period-"]') ||
        form.querySelector('select[name^="period-"],input[name^="period-"]'))?.value || "";
    const focusTrigger = [
      ...(common?.querySelectorAll(".choice-trigger[title]") || []),
    ].find(
      (button) =>
        button.title && !["打开选择", "选择复核重点"].includes(button.title),
    );
    const focusText = focusTrigger?.title?.replace(/^已选：/, "") || "";
    const packageInput = form.querySelector(
      '.evidence-package-uploader input[type="file"]',
    );
    const files = packageInput?._selectedFiles?.length
      ? [...packageInput._selectedFiles]
      : [...(form.querySelector('input[name="file-process"]')?.files || [])];
    const existingArtifactIds = (() => {
      try { return JSON.parse(form.dataset.existingArtifactIds || "[]"); }
      catch { return []; }
    })();
    const reusingExistingFiles =
      document.querySelector("#enterprise")?.dataset.revisionTier === "tier1" &&
      existingArtifactIds.length > 0 &&
      files.length === 0;
    if (
      missingCore.length ||
      (!files.length && !reusingExistingFiles) ||
      !period ||
      !focusText
    ) {
      if (resultBox) {
        resultBox.className = "upload-result error";
        resultBox.textContent = missingCore.length
          ? "流程、时效、数据三类核心证据必须同时覆盖。"
          : "请补充材料、时间范围和复核重点后再提交。";
      }
      return;
    }
    tierBusy = true;
    try {
      if (reusingExistingFiles) {
        const artifactName = form.dataset.existingArtifactName || "已上传材料";
        const items = kinds.map((kind) => ({
          kind,
          artifactName,
          sourceSystem: "manual_upload",
          period,
          verificationNote: focusText,
        }));
        const response = await enterpriseRequest(
          enterpriseEndpoint("/evidence-manifest"),
          { items, artifactIds: existingArtifactIds },
        );
        tier1Complete = true;
        tier2Eligible = Boolean(response.escalation?.eligible);
        tierBusy = false;
        showNotice(`诊断材料 V${response.intake?.version || "新"} 已保存；原文件保留，元数据已更新。`, "success");
        window.dispatchEvent(new CustomEvent("fde:project-facts-changed", { detail: { view: "enterprise" } }));
        return;
      }
      if (resultBox) {
        resultBox.className = "upload-result";
        resultBox.textContent = `正在校验并保存 ${files.length} 个文件…`;
      }
      const uploaded = await uploadEvidenceFiles(files, kinds, sourceText, period, focusText);
      if (!uploaded.files?.length)
        throw new Error(uploaded.rejected?.map((item) => `${item.name}：${item.message}`).join("；") || "文件均未通过校验");
      const artifactName = uploaded.files
        .map((file) => `${file.name}（${Math.ceil(file.sizeBytes / 1024)} KB）`)
        .join("、");
      const items = kinds.map((kind) => ({
        kind,
        artifactName,
        sourceSystem: sourceText,
        period,
        verificationNote: focusText,
      }));
      const response = await enterpriseRequest(
        enterpriseEndpoint("/evidence-manifest"),
        { items, artifactIds: uploaded.files.map((file) => file.id) },
      );
      tier1Complete = true;
      tier2Eligible = Boolean(response.escalation?.eligible);
      enterpriseTier = tier2Eligible ? "tier2" : "tier1";
      tierBusy = false;
      renderTieredEnterprise();
      showNotice(
        tier2Eligible
          ? `流程证据 V${uploaded.version} 已保存；系统识别到证据仍需异常升级。`
          : `流程证据 V${uploaded.version} 已保存；核心证据已齐，暂不触发异常升级。`,
        "success",
      );
      if (uploaded.rejected?.length)
        showNotice(`另有 ${uploaded.rejected.length} 个文件未通过校验，可修正后继续追加。`, "error");
      window.dispatchEvent(new CustomEvent("fde:project-facts-changed", { detail: { view: "enterprise" } }));
    } catch (error) {
      tierBusy = false;
      enterpriseError = `流程证据未登记：${error.message}`;
      renderTieredEnterprise();
    }
    return;
  }
  const sourceTrigger = [
    ...form.querySelectorAll(".choice-trigger[title]"),
  ].find(
    (button) =>
      button.title && !["打开选择", "选择复核重点"].includes(button.title),
  );
  const sourceText = sourceTrigger?.title?.replace(/^已选：/, "") || "";
  if (sourceText)
    form
      .querySelectorAll('input[name^="source-"],select[name^="source-"]')
      .forEach((input) => {
        const kind = input.name.slice(7);
        const checkbox = form.querySelector(
          'input[name="evidence-kind"][value="' + kind + '"]',
        );
        if (checkbox?.checked) input.value = sourceText;
      });
  return baseSubmitTier1Validation(event);
};
function projectStageProgress() {
  const stored = stageProgress[selected?.id] || {};
  return Object.fromEntries(
    projectStageDefinitions.map(([key]) => [key, stored[key] === "completed"]),
  );
}
function projectStageUnlocked(stage, progress = projectStageProgress()) {
  const index = projectStageDefinitions.findIndex(([key]) => key === stage);
  return (
    index <= 0 ||
    projectStageDefinitions.slice(0, index).every(([key]) => progress[key])
  );
}
function projectStageState(stage, progress = projectStageProgress()) {
  const stored = stageProgress[selected?.id]?.[stage];
  if (stored === "running") return "执行中…";
  if (progress[stage]) return "已完成";
  if (stage === "input" && selected?.questionnaire) return "已提交，待核对";
  if (stage === "sources" && selected?.sources?.length)
    return "已有来源，待检查";
  if (stage === "evidence" && selected?.evidence?.length)
    return "已有证据，待检查";
  return projectStageUnlocked(stage, progress) ? "当前可处理" : "待解锁";
}
const legacyStageLabel = stageLabel;
stageLabel = (stage) => projectStageState(stage);
const legacyStageAction = stageAction;
stageAction = async (stage) => {
  if (!projectStageUnlocked(stage)) {
    showNotice("请先完成前置步骤，再进入当前阶段。", "warning");
    return;
  }
  return legacyStageAction(stage);
};
const legacyRenderProject = renderProject;
renderProject = function () {
  renderDiagnosticSidebarSubnav();
  if (!selected) {
    legacyRenderProject();
    return;
  }
  const progress = projectStageProgress();
  const current =
    projectStageDefinitions.find((item) => item[0] === activeStage) ||
    projectStageDefinitions[0];
  const [
    currentKey,
    currentNumber,
    currentLabel,
    currentDescription,
    currentAction,
  ] = current;
  const sectionTitle =
    projectSections.find((item) => item[0] === activeProjectSection)?.[1] ||
    "项目概览";
  const rows = projectSectionRows(activeProjectSection);
  const detailOpen = activeProjectSection !== "overview";
  const box = document.querySelector("#project-content");
  if (!box) return;
  box.innerHTML = `<div class="project-header"><div><span class="eyebrow">${esc(selected.industry)} / ${esc(selected.flow)}</span><h3>${esc(selected.name)}</h3><p>${esc(selected.summary)}</p></div><span class="status-badge ${statusTone[selected.status] || "warn"}">${esc(selected.statusLabel)}</span></div><div class="stepper" role="tablist" aria-label="诊断项目执行流程">${projectStageDefinitions
    .map(([key, n, label]) => {
      const unlocked = projectStageUnlocked(key, progress);
      return `<button type="button" class="step ${key === activeStage ? "current" : ""} ${unlocked ? "" : "is-locked"}" data-stage="${key}" role="tab" aria-selected="${key === activeStage}" aria-controls="project-stage-panel" aria-disabled="${!unlocked}" ${unlocked ? "" : "disabled"}><span>${n}</span><span><b>${label}</b><small>${projectStageState(key, progress)}</small></span></button>`;
    })
    .join(
      "",
    )}</div><details class="project-details-disclosure" ${detailOpen ? "open" : ""}><summary><span><b>诊断详情</b><small>按维度查看证据、问题信号和审核记录</small></span><em>当前：${esc(sectionTitle)}</em></summary><nav class="project-subnav" aria-label="诊断项目详情导航">${projectSections.map(([key, label]) => `<button type="button" class="project-subnav-item ${key === activeProjectSection ? "active" : ""}" data-project-section="${key}" aria-current="${key === activeProjectSection ? "page" : "false"}">${label}<span>→</span></button>`).join("")}</nav></details><section id="project-stage-panel" class="project-section-panel" role="tabpanel" aria-labelledby="project-stage-title"><div class="project-stage-kicker"><span class="eyebrow">当前执行步骤 · ${currentNumber}</span><span class="project-stage-state">${esc(projectStageState(currentKey, progress))}</span></div><h4 id="project-stage-title" tabindex="-1">${esc(currentLabel)}</h4><p class="project-stage-description">${esc(currentDescription)}</p><div class="project-section-focus"><span class="eyebrow">诊断详情 · ${esc(sectionTitle)}</span><div class="project-section-rows">${rows.map(([label, value]) => `<div class="project-section-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div></div><div class="project-action-bar"><div><span>本步骤动作</span><strong>${esc(currentAction)}</strong><small>${currentKey === "input" ? "完成后才进入数据来源检查。" : currentKey === "sources" ? "完成后才进入证据检查。" : currentKey === "evidence" ? "完成后才开放驻场建议。" : currentKey === "recommendation" ? "顾问决定会写入审核记录。" : "报告汇总当前项目，不替代顾问决定。"}</small></div><button type="button" class="primary-button" data-project-action="${currentKey}" ${actionBusy ? "disabled" : ""}>${actionBusy ? "正在处理…" : esc(currentAction)}</button></div></section><div class="decision-banner ${statusTone[selected.status] || "warn"}"><div><span class="eyebrow">SYSTEM RECOMMENDATION</span><h4>${esc(selected.statusLabel)}</h4><p>${esc(selected.recommendation)}</p></div></div>`;
  box.querySelectorAll("[data-stage]").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.disabled) return;
      activeStage = button.dataset.stage;
      updateUrl("project");
      renderProject();
    }),
  );
  box.querySelectorAll("[data-project-section]").forEach((button) =>
    button.addEventListener("click", () => {
      activeProjectSection = button.dataset.projectSection;
      updateUrl("project");
      renderProject();
    }),
  );
  box
    .querySelector("[data-project-action]")
    ?.addEventListener("click", () => stageAction(currentKey));
  notifyRendered("project");
};
function settingsStatus(item) {
  return item.deleted ? "已移除" : item.archived ? "已归档" : "当前队列";
}
function renderSettings() {
  const box = document.querySelector("#settings-content");
  if (!box) return;
  if (settingsLoading) {
    box.innerHTML =
      '<div class="settings-loading" role="status">正在读取项目生命周期…</div>';
    notifyRendered("settings");
    return;
  }
  const counts = {
    all: lifecycleItems.length,
    archived: lifecycleItems.filter((item) => item.archived && !item.deleted)
      .length,
    deleted: lifecycleItems.filter((item) => item.deleted).length,
  };
  const items =
    settingsSection === "archived"
      ? lifecycleItems.filter((item) => item.archived && !item.deleted)
      : settingsSection === "deleted"
        ? lifecycleItems.filter((item) => item.deleted)
        : lifecycleItems.filter((item) => !item.archived && !item.deleted);
  box.innerHTML = `<div class="settings-summary"><div><span class="eyebrow">PROJECT LIFECYCLE</span><h3>项目管理</h3><p>归档用于收起已完成或暂不推进的项目；移除仅从企业项目台隐藏，历史记录仍可恢复。</p></div><div class="settings-stats"><span><b>${counts.archived}</b>已归档</span><span><b>${counts.deleted}</b>已移除</span></div></div><div class="settings-tabs" role="tablist" aria-label="项目生命周期"><button type="button" class="${settingsSection === "archived" ? "active" : ""}" data-settings-filter="archived" role="tab" aria-selected="${settingsSection === "archived"}">已归档 <span>${counts.archived}</span></button><button type="button" class="${settingsSection === "deleted" ? "active" : ""}" data-settings-filter="deleted" role="tab" aria-selected="${settingsSection === "deleted"}">已移除 <span>${counts.deleted}</span></button><button type="button" class="${settingsSection === "all" ? "active" : ""}" data-settings-filter="all" role="tab" aria-selected="${settingsSection === "all"}">全部项目 <span>${counts.all}</span></button></div><div class="settings-list" aria-live="polite">${items.length ? items.map((item, index) => `<article class="settings-item ${item.deleted ? "is-deleted" : ""}"><div class="settings-item-index">${String(index + 1).padStart(2, "0")}</div><div class="settings-item-main"><span class="card-kicker">${esc(item.industry)} · ${esc(item.flow)}</span><h4>${esc(item.name)}</h4><p>${esc(item.summary)}</p><div class="settings-item-meta"><span class="status-badge ${item.deleted ? "bad" : item.archived ? "warn" : "good"}">${settingsStatus(item)}</span><span>${esc(item.statusLabel)}</span><span>更新 ${esc(item.updated)}</span></div></div><div class="settings-item-action"><button type="button" class="screening-card-action" data-lifecycle-action="restore" data-screening-id="${esc(item.id)}">${item.deleted ? "恢复到企业项目台" : "恢复项目"}</button>${item.deleted ? `<button type="button" class="screening-card-action danger" data-lifecycle-action="permanent-delete" data-screening-id="${esc(item.id)}">彻底删除</button>` : ""}</div></article>`).join("") : `<div class="settings-empty"><strong>${settingsSection === "deleted" ? "没有已移除项目" : settingsSection === "archived" ? "还没有已归档项目" : "没有可管理的项目"}</strong><span>${settingsSection === "archived" ? "从企业项目台归档的项目会出现在这里。" : "项目生命周期状态会在这里保留。"}</span></div>`}</div>`;
  box.querySelectorAll("[data-settings-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      settingsSection = button.dataset.settingsFilter;
      renderSettings();
      updateUrl("settings");
    }),
  );
  box.querySelectorAll("[data-lifecycle-action]").forEach((button) =>
    button.addEventListener("click", () => {
      const item = lifecycleItems.find(
        (candidate) => candidate.id === button.dataset.screeningId,
      );
      if (button.dataset.lifecycleAction === "permanent-delete")
        permanentlyDeleteLifecycleItem(item);
      else restoreLifecycleItem(item);
    }),
  );
  notifyRendered("settings");
}
async function openSettings() {
  if (settingsLoading) return;
  settingsLoading = true;
  renderSettings();
  try {
    const response = await fetch("/api/screenings/lifecycle", {
      headers: settingsHeaders(),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error);
    lifecycleItems = payload.screenings || [];
    settingsLoading = false;
    renderSettings();
  } catch (error) {
    settingsLoading = false;
    const box = document.querySelector("#settings-content");
    if (box)
      box.innerHTML = `<div class="settings-empty error"><strong>项目生命周期读取失败</strong><span>${esc(error.message)}</span><button type="button" class="quiet-button" data-settings-retry>重试</button></div>`;
    box
      ?.querySelector("[data-settings-retry]")
      ?.addEventListener("click", openSettings);
  }
}
async function restoreLifecycleItem(item) {
  if (!item || actionBusy) return;
  actionBusy = true;
  try {
    const endpoint = item.deleted
      ? `/api/screenings/${encodeURIComponent(item.id)}/restore`
      : `/api/screenings/${encodeURIComponent(item.id)}/archive`;
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { ...settingsHeaders(), "content-type": "application/json" },
      body: item.deleted
        ? JSON.stringify({})
        : JSON.stringify({ archived: false }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error);
    const updated = payload.screening;
    const lifecycleIndex = lifecycleItems.findIndex(
      (candidate) => candidate.id === item.id,
    );
    if (lifecycleIndex >= 0) lifecycleItems[lifecycleIndex] = updated;
    const activeIndex = screenings.findIndex(
      (candidate) => candidate.id === item.id,
    );
    if (updated.deleted) {
      if (activeIndex >= 0) screenings.splice(activeIndex, 1);
    } else if (activeIndex >= 0) screenings[activeIndex] = updated;
    else screenings.push(updated);
    if (selected?.id === item.id) selected = updated;
    renderSettings();
    renderMetrics();
    renderQueue();
    renderContext();
    showNotice(
      item.deleted
        ? "项目已恢复到企业项目台。"
        : "项目已恢复到企业项目台，归档状态已解除。",
      "success",
    );
  } catch (error) {
    showNotice(`恢复失败：${error.message}`, "error");
  } finally {
    actionBusy = false;
  }
}
async function permanentlyDeleteLifecycleItem(item) {
  if (!item || actionBusy) return;
  if (!window.confirm(`确定彻底删除“${item.name}”吗？删除后无法恢复。`)) return;
  actionBusy = true;
  try {
    const response = await fetch(
      `/api/screenings/${encodeURIComponent(item.id)}/permanent`,
      { method: "DELETE", headers: settingsHeaders() },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error);
    lifecycleItems = lifecycleItems.filter(
      (candidate) => candidate.id !== item.id,
    );
    screenings = screenings.filter((candidate) => candidate.id !== item.id);
    if (selected?.id === item.id)
      selected =
        screenings.find((candidate) => !candidate.archived) ||
        screenings[0] ||
        null;
    renderSettings();
    renderMetrics();
    renderQueue();
    renderContext();
    showNotice("项目已彻底删除，无法恢复。", "success");
  } catch (error) {
    showNotice(`彻底删除失败：${error.message}`, "error");
  } finally {
    actionBusy = false;
  }
}
function startConnectionMonitor() {
  if (window.__fdeConnectionMonitor) return;
  window.__fdeConnectionMonitor = true;
  window.setInterval(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error("本地后端未响应");
      const status = document.querySelector("#status");
      if (status?.dataset.connectionState === "offline")
        showNotice("本地后端已恢复 · 可以继续操作", "success");
      if (status) status.dataset.connectionState = "online";
    } catch (error) {
      const status = document.querySelector("#status");
      if (!status) return;
      status.className = "notice error";
      status.dataset.connectionState = "offline";
      status.innerHTML = `本地后端连接中断：${esc(error.message)} <button type="button" class="inline-retry" data-retry>重试</button>`;
      status
        .querySelector("[data-retry]")
        ?.addEventListener("click", () => location.reload());
    }
  }, 10000);
}

const baseProjectRowsForDiagnostic = projectSectionRows;
projectSectionRows = function (key) {
  if (key === "signals" && selected?.diagnosticIssues?.length)
    return selected.diagnosticIssues.map((issue) => [
      issue.title,
      `${issue.severity} · ${issue.observed}`,
    ]);
  if (key === "score" && selected?.diagnosticMeta)
    return [
      ["判断面", "业务价值 · AI/Agent 适配度 · 数据与知识准备度 · 交付与评测准备度 · 安全与合规风险"],
      ["证据状态", `${selected.diagnosticMeta.acceptedRows} 行样本已验收`],
      ["FDE 当前状态", selected.statusLabel],
      ["人工门禁", "系统只生成候选与理由，不自动批准驻场或 Agent"],
    ];
  return baseProjectRowsForDiagnostic(key);
};
function renderDiagnosticIssueBoard(item, audience) {
  const issues = item.diagnosticIssues || [];
  const enterprise = audience === "enterprise";
  if (!issues.length)
    return '<section class="diagnostic-issue-board empty" aria-labelledby="diagnostic-issues-title"><div class="issue-board-head"><div><span class="eyebrow">ISSUE MAP</span><h4 id="diagnostic-issues-title">本轮问题信号</h4></div></div><p>本轮尚未形成可计算的问题信号，不能把企业自述直接当成诊断结论。</p></section>';
  const field = (issue, label, value, extra = "") =>
    `<div class="issue-card-field ${extra}"><span>${esc(label)}</span><strong>${esc(enterprise && label === "目前看到" ? enterpriseObservation(issue) : value || "待确认")}</strong></div>`;
  const enterpriseObservation = (issue) =>
    String(issue.observed || "")
      .replace(/\bstatus\b/g, "流程状态")
      .replace(/\bsku\b/g, "商品编码");
  return `<section class="diagnostic-issue-board" aria-labelledby="diagnostic-issues-title"><div class="issue-board-head"><div><span class="eyebrow">ISSUE MAP · ${enterprise ? "企业可读版" : "FDE 工作稿"}</span><h4 id="diagnostic-issues-title">${enterprise ? "本轮发现的业务问题" : "本轮可验证问题"}</h4><p>${enterprise ? "每个问题都对应已收到的材料和下一步补充动作。" : "问题必须同时能指向证据、规则、业务影响和处理动作。"}</p></div><span class="issue-board-count">${issues.length} 个问题</span></div><div class="issue-board-grid">${issues.map((issue) => `<article class="diagnostic-issue-card severity-${issue.severity === "高" ? "high" : issue.severity === "中" ? "medium" : "low"}"><div class="issue-card-head"><div><span class="issue-id">${esc(issue.id)}</span><span class="issue-severity">${esc(issue.severity)}风险</span></div><span class="issue-confidence">${enterprise ? "待补证据" : `${esc(issue.confidence)}可信`}</span></div><h5>${esc(enterprise ? issue.businessTitle : issue.title)}</h5><div class="issue-card-grid">${enterprise ? `${field(issue, "目前看到", issue.observed)}${field(issue, "为什么重要", issue.impact)}${field(issue, "需要补充", issue.missing)}${field(issue, "接下来会做什么", issue.nextAction)}` : `${field(issue, "证据依据", issue.evidenceRefs?.join("、"))}${field(issue, "检测规则", issue.rule)}${field(issue, "实际观察", issue.observed)}${field(issue, "业务影响", issue.impact)}${field(issue, "下一步动作", issue.nextAction)}${field(issue, "责任角色", issue.owner)}${field(issue, "可信度", issue.confidence)}`}</div>${!enterprise ? `<div class="issue-evidence"><span>状态</span><strong>${esc(issue.status)} · ${esc(issue.category)}</strong></div>` : ""}</article>`).join("")}</div></section>`;
}
function renderReportDecisionStrip(item, audience) {
  const issues = item.diagnosticIssues || [];
  const meta = item.diagnosticMeta;
  const high = issues.filter((issue) => issue.severity === "高").length;
  const decisionRecorded = Boolean(
    item.connectorDiagnosis?.latestDecision || item.consultantDecision,
  );
  const decisionNote = decisionRecorded
    ? audience === "enterprise"
      ? "顾问决策已记录；后续按方案确认与验收"
      : "顾问决策已记录；系统不合成总分，也不代替顾问决定"
    : audience === "enterprise"
      ? "先补最小字段，再决定驻场"
      : "系统建议不替代顾问决定";
  return `<div class="report-decision-strip" aria-label="诊断摘要"><div class="report-decision-metric"><span>可验证问题</span><strong>${issues.length}</strong><small>${audience === "enterprise" ? "需要逐项补证" : "已形成问题卡片"}</small></div><div class="report-decision-metric"><span>高风险</span><strong>${high}</strong><small>需要优先处理</small></div><div class="report-decision-metric"><span>证据覆盖</span><strong>${meta ? `${meta.acceptedRows} 行` : "待提交"}</strong><small>${meta ? "当前样本已验收" : "尚未形成样本"}</small></div><div class="report-decision-metric decision-metric-emphasis"><span>${audience === "enterprise" ? "当前建议" : "合作状态"}</span><strong>${esc(item.statusLabel)}</strong><small>${esc(decisionNote)}</small></div></div>`;
}

renderDiagnosticIssueBoard = function (item, audience) {
  const issues = item.diagnosticIssues || [];
  const enterprise = audience === "enterprise";
  if (!issues.length)
    return '<section class="diagnostic-issue-board empty" aria-labelledby="diagnostic-issues-title"><div class="issue-board-head"><div><span class="eyebrow">ISSUE MAP</span><h4 id="diagnostic-issues-title">本轮问题信号</h4></div></div><p>本轮尚未形成可计算的问题信号，不能把企业自述直接当成诊断结论。</p></section>';
  const field = (label, value) =>
    `<div class="issue-card-field"><span>${esc(label)}</span><strong>${esc(value || "待确认")}</strong></div>`;
  const card = (issue) => {
    const observation = String(issue.observed || "")
      .replace(/\bstatus\b/g, "流程状态")
      .replace(/\bsku\b/g, "商品编码");
    const business = enterprise
      ? `${field("目前看到", observation)}${field("为什么重要", issue.impact)}${field("需要补充", issue.missing)}${field("接下来会做什么", issue.nextAction)}`
      : `${field("实际观察", observation)}${field("业务影响", issue.impact)}${field("下一步动作", issue.nextAction)}${field("责任角色", issue.owner)}`;
    const technical = enterprise
      ? ""
      : `<details class="technical-evidence"><summary>查看证据与规则血缘</summary><div class="issue-lineage-grid">${field("原始材料 / 系统记录", issue.evidenceRefs?.join("、"))}${field("检测规则", issue.rule)}${field("企业确认", issue.confirmation)}${field("后续任务", issue.followup || issue.nextAction)}</div><div class="issue-lineage-actions"><button type="button" class="quiet-button" data-issue-destination="batches">查看证据记录</button><button type="button" class="quiet-button" data-issue-destination="diagnosis">查看规则与确认</button><button type="button" class="quiet-button" data-issue-destination="decision">查看后续决策</button></div></details>`;
    return `<article class="diagnostic-issue-card severity-${issue.severity === "高" ? "high" : issue.severity === "中" ? "medium" : "low"}" data-issue-id="${esc(issue.id)}"><div class="issue-card-head"><div><span class="issue-severity">${esc(issue.severity)}风险</span></div><span class="issue-confidence">${enterprise ? "待企业复核" : `${esc(issue.confidence)}可信`}</span></div><h5>${esc(enterprise ? issue.businessTitle : issue.title)}</h5><div class="issue-card-grid">${business}</div>${technical}</article>`;
  };
  const primary = issues.slice(0, 3);
  const remaining = issues.slice(3);
  return `<section class="diagnostic-issue-board" aria-labelledby="diagnostic-issues-title"><div class="issue-board-head"><div><span class="eyebrow">ISSUE MAP · ${enterprise ? "企业可读版" : "FDE 工作稿"}</span><h4 id="diagnostic-issues-title">${enterprise ? "本轮发现的业务问题" : "优先处理的问题"}</h4><p>${enterprise ? "先看问题影响与补充动作，技术证据不会展示。" : "首屏只展示前三个高优先级问题，技术编号和血缘按需展开。"}</p></div><span class="issue-board-count">${issues.length} 个问题</span></div><div class="issue-board-grid">${primary.map(card).join("")}</div>${remaining.length ? `<details class="issue-board-more"><summary>查看其余 ${remaining.length} 个问题</summary><div class="issue-board-grid">${remaining.map(card).join("")}</div></details>` : ""}</section>`;
};

const renderEnterpriseWithTenantGuard = renderEnterprise;
function renderEnterpriseHydration(root) {
  if (!root) return;
  root.querySelector(':scope > .unified-enterprise-board')?.remove();
  const legacy = root.querySelector(':scope > .enterprise-card');
  if (legacy) legacy.hidden = true;
  let hydration = root.querySelector(':scope > .enterprise-hydrating');
  if (!hydration) {
    hydration = document.createElement('section');
    hydration.className = 'unified-enterprise-board enterprise-hydrating';
    root.insertBefore(hydration, legacy || null);
  }
  hydration.innerHTML = '<div class="unified-loading" role="status" aria-live="polite" aria-busy="true">正在核对项目状态与当前权限…</div>';
}
renderEnterprise = () => {
  if (currentRole !== "fde_owner" && !selected) {
    const enterprise = document.querySelector("#enterprise");
    if (!enterprise) return;
    enterprise.innerHTML = `<div class="enterprise-unavailable" role="status"><span class="eyebrow">企业协作</span><h2 id="enterprise-title" tabindex="-1">当前企业项目不可用</h2><p>该账号绑定的项目已归档或移除，当前不能继续提交资料或授权数据。</p><div class="enterprise-unavailable-actions"><button type="button" class="quiet-button" id="unavailable-logout">退出并联系服务方</button></div></div>`;
    enterprise.querySelector("#unavailable-logout")?.addEventListener("click", () =>
      document.querySelector("#logout-button")?.click(),
    );
    notifyRendered("enterprise");
    return;
  }
  if (isEnterpriseAccount()) {
    const enterprise = document.querySelector("#enterprise");
    if (!window.__fdeUnifiedFlowReady) {
      renderEnterpriseHydration(enterprise);
      notifyRendered("enterprise");
      return;
    }
  }
  renderEnterpriseWithTenantGuard();
  window.fdeEnhanceEnterprise?.();
  notifyRendered("enterprise");
};

function installContextRailToggle() {
  const toggle = document.querySelector("#context-rail-toggle");
  const resizer = document.querySelector("#context-rail-resizer");
  if (!toggle || !resizer || toggle.dataset.bound === "true") return;
  toggle.dataset.bound = "true";
  const minimumWidth = 264;
  const maximumWidth = 360;
  const defaultWidth = 320;
  const widthStep = 8;
  const normalizeWidth = (value) => {
    const parsed = Number(value);
    const bounded = Number.isFinite(parsed)
      ? Math.min(maximumWidth, Math.max(minimumWidth, parsed))
      : defaultWidth;
    return Math.round(bounded / widthStep) * widthStep;
  };
  const applyWidth = (value, persist = false) => {
    const width = normalizeWidth(value);
    document.body.dataset.contextRailWidth = String(width);
    document.documentElement.style.setProperty("--context-rail-width", `${width}px`);
    resizer.setAttribute("aria-valuenow", String(width));
    resizer.setAttribute("aria-valuetext", `当前项目摘要宽度 ${width} 像素`);
    if (persist) localStorage.setItem("fde-context-rail-width", String(width));
  };
  const apply = (collapsed, { animate = false } = {}) => {
    const railBody = document.querySelector("#context-rail .context-rail-body");
    const updateState = () => {
      const railLabel = document.body.dataset.activeView === "enterprise" ? "当前任务指引" : "当前项目摘要";
      document.body.classList.toggle("context-rail-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute(
        "aria-label",
        collapsed ? `展开${railLabel}` : `收起${railLabel}`,
      );
      toggle.title = collapsed ? `展开${railLabel}` : `收起${railLabel}`;
    };
    const gsap = gsapRuntime;
    if (!animate || !railBody || !gsap || prefersReducedMotion()) {
      updateState();
      return;
    }
    gsap.killTweensOf(railBody);
    if (collapsed) {
      gsap.to(railBody, {
        autoAlpha: 0,
        x: 18,
        duration: 0.16,
        ease: "power2.out",
        onComplete: () => {
          updateState();
          gsap.set(railBody, { clearProps: "opacity,visibility,transform" });
        },
      });
      return;
    }
    updateState();
    gsap.fromTo(
      railBody,
      { autoAlpha: 0, x: 18 },
      {
        autoAlpha: 1,
        x: 0,
        duration: 0.22,
        ease: "power2.out",
        clearProps: "opacity,visibility,transform",
      },
    );
  };
  const narrowDesktop = window.matchMedia?.("(max-width: 1180px)");
  const applyResponsiveState = () => {
    // Preserve the working canvas before the summary drawer consumes its minimum width.
    apply(Boolean(narrowDesktop?.matches) || localStorage.getItem("fde-context-rail") === "collapsed");
  };
  applyWidth(localStorage.getItem("fde-context-rail-width"));
  applyResponsiveState();
  narrowDesktop?.addEventListener?.("change", applyResponsiveState);
  toggle.addEventListener("click", () => {
    const collapsed = !document.body.classList.contains(
      "context-rail-collapsed",
    );
    localStorage.setItem(
      "fde-context-rail",
      collapsed ? "collapsed" : "expanded",
    );
    apply(collapsed, { animate: true });
  });
  let pointerStart = null;
  const finishResize = () => {
    if (!pointerStart) return;
    pointerStart = null;
    document.body.classList.remove("context-rail-resizing");
  };
  resizer.addEventListener("pointerdown", (event) => {
    if (document.body.classList.contains("context-rail-collapsed")) return;
    pointerStart = {
      x: event.clientX,
      width: Number(document.body.dataset.contextRailWidth) || defaultWidth,
    };
    resizer.setPointerCapture?.(event.pointerId);
    document.body.classList.add("context-rail-resizing");
    event.preventDefault();
  });
  resizer.addEventListener("pointermove", (event) => {
    if (!pointerStart) return;
    applyWidth(pointerStart.width + pointerStart.x - event.clientX, false);
  });
  resizer.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    applyWidth(document.body.dataset.contextRailWidth, true);
    resizer.releasePointerCapture?.(event.pointerId);
    finishResize();
  });
  resizer.addEventListener("pointercancel", finishResize);
  resizer.addEventListener("keydown", (event) => {
    const currentWidth = Number(document.body.dataset.contextRailWidth) || defaultWidth;
    const changes = {
      ArrowLeft: currentWidth + widthStep,
      ArrowRight: currentWidth - widthStep,
      Home: minimumWidth,
      End: maximumWidth,
    };
    if (!(event.key in changes)) return;
    event.preventDefault();
    applyWidth(changes[event.key], true);
  });
}

installContextRailToggle();
let connectorWorkbenchLoadError = null;
const connectorWorkbenchReady = import("./connector-workbench.js?v=20260919-project-subnav-1")
  .then(({ installConnectorWorkbench }) =>
    installConnectorWorkbench({
      esc,
      projectSections,
      showNotice,
      setView,
      updateUrl,
      request: (...args) => fetch(...args),
      getSelected: () => selected,
      getUserRole: () => authContext?.user?.role || "legacy_test",
      getActiveView: () => activeView,
      getActiveProjectSection: () => activeProjectSection,
      getActivePrepSection: () => activePrepSection,
      setActivePrepSection: (value) => {
        activePrepSection = value;
      },
      getActiveReportType: () => activeReportType,
      setActiveReportType: (value) => {
        activeReportType = value;
      },
      getSettingsSection: () => settingsSection,
      setSettingsSection: (value) => {
        settingsSection = value;
      },
      getConnectorRole: () =>
        authContext?.user?.role === "legacy_test"
          ? new URLSearchParams(location.search).get("connectorRole")
          : isEnterpriseAccount()
            ? "enterprise"
            : authContext?.user?.role === "admin"
              ? "admin"
              : "fde",
      setConnectorRole: (value) => {
        const url = new URL(location.href);
        url.searchParams.delete("connectorRole");
        history.replaceState(null, "", url);
      },
      setActiveProjectSection: (value) => {
        activeProjectSection = value;
      },
      onRenderProject: (listener) => onRendered("project", listener),
      onRenderEnterprise: (listener) => onRendered("enterprise", listener),
      refreshEnterprise: () => renderEnterprise(),
      onRenderPrep: (listener) => onRendered("prep", listener),
      onRenderReports: (listener) => onRendered("reports", listener),
      onRenderSettings: (listener) => onRendered("settings", listener),
      refreshProject: () => renderProject(),
      refreshPrep: () => renderPrep(),
      refreshReports: () => renderReports(),
      refreshSettings: () => renderSettings(),
      refreshContext: () => renderContext(),
      refreshQueue: () => renderQueue(),
      refreshMetrics: () => renderMetrics(),
      renderEnterpriseSwitcher: (current) => renderEnterpriseProjectSwitcher(current),
      switchEnterpriseProject,
    }),
  )
  .catch((error) => {
    connectorWorkbenchLoadError = error;
    showNotice(`多系统接入模块加载失败：${error.message}`, "error");
    renderReports();
  });
const unifiedFlowReady = connectorWorkbenchReady
  .then(() => import("./unified-flow-workbench.js?v=20260909-enterprise-open"))
  .then(({ installUnifiedFlowWorkbench }) =>
    installUnifiedFlowWorkbench({
      esc,
      request: (...args) => fetch(...args),
      showNotice,
      setView,
      getSelected: () => selected,
      getUserRole: () => authContext?.user?.role || "legacy_test",
      getActiveView: () => activeView,
      getActiveProjectSection: () => activeProjectSection,
      setActiveProjectSection: (value) => { activeProjectSection = value; },
      setActiveReportType: (value) => { activeReportType = value; },
      refreshReports: () => renderReports(),
      refreshProject: () => renderProject(),
      ensureEnterpriseLegacy: () => {
        const enterprise = document.querySelector("#enterprise");
        if (enterprise && !enterprise.querySelector("#enterprise-detail form")) {
          renderEnterpriseWithTenantGuard();
          window.fdeEnhanceEnterprise?.();
        }
      },
      openEnterpriseTier: (tier) => {
        enterpriseTier = tier;
        tier1Mode = "manifest";
        enterpriseError = "";
        renderTieredEnterprise();
        window.fdeEnhanceEnterprise?.();
      },
      onRenderProject: (listener) => onRendered("project", listener),
      onRenderEnterprise: (listener) => onRendered("enterprise", listener),
      onRenderReports: (listener) => onRendered("reports", listener),
      renderEnterpriseSwitcher: (current) => renderEnterpriseProjectSwitcher(current),
      switchEnterpriseProject,
    }),
  )
  .catch((error) => showNotice(`统一工作流模块加载失败：${error.message}`, "error"));
    unifiedFlowReady.then(()=>import('./delivery-workbench.js?v=20260920-prep-single-renderer-1')).then(({installDeliveryWorkbench})=>installDeliveryWorkbench({
  esc,request:(...args)=>fetch(...args),getSelected:()=>selected,
  getUserRole:()=>authContext?.user?.role==='legacy_test'?(isEnterpriseAccount()?'enterprise_owner':'fde'):authContext?.user?.role,
  getActiveView:()=>activeView,getActiveProjectSection:()=>activeProjectSection,
  onRenderProject:listener=>onRendered('project',listener),onRenderEnterprise:listener=>onRendered('enterprise',listener),
  openSection:section=>{activeProjectSection=section;setView('project');updateUrl('project');renderProject();},
})).catch(error=>showNotice(`方案与验证模块未加载：${error.message}`,'error'));
function renderReportIndex(visible, activeReportSection, enterprise) {
  const groups = [
    ["事实基础", ["01", "02", "03", "04", "05", "06", "07"]],
    ["问题与决策", ["08", "09", "10", "11"]],
    ["行动与交付", ["12", "13", "14"]],
  ];
  const item = (section) => `<button type="button" class="report-index-item ${section.id === activeReportSection ? "active" : ""}" data-report-section="${section.id}" aria-current="${section.id === activeReportSection ? "page" : "false"}"><span>${section.id}</span><b>${esc(section.id === "01" ? "概况" : section.title)}</b></button>`;
  return `<nav class="report-index" aria-label="${enterprise ? "企业版报告" : "初筛报告"}内容"><div class="report-index-title"><span class="eyebrow">REPORT INDEX</span><strong>${enterprise ? "企业可见版 · 13 项" : "三层证据 · 14 项"}</strong><small>${enterprise ? "只隐藏内部待验证问题，保留结果验收记录" : "事实基础 → 问题与决策 → 行动与交付；按需展开"}</small></div>${groups.map(([label, ids]) => { const sections = visible.filter((section) => ids.includes(section.id)); if (!sections.length) return ""; const open = sections.some((section) => section.id === activeReportSection); return `<details class="report-index-group" ${open ? "open" : ""}><summary><span>${label}</span><small>${sections.length} 项</small></summary><div class="report-index-group-items">${sections.map(item).join("")}</div></details>`; }).join("")}</nav>`;
}

function renderReports() {
  const box = document.querySelector("#reports-content");
  if (!box || !selected) return;
  const sections = reportSectionsFor(selected);
  let content = "";
  if (activeReportType === "screening" || activeReportType === "enterprise") {
    const enterprise = activeReportType === "enterprise";
    const visible = enterprise
      ? sections.filter((section) => section.id !== "13")
      : sections;
    if (!visible.some((section) => section.id === activeReportSection))
      activeReportSection = visible[0]?.id || "01";
    content = `<div class="report-layout">${renderReportIndex(visible, activeReportSection, enterprise)}<article class="report-paper"><div class="report-top"><div><span class="eyebrow">${enterprise ? "ENTERPRISE REPORT" : "SCREENING REPORT"} / ${esc(selected.id)}</span><h3>${esc(selected.name)} · ${enterprise ? "企业版初筛报告" : "驻场前远程初筛报告"}</h3><p>${enterprise ? "企业协作版 · 展示已确认事实、问题影响、介入观察与验收记录" : "内部诊断工作稿 · 用于决定是否投入现场顾问"} · 数据边界：合成演示</p></div><span class="status-badge ${statusTone[selected.status] || "warn"}">${esc(selected.statusLabel)}</span></div><p class="report-version-stamp">${esc(reportVersionLabel(selected))}</p><div class="report-sections">${visible.map((section) => `<section id="report-section-${section.id}" class="report-section ${section.id === activeReportSection ? "selected" : ""}" ${section.id !== activeReportSection ? "hidden" : ""} aria-labelledby="report-heading-${section.id}"><div class="report-section-heading"><span>${section.id}</span><h4 id="report-heading-${section.id}">${esc(section.title)}</h4></div><div class="report-section-rows">${section.items.map((item) => `<div class="report-section-row"><span>${esc(item[0])}</span><strong>${esc(item[1])}</strong>${item[2] ? `<small>${esc(item[2])}</small>` : ""}</div>`).join("")}</div></section>`).join("")}</div><div class="report-foot"><span>事实与判断分层：已验证 / 推断 / 待确认 / 未知</span><button type="button" class="primary-button" data-decision>进入诊断工作台 · 决策记录</button></div></article></div>`;
  } else if (activeReportType === "decision") {
    content = `<div class="report-placeholder panel"><span class="eyebrow">DECISION LOG</span><h3>顾问决策记录</h3><p>${selected.consultantDecision ? `已记录：${esc(selected.consultantDecision.statusLabel)} · ${esc(selected.consultantDecision.at)}` : "当前项目尚未记录顾问决定。"}</p><button type="button" class="primary-button" data-decision>进入诊断工作台 · 决策记录</button></div>`;
  } else if (activeReportType === "comparison") {
    content = `<div class="panel comparison-panel"><span class="eyebrow">PORTFOLIO VIEW</span><h3>企业项目对比</h3><div class="comparison-table" role="table"><div class="comparison-row comparison-head" role="row"><span>企业</span><span>准备度</span><span>建议</span></div>${screenings.map((item) => `<div class="comparison-row" role="row"><span>${esc(item.name)}</span><span>${esc(item.readiness)}</span><strong class="${statusTone[item.status] || "warn"}">${esc(item.statusLabel)}</strong></div>`).join("")}</div></div>`;
  } else {
    content = `<div class="report-placeholder panel" role="status"><span class="eyebrow">REPORT MODULE</span><h3>${connectorWorkbenchLoadError ? "专题报告模块加载失败" : "专题报告模块正在加载"}</h3><p>${connectorWorkbenchLoadError ? `当前不能安全展示“${esc(activeReportType)}”报告，请刷新后重试；已阻止回退到无关内容。` : "正在读取同一诊断事实与历史快照，请稍候。"}</p></div>`;
  }
  box.innerHTML = `${renderReportTypes()}${content}`;
  box.querySelectorAll("[data-report-type]").forEach((button) =>
    button.addEventListener("click", () => {
      activeReportType = button.dataset.reportType;
      renderReports();
      updateUrl("reports");
    }),
  );
  box.querySelectorAll("[data-report-section]").forEach((button) =>
    button.addEventListener("click", () => {
      activeReportSection = button.dataset.reportSection;
      renderReports();
      updateUrl("reports");
      const heading = document.querySelector(
        `#report-heading-${activeReportSection}`,
      );
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
  box
    .querySelectorAll("[data-decision]")
    .forEach((button) => button.addEventListener("click", recordDecision));
  box.querySelectorAll("[data-issue-destination]").forEach((button) =>
    button.addEventListener("click", () => {
      activeProjectSection = button.dataset.issueDestination;
      setView("project");
      updateUrl("project");
      renderProject();
    }),
  );
  box.insertAdjacentHTML("afterbegin", '<button type="button" class="report-print-button quiet-button" data-print-report>打印 / 另存 PDF</button>');
  box.querySelector("[data-print-report]")?.addEventListener("click", () => window.print());
  notifyRendered("reports");
}
