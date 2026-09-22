(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("demo") !== "1") return;

  const now = new Date().toISOString();
  const sourceCatalog = {
    types: [
      ["CRM", "system"],
      ["ERP", "system"],
      ["OA/BPM/工单系统", "system"],
      ["CSV/Excel 表格文件", "spreadsheet"],
      ["企业上传资料", "upload"],
    ],
    readRoutes: [
      "GET /api/enterprises/:id/connectors",
      "GET /api/enterprises/:id/connectors/:sourceId/preview",
      "POST /api/enterprises/:id/connectors/:sourceId/read-runs",
    ],
    syntheticOnly: true,
  };

  const reportSections = (item) => [
    ["01", "企业和本次筛选项目概况", [["企业", item.name], ["行业", item.industry], ["数据边界", "合成演示数据"]]],
    ["02", "目标业务流程", [["流程", item.flow], ["筛选目标", "判断是否值得投入现场顾问"]]],
    ["03", "已确认的数据来源", item.sources.map((source) => [source[0], source[2]])],
    ["04", "数据电子化判断", [["电子化程度", item.evidence[0][1], item.evidence[0][2]]]],
    ["05", "数据结构化判断", [["结构化程度", item.evidence[1][1], item.evidence[1][2]]]],
    ["06", "流程追溯判断", [["流程可追溯", item.evidence[2][1], item.evidence[2][2]]]],
    ["07", "数据质量和覆盖范围", [["数据可获得", item.evidence[3][1], item.evidence[3][2]], ["覆盖范围", item.readiness]]],
    ["08", "发现的问题信号", item.signals.length ? item.signals.map((signal) => [signal[0], `${signal[1]} · ${signal[2]}`]) : [["未形成可计算信号", "等待更多可验证材料"]]],
    ["09", "五个判断面与证据依据", [["判断方式", "按证据、规则和人工确认分层"], ["系统边界", "不合成总分，不代替顾问决定"]]],
    ["10", "风险点和未知信息", item.risks.map((risk) => ["风险 / 未知", risk])],
    ["11", "FDE 路径判断与理由", [["当前状态", item.statusLabel], ["证据边界", item.gate], ["下一步动作", item.recommendation]]],
    ["12", "驻场前必须补充的材料", item.materials.map((material) => ["待补材料", material])],
    ["13", "建议现场验证的问题", [["待验证问题", "确认时间、责任角色和异常处理方式"]]],
    ["14", "顾问最终决策记录", [["顾问决定", "待 FDE 顾问记录"], ["记录边界", "系统不代替顾问决定"]]],
  ].map(([id, title, items]) => ({ id, title, kind: "demo", items }));

  const makeScreening = (definition) => {
    const item = {
      ...definition,
      score: null,
      archived: false,
      deleted: false,
      questionnaire: null,
      consultantDecision: null,
      connectorDiagnosis: { diagnosisVersion: { current: null } },
      diagnosticIssues: [],
      diagnosticMeta: { acceptedRows: 0, ruleVersion: "demo-rules.v1" },
      sourceCatalog,
      work: {
        phase: "等待企业材料",
        reason: "公开演示项目，仅展示原工作台交互",
        priority: definition.status === "recommended" ? 20 : 60,
        nextAction: "打开诊断项目查看证据边界",
        ownerRole: "fde",
        updatedAt: now,
        risk: "本页面不连接真实企业系统。",
      },
    };
    item.reportSections = reportSections(item);
    return item;
  };

  const screenings = [
    makeScreening({
      id: "linxi-screening",
      enterpriseId: "linxi",
      name: "杭州临溪茶具",
      short: "临溪",
      industry: "品牌电商",
      flow: "售后返修与补发",
      status: "not_recommended",
      statusLabel: "暂缺可验证数据",
      readiness: "数据基础不足",
      updated: "今天 09:24",
      summary: "核心售后过程依赖纸质登记、微信群和个人记忆，暂时无法远程还原案件流转。",
      gate: "目标流程没有可读取的电子事件链。",
      sources: [["纸质售后台账", "manual", "无法读取"], ["微信群沟通", "chat", "无法形成结构化案件"]],
      evidence: [["电子化程度", "0 / 4", "核心记录仍在纸面"], ["结构化程度", "0 / 4", "没有统一案件编号"], ["流程可追溯", "1 / 4", "只能依靠人工回忆"], ["数据可获得", "0 / 4", "未提供可验证样本"]],
      risks: ["无法判断等待发生在哪个环节", "现场也需要先建立基础台账"],
      materials: ["建立统一售后案件编号", "提供近 30 天售后样例"],
      signals: [],
      recommendation: "先完成基础电子化和最小样本采集，再由 FDE 判断是否进入深度诊断。",
    }),
    makeScreening({
      id: "qingshan-screening",
      enterpriseId: "qingshan",
      name: "苏州启衡智能制造（录屏演示）",
      short: "启衡",
      industry: "工业设备制造",
      flow: "采购申请→OA审批→预付款→WMS入库",
      status: "conditional",
      statusLabel: "远程补充材料",
      readiness: "尚未形成可验证证据",
      updated: "刚刚",
      summary: "项目已建立，等待企业成员确认身份并提交最小必要材料。",
      gate: "尚无已授权且通过校验的记录，不能形成诊断结论。",
      sources: [],
      evidence: [["电子化程度", "待确认", "尚未提交企业资料"], ["结构化程度", "待确认", "尚未提交结构化样本"], ["流程可追溯", "待确认", "尚未提交跨系统时间记录"], ["数据可获得", "待确认", "尚未完成只读授权或材料上传"]],
      risks: ["尚未取得可验证业务证据"],
      materials: ["邀请企业协作成员", "完成准入自述", "选择系统只读授权或批量上传材料"],
      signals: [],
      recommendation: "先完成远程材料采集与证据检查，再由 FDE 根据五个判断面记录下一步。",
    }),
    makeScreening({
      id: "mianyun-screening",
      enterpriseId: "mianyun",
      name: "杭州棉云家居",
      short: "棉云",
      industry: "家居制造",
      flow: "订单交付与异常处理",
      status: "recommended",
      statusLabel: "具备远程诊断基础",
      readiness: "具备远程诊断条件",
      updated: "今天 11:16",
      summary: "CRM、ERP、工单和仓储系统均有结构化记录，已经发现订单异常在跨部门交接处积压。",
      gate: "目标流程具备案件编号、活动、时间和责任角色，可进入远程深诊。",
      sources: [["CRM 商机与订单", "system", "已读取 90 天样例"], ["ERP 交付单", "system", "字段映射通过"], ["工单系统", "system", "已读取异常关闭记录"]],
      evidence: [["电子化程度", "4 / 4", "核心订单全部在线"], ["结构化程度", "4 / 4", "编号和状态稳定"], ["流程可追溯", "4 / 4", "节点和责任角色齐全"], ["数据可获得", "3 / 4", "接口授权待确认"]],
      risks: ["交付异常在客服与仓库之间重复转派", "部分异常关闭原因仍需业务解释"],
      materials: ["准备客服、仓库和交付负责人", "确认 WMS 增量读取权限"],
      signals: [["异常工单平均等待 31 小时", "高", "已超过内部目标 8 小时"], ["订单异常重复转派", "高", "近 90 天出现 42 次"]],
      recommendation: "先进入 FDE 远程诊断与机会资格判断；是否介入、是否驻场均需人工记录依据。",
    }),
  ];

  const workflow = {
    enterpriseId: "qingshan",
    phase: "awaiting_authorization",
    phaseLabel: "等待企业授权",
    currentTask: { key: "authorize_systems", label: "完成系统授权", note: "审阅系统、字段与时间范围，确认本次只读授权。", ownerRole: "enterprise_authorizer", actionable: false },
    tasks: [
      { key: "invite_members", label: "邀请进入", ownerRole: "fde", status: "done", actionable: false },
      { key: "identity", label: "企业身份确认", ownerRole: "enterprise_authorizer", status: "done", actionable: false },
      { key: "complete_admission", label: "准入自述", ownerRole: "enterprise_process_owner", status: "done", actionable: false },
      { key: "complete_materials", label: "资料采集方式", ownerRole: "enterprise_process_owner", status: "done", actionable: false },
      { key: "authorize_systems", label: "授权或上传", ownerRole: "enterprise_authorizer", status: "current", actionable: false },
      { key: "review_materials", label: "证据检查", ownerRole: "fde", status: "locked", actionable: false },
      { key: "run_diagnosis", label: "FDE 诊断", ownerRole: "fde", status: "locked", actionable: false },
      { key: "confirm_facts", label: "企业确认", ownerRole: "enterprise_process_owner", status: "locked", actionable: false },
      { key: "record_decision", label: "决策报告", ownerRole: "fde", status: "locked", actionable: false },
    ],
    members: 1,
    invitations: 1,
    acquisitionPath: "upload",
    connector: { status: "awaiting_authorization", decisionRecorded: false },
    revisionPolicy: { latestAdmission: null, latestMaterials: null, directEditAllowed: false },
    reopen: null,
    history: { requests: [], intakes: [], evidencePackages: [] },
    activity: [],
  };
  const evidence = { missing: ["data", "timing"], pendingReview: 0, readyForSubmission: true, readyForDiagnosis: false, artifacts: [], records: [], files: [], acquisitionPaths: [], dimensions: {}, summary: {} };
  const connectorWorkspace = { readiness: { sourceRecords: 0, acceptedDatasets: 0, totalDatasets: 0 }, sources: [], boundary: "仅展示合成数据，不连接真实企业系统。" };
  const mapping = { coverage: 0, counts: { pending: 0, gap: 0, confirmed: 0 }, candidates: [], gaps: [] };
  const diagnosis = { summary: { triggered: 0, issues: 0, pendingConfirmation: 0 }, issues: [], latestDecision: null, diagnosisVersion: { current: null } };
  const delivery = { history: [], issues: [], planConfirmed: false };
  const readonlyConnectors = { sources: [], catalog: [], dataset: { fields: [], required: [], labels: {} } };
  const projectState = { status: "awaiting_authorization", history: [] };
  const session = { user: { role: "legacy_test", displayName: "公开演示顾问", username: "public-demo" }, writeToken: "demo-write-token", expiresAt: new Date(Date.now() + 86400000).toISOString(), absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString() };

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const parseBody = async (init) => {
    try { return JSON.parse(init?.body || "{}"); } catch { return {}; }
  };
  const mockFetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.pathname;
    if (path === "/api/session") return json(session);
    if (path === "/api/screenings" && method === "GET") return json({ screenings });
    if (path === "/api/screenings/lifecycle") return json({ screenings });
    if (path === "/api/health") return json({ ok: true, mode: "public-demo" });
    if (path.startsWith("/api/screenings/") && method !== "GET") {
      const id = decodeURIComponent(path.split("/")[3] || "");
      const item = screenings.find((candidate) => candidate.id === id) || screenings[0];
      if (method === "PATCH") item.archived = Boolean((await parseBody(init)).archived);
      if (method === "DELETE") item.deleted = true;
      return json({ screening: item });
    }
    if (path === "/api/screenings" && method === "POST") {
      const body = await parseBody(init);
      const item = makeScreening({ id: `demo-${Date.now()}`, enterpriseId: `demo-${Date.now()}`, name: body.name || "演示企业", short: String(body.name || "演示企业").slice(0, 2), industry: body.industry || "其他", flow: body.flow || "待定义流程", status: "conditional", statusLabel: "待补材料", readiness: "尚未评估", updated: "刚刚", summary: "公开演示项目，仅用于体验原工作台流程。", gate: "演示数据未连接真实企业系统。", sources: [], evidence: [["电子化程度", "待确认", "等待输入"], ["结构化程度", "待确认", "等待输入"], ["流程可追溯", "待确认", "等待输入"], ["数据可获得", "待确认", "等待输入"]], risks: ["未连接真实数据"], materials: ["填写企业问卷"], signals: [], recommendation: "补充最小必要信息后继续。" });
      screenings.push(item);
      return json({ screening: item }, 201);
    }
    if (path.includes("/project-workflow")) return json({ workflow });
    if (path.includes("/unified-evidence")) return json({ workspace: evidence });
    if (path.endsWith("/connectors")) return json(connectorWorkspace);
    if (path.endsWith("/procurement-mappings")) return json(mapping);
    if (path.endsWith("/procurement-diagnosis")) return json(diagnosis);
    if (path.endsWith("/readonly-connectors")) return json(readonlyConnectors);
    if (path.endsWith("/delivery-plan/draft")) return json({ available: false, message: "演示项目尚未提交企业准入自述。" });
    if (path.endsWith("/delivery-plan")) return json({ plan: null, history: [], scopeCatalog: [], alignedWithLatestIntake: true, confirmed: false, latestIntakeVersion: null });
    if (path.endsWith("/delivery")) return json(delivery);
    if (path.endsWith("/connector-project-state")) return json(projectState);
    if (path.endsWith("/procurement-diagnosis/snapshots")) return json({ snapshots: [] });
    if (path.endsWith("/diagnostic-rules")) return json({ rules: [] });
    if (path.includes("/audit")) return json({ events: [], page: { hasMore: false, nextBeforeId: null } });
    if (path.includes("/screening-assessment")) return json({
      label: "待补材料",
      summary: "公开演示模式仅展示工作台结构，不连接真实企业数据。",
      provenance: ["synthetic"],
      gaps: [{ title: "最小样本", detail: "尚未连接真实企业记录。", nextAction: "返回当前项目查看资料采集方式。" }],
      ruleVersion: "demo-rules.v1",
      dimensions: [],
      evidence: { count: 0, refs: [] },
      evidenceStrength: { reason: "演示数据不构成企业事实。" },
      onsiteNecessity: { reason: "是否驻场必须由 FDE 结合真实证据判断。" },
      latest: null,
    });
    if (path.includes("/invitations")) return json({ invitations: [], members: [] });
    if (path.includes("/members")) return json({ members: [] });
    if (path === "/api/auth/logout") return json({ ok: true });
    if (path.startsWith("/api/")) return json({ ok: true, status: "demo", workspace: evidence, workflow });
    return json({ ok: true, mode: "public-demo" });
  };

  window.__fdeDemoMode = true;
  window.__fdeDemoState = { screenings, workflow, evidence };
  window.fetch = mockFetch;
})();
