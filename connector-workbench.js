const SYSTEM_LABELS={erp:'ERP 采购',oa:'OA 审批',finance:'财务付款',wms:'WMS 库存'};
const STATUS_LABELS={draft:'待配置',awaiting_authorization:'待企业授权',connected:'已连接',paused:'已暂停',revoked:'已撤销',failed:'连接失败',pending:'排队中',running:'读取中',accepted:'已验收',quarantined:'已隔离'};
const RUN_STAGE_LABELS={queued:'进入读取队列',validate:'校验字段与授权范围',validation:'校验未通过，批次已隔离',persist:'保存通过校验的记录',complete:'读取完成'};
const DATASET_LABELS={purchase_orders:'采购单',purchase_order_lines:'采购明细',approval_instances:'审批实例',approval_events:'审批节点',invoices:'发票',payables:'应付',payments:'付款',receipts:'收货单',receipt_lines:'收货明细'};
const SOURCE_PURPOSES={erp:'核对采购申请、订单与明细是否完整',oa:'核对审批节点、等待时长和退回记录',finance:'核对发票、应付与付款是否形成依据链',wms:'核对收货、数量与入库记录是否一致'};
const WORKFLOW_PHASE_LABELS={project_created:'项目已建立',awaiting_admission:'等待准入信息',collecting_evidence:'收集诊断材料',evidence_review:'服务方复核材料',awaiting_authorization:'等待系统授权',data_connected:'读取系统数据',batch_validated:'建立跨系统关联',mapping_complete:'运行诊断',diagnosis_generated:'等待企业确认',awaiting_enterprise_confirmation:'等待企业确认',decision_ready:'形成介入决策',intervention_active:'执行介入方案',observing:'验收观察结果',closed:'项目已结项'};
const WORKFLOW_ROLE_LABELS={fde:'FDE 顾问',enterprise_process_owner:'业务流程负责人',enterprise_authorizer:'系统授权人',enterprise_result_reviewer:'结果验收人',enterprise_admin:'企业管理员'};
const SECTION_TASKS={connectors:'authorize_systems',mappings:'map_records',diagnosis:'run_diagnosis',confirmation:'confirm_facts',decision:'record_decision'};
const FIELD_LABELS={po_no:'采购单号',order_no:'采购单号',purchase_order_no:'采购单号',order_date:'采购日期',created_at:'创建时间',updated_at:'更新时间',approved_at:'审批完成时间',submitted_at:'提交时间',paid_at:'付款时间',received_at:'收货时间',stocked_at:'入库时间',supplier_id:'供应商编号',supplier_name:'供应商名称',amount:'金额',total_amount:'总金额',currency:'币种',status:'业务状态',sku:'物料编码',sku_code:'物料编码',quantity:'数量',approved_by:'审批人',applicant:'申请人',reason:'原因',payment_no:'付款单号',invoice_no:'发票号',receipt_no:'收货单号'};
const ISSUE_GROUPS={process:'流程断点与审批控制',settlement:'付款与结算一致性',inventory:'收货与库存交接',data:'数据关联与同步质量'};
const MODE_LABELS={remote_supplement:'远程补充材料',remote_pilot:'远程诊断试点',conditional_onsite:'条件式驻场',onsite_recommended:'需 FDE 决策（不自动驻场）'};
const SNAPSHOT_STAGE_LABELS={fde_decision:'顾问决策已冻结'};
const IMPACTS={approval_lead_time:'审批等待可能拖慢采购执行，应先远程复核具体节点与责任边界。',rejection_reason_missing:'返工原因无法复盘，后续制度或自动化优化缺少可靠依据。',payment_without_approval:'付款与审批证据断开，存在授权、审计和责任追溯风险。',po_changed_after_approval:'审批结论可能不再对应最终执行内容。',stocking_delay:'收货、质检或入库交接可能存在积压。',receipt_quantity_mismatch:'采购与收货数量不一致，需排除分批到货、退货和漏记。',receipt_sku_mismatch:'物料编码无法稳定关联，库存与采购判断可能失真。',invoice_amount_mismatch:'采购、发票和应付金额不一致，付款依据可能不完整。',settlement_incomplete:'采购单未形成完整应付与付款闭环。',standard_payment_before_stock:'标准采购在入库前付款，需核对是否存在获批例外。',prepayment_control_exception:'预付款比例、专项审批或付款时点需要复核。',source_state_conflict:'多个系统对同一采购单状态表达不一致；先处理数据同步，不直接判定业务违规。'};

export function installConnectorWorkbench(host){
  import('./readonly-workbench.js').then(({installReadonlyWorkbench})=>{installReadonlyWorkbench(host);if(host.getActiveView()==='enterprise')host.refreshEnterprise();else host.refreshProject();}).catch(error=>host.showNotice('只读接入模块未加载：'+error.message,'error'));
  import('./readiness-workbench.js').then(({installReadinessWorkbench})=>{installReadinessWorkbench(host);if(host.getActiveView()==='enterprise')host.refreshEnterprise();else host.refreshProject();}).catch(error=>host.showNotice('初筛解释模块未加载：'+error.message,'error'));
  const states=new Map();
  const enterpriseDisclosureState=new Map();
  const validSections=new Set(host.projectSections.map(([key])=>key));
  host.onRenderProject(enhanceProject);
  host.onRenderEnterprise(enhanceEnterprise);
  host.onRenderReports(enhanceReports);
  host.onRenderPrep?.(enhancePrep);
  host.onRenderSettings?.(enhanceSettings);
  if(host.getSelected())refreshActive();

  function current(){
    const enterpriseId=host.getSelected()?.enterpriseId;
    if(!enterpriseId)return null;
    const actor=storedRole(),role=host.getUserRole?.()||actor,key=`${enterpriseId}:${actor}:${role}`;
    if(!states.has(key))states.set(key,{enterpriseId,actor,workspace:null,mapping:null,diagnosis:null,delivery:null,project:null,workflow:null,snapshots:[],rules:[],audit:[],auditPage:{hasMore:false,nextBeforeId:null},auditFilters:{role:'',decision:'',from:'',to:''},loading:false,error:'',busyLabel:'',revision:0,contracts:new Map()});
    return states.get(key);
  }

  function enhanceProject(){
    const selected=host.getSelected();const state=current();if(!selected||!state)return;
    let section=host.getActiveProjectSection();
    if(!validSections.has(section)){section='overview';host.setActiveProjectSection(section);}
    document.querySelector('.stepper')?.remove();
    document.querySelector('.decision-banner')?.remove();
    document.querySelector('.project-header')?.remove();
    const disclosure=document.querySelector('.project-details-disclosure');
    const panel=document.querySelector('#project-stage-panel');if(!panel)return;
    panel.className='connector-project-panel';
    panel.innerHTML=projectMarkup(state,selected,section);
    const shellHead=panel.querySelector('.connector-shell-head');
    if(shellHead){
      const layout=document.createElement('div');layout.className='connector-workspace-layout';
      const content=document.createElement('div');content.className='connector-workspace-content';
      shellHead.after(layout);layout.append(content);
      let node=layout.nextSibling;while(node){const next=node.nextSibling;content.append(node);node=next;}
      disclosure?.remove();
    }
    decorateSectionNavigation(document.querySelector('#diagnostic-subnav-list'),state);
    bindProject(panel,state,section);
    if(!state.workspace&&!state.loading&&!state.error)void loadState(state);
  }

  function enhanceEnterprise(){
    const selected=host.getSelected();const state=current();const root=document.querySelector('#enterprise');
    if(!selected||!state||!root||state.actor!=='enterprise')return;
    const focusedStage=root.querySelector(':scope > .enterprise-connector-panel .enterprise-connector-stage > summary:focus')?.parentElement?.dataset.connectorStage||'';
    root.querySelector(':scope > .enterprise-connector-panel')?.remove();
    const panel=document.createElement('section');panel.className='enterprise-connector-panel connector-shell';
    panel.setAttribute('aria-busy',String(state.loading));
    const pending=state.diagnosis?.summary?.pendingConfirmation||0;
    const decision=state.diagnosis?.latestDecision;
    const outcome=state.diagnosis?.outcome||{};
    const disclosure=(stage,fallback)=>{const key=`${state.enterpriseId}:${host.getUserRole?.()||state.actor}:${stage}`;return {key,controlled:enterpriseDisclosureState.has(key),open:enterpriseDisclosureState.has(key)?enterpriseDisclosureState.get(key):fallback};};
    const authorization=disclosure('authorization',true);
    const confirmation=disclosure('confirmation',Boolean(pending));
    const acceptance=disclosure('acceptance',Boolean(outcome.intervention));
    const workspaceMarkup=state.workspace?`${state.loading?`<div class="connector-inline-loading" role="status">${host.esc(state.busyLabel||'正在同步系统授权状态…')}</div>`:''}<details class="enterprise-connector-stage" data-connector-stage="authorization" data-user-controlled="${authorization.controlled}" ${authorization.open?'open':''}><summary><span>系统数据授权</span><b>${state.workspace.sources.filter(source=>source.status==='connected').length}/${state.workspace.sources.length} 个来源已连接</b></summary>${connectorsMarkup(state)}</details>${state.diagnosis?.issues?.length?`<details class="enterprise-connector-stage" data-connector-stage="confirmation" data-user-controlled="${confirmation.controlled}" ${confirmation.open?'open':''}><summary><span>诊断事实确认</span><b>${pending} 项待确认</b></summary>${confirmationMarkup(state)}</details>`:''}${decision?`<section class="enterprise-shared-decision"><span class="eyebrow">FDE SHARED DECISION</span><h4>服务方当前建议：${host.esc(MODE_LABELS[decision.mode]||decision.mode)}</h4><p>${host.esc(decision.rationale)}</p><small>该建议基于已授权范围与企业确认事实；内部规则、权重和技术标识不会在企业端展示。</small></section><details class="enterprise-connector-stage" data-connector-stage="acceptance" data-user-controlled="${acceptance.controlled}" ${acceptance.open?'open':''}><summary><span>介入结果验收</span><b>${outcome.status==='closed'?'已结项':outcome.metrics?.[0]?.observedValue!==null&&outcome.metrics?.[0]?.observedValue!==undefined?'待企业验收':'等待观察结果'}</b></summary>${executionSectionMarkup('acceptance',state,decision,outcome)}</details>`:''}`:loadingSurface(state.busyLabel||'正在准备系统授权工作区…');
    panel.innerHTML=`<header class="connector-shell-head"><div><span class="eyebrow">SYSTEM ACCESS & FACT CHECK</span><h3>系统授权与诊断确认</h3><p>在企业端完成有限授权、连接来源、事实确认和结果验收；FDE 服务端不能代替企业提交。</p></div>${roleBar(state)}</header>${state.error?`<div class="connector-alert error" role="alert"><strong>操作未完成</strong><span>${host.esc(state.error)}</span><button type="button" data-reload-state>重新读取</button></div>`:''}${workspaceMarkup}`;
    root.append(panel);bindProject(panel,state,'connectors');
    panel.querySelectorAll('.enterprise-connector-stage[data-connector-stage]').forEach(stage=>stage.addEventListener('toggle',()=>{const key=`${state.enterpriseId}:${host.getUserRole?.()||state.actor}:${stage.dataset.connectorStage}`;enterpriseDisclosureState.set(key,stage.open);stage.dataset.userControlled='true';}));
    panel.querySelector('.connector-outcome-form')?.addEventListener('submit',event=>confirmOutcome(state,event));
    if(focusedStage)queueMicrotask(()=>panel.querySelector(`.enterprise-connector-stage[data-connector-stage="${CSS.escape(focusedStage)}"] > summary`)?.focus());
    if(!state.workspace&&!state.loading&&!state.error)void loadState(state);
  }

  function projectMarkup(state,selected,section){
    const projectStatusLabel=state.workflow?.currentTask?.label||WORKFLOW_PHASE_LABELS[state.workflow?.phase]||'正在读取项目状态';
    return `<section class="connector-shell" aria-busy="${state.loading}">
      <header class="connector-shell-head"><div class="connector-project-identity"><span class="eyebrow">${host.esc(selected.industry)} / ${host.esc(selected.flow)}</span><div class="connector-identity-title"><h3>${host.esc(selected.name)}</h3><span>${host.esc(projectStatusLabel)}</span></div><p>${host.esc(selected.summary)}</p><small>通用数据契约：ERP → OA → 财务 → WMS。合成演示，不代表厂商真实接口。</small></div>${roleBar(state)}</header>
      ${state.workflow?workflowTaskSummary(state):'<div class="connector-state-skeleton">正在读取项目状态…</div>'}
      ${state.error?`<div class="connector-alert error" role="alert"><strong>操作未完成</strong><span>${host.esc(state.error)}</span><button type="button" data-reload-state>重新读取</button></div>`:''}
      ${state.loading?`<div class="connector-inline-loading" role="status">${host.esc(state.busyLabel||'正在同步项目状态…')}</div>`:''}
      ${sectionContent(section,state)}
    </section>`;
  }

  function workflowTaskSummary(state){
    const workflow=state.workflow,current=workflow.currentTask||{},section=taskSection(current.key);
    const phase=workflow.phaseLabel||WORKFLOW_PHASE_LABELS[workflow.phase]||workflow.phase;
    const owner=WORKFLOW_ROLE_LABELS[current.ownerRole]||current.ownerRole||'待分配';
    return `<section class="workflow-task-summary" aria-label="当前项目任务"><div><span>当前任务</span><strong>${host.esc(current.label||phase)}</strong></div>${section?`<button type="button" data-section-target="${section}">查看当前步骤 →</button>`:''}</section>`;
  }

  function taskSection(taskKey){
    if(['authorize_systems','read_batches'].includes(taskKey))return 'connectors';
    if(taskKey==='map_records')return 'mappings';
    if(taskKey==='run_diagnosis')return 'diagnosis';
    if(taskKey==='confirm_facts')return 'confirmation';
    if(taskKey==='record_decision')return 'decision';
    return 'overview';
  }

  function sectionGate(section,state){
    const taskKey=SECTION_TASKS[section];
    if(!taskKey||!state.workflow?.tasks)return null;
    const task=state.workflow.tasks.find(item=>item.key===taskKey);
    if(!task||task.status!=='locked')return null;
    const current=state.workflow.currentTask||{};
    return {title:`“${host.esc(sectionLabel(section))}”尚未开放`,description:`当前必须先完成“${host.esc(current.label||'前置任务')}”。这里仅展示后续内容结构，不能执行操作。`};
  }

  function sectionLabel(section){return {connectors:'数据接入',mappings:'批次与映射',diagnosis:'诊断结果',confirmation:'企业确认',decision:'决策记录'}[section]||'当前页面';}

  function decorateSectionNavigation(nav,state){
    nav?.querySelectorAll('[data-project-section]').forEach(button=>{
      const gate=sectionGate(button.dataset.projectSection,state);
      button.classList.toggle('is-future',Boolean(gate));
      if(gate){button.setAttribute('title','前置任务完成后开放');button.setAttribute('aria-description','当前为只读预览');}
      else{button.removeAttribute('title');button.removeAttribute('aria-description');}
    });
  }

  function roleBar(){return '';}

  function sectionContent(section,state){
    if(['delivery-plan','delivery'].includes(section))return '<div data-delivery-mount><p role="status">正在准备方案工作区…</p></div>';
    if(!state.workspace)return `<div class="connector-empty-state"><strong>正在准备诊断项目</strong><span>读取连接器、映射、诊断与报告快照后显示。</span></div>`;
    let content;
    if(section==='overview')content=host.getSelected()?.assessment?.provenance?.some(value=>value==='live'||value==='contract_test')?'<details class="readiness-details"><summary>采购多系统模拟验证（独立于上述只读初筛）</summary>'+overviewMarkup(state)+'</details>':overviewMarkup(state);
    else if(section==='connectors')content=connectorsMarkup(state);
    else if(section==='mappings')content=mappingsMarkup(state);
    else if(section==='diagnosis')content=diagnosisMarkup(state);
    else if(section==='confirmation')content=confirmationMarkup(state);
    else content=decisionMarkup(state);
    const gate=sectionGate(section,state);
    if(!gate)return content;
    return `<section class="project-section-gate" role="status"><div><strong>${gate.title}</strong><span>${gate.description}</span></div><button type="button" data-section-target="overview">返回当前任务</button></section><div class="project-readonly-preview" inert aria-disabled="true">${content}</div>`;
  }

  function overviewMarkup(state){
    const w=state.workspace,m=state.mapping,d=state.diagnosis;
    const issues=d?.summary?.triggered??d?.summary?.issues??0;
    const pending=d?.summary?.pendingConfirmation||0;
    const next=overviewNext(state);
    const company=host.getSelected(),intake=state.workflow?.history?.intakes?.find(x=>x.tier==='tier0');
    return `<section class="connector-overview"><section class="project-brief"><span class="eyebrow">本企业诊断范围</span><h4>${host.esc(company?.flow||"目标流程待确认")}</h4><dl><div><dt>企业诉求</dt><dd>${host.esc(intake?.payload?.painPoints||company?.questionnaire?.answers?.painPoints||"尚未取得可展示的企业诉求，请查看企业提交资料")}</dd></div><div><dt>本轮材料</dt><dd>${state.workflow?.evidence?.files?.length||0} 份文件 · ${w.readiness.sourceRecords||0} 条系统记录（不等于采购笔数）</dd></div><div><dt>最近准入提交</dt><dd>${state.workflow?.tier0?`V${state.workflow.tier0.version} · ${host.esc(formatTime(state.workflow.tier0.created_at))}`:"尚未提交"}</dd></div></dl></section><div class="connector-overview-metrics"><article><span>数据集验收</span><strong>${w.readiness.acceptedDatasets}/${w.readiness.totalDatasets}</strong><small>${w.readiness.sourceRecords||0} 条来源记录</small></article><article><span>映射覆盖</span><strong>${m?.coverage||0}%</strong><small>${m?.counts?.pending||0} 个候选 · ${m?.counts?.gap||0} 个缺口</small></article><article><span>问题候选</span><strong>${issues}</strong><small>${pending} 项待企业确认</small></article><article><span>报告快照</span><strong>${state.snapshots.length}</strong><small>决策时冻结批次、映射与规则版本</small></article></div>
      <div class="connector-overview-grid"><article class="connector-next-card"><span class="eyebrow">NEXT REQUIRED ACTION</span><h4>${host.esc(next.title)}</h4><p>${host.esc(next.description)}</p><button type="button" class="primary-button" ${next.view?`data-view-target="${host.esc(next.view)}"`:`data-section-target="${host.esc(next.section)}"`}>${host.esc(next.button)} →</button></article><details class="connector-boundary-card"><summary>判断边界与数据使用原则</summary><ul><li>隔离批次不进入映射、诊断或评分</li><li>候选映射不能自动升级为正式事实</li><li>企业确认与 FDE 结论分别留痕</li><li>合成结果不代表真实企业事实或 ROI</li></ul></details></div>
      ${state.project?.history?.length?`<section class="connector-history"><div><span class="eyebrow">STATE HISTORY</span><h4>最近状态变化</h4></div><ol>${state.project.history.slice(0,6).map(item=>`<li><span>${host.esc(WORKFLOW_PHASE_LABELS[item.toStatus]||item.toStatus)}</span><small>${host.esc(formatTime(item.createdAt))} · ${host.esc(item.reason)}</small></li>`).join('')}</ol></section>`:''}</section>`;
  }

  function overviewNext(state){
    const status=state.project?.status;
    if(status==='decision_ready'&&state.diagnosis?.latestDecision?.mode==='remote_supplement')return {title:'决策已记录，继续远程补证',description:'无需进入介入执行。请企业提交新资料后重新核验，旧报告继续保留。',section:'decision',button:'查看已记录决策'};
    if(status==='decision_ready'&&state.diagnosis?.latestDecision&&!state.diagnosis?.diagnosisVersion?.revisionRequired)return {title:'决策已冻结，待建立介入方案',description:'当前报告快照与企业确认事实已固定；下一步是在“介入与验证”建立任务、指标和验收条件。',view:'prep',button:'进入介入与验证'};
    if(status==='awaiting_authorization')return {title:'完成企业授权和来源连接',description:'逐个来源审阅数据集、字段、时间范围、用途和保留期限；预览后才能提交授权。',section:'connectors',button:'进入数据接入'};
    if(status==='data_connected')return {title:'读取并校验全部数据集',description:'FDE 分来源发起读取；失败或越权记录会隔离，并保留上一批已接受数据。',section:'connectors',button:'继续数据接入'};
    if(status==='batch_validated')return {title:'建立跨系统映射',description:'先处理待确认候选、缺口和状态冲突，映射覆盖完成后才开放正式诊断。',section:'mappings',button:'进入批次与映射'};
    if(status==='mapping_complete')return {title:'运行版本化诊断规则',description:'规则只读取已确认映射，并分别输出事实、数据冲突和无法计算项。',section:'diagnosis',button:'进入诊断结果'};
    if(status==='diagnosis_generated'||status==='awaiting_enterprise_confirmation')return {title:'由企业逐项确认事实或例外',description:'FDE 不能代替企业确认；驳回会将证据退回补证状态。',section:'confirmation',button:'进入企业确认'};
    if(status==='decision_ready')return {title:'由 FDE 形成介入决策',description:'三维评分只提供解释依据，顾问必须独立选择路径并填写理由。',section:'decision',button:'进入决策记录'};
    return {title:'进入介入与验证及结果观察',description:'决策已经冻结为报告快照，后续在“介入与验证”记录任务、指标和企业验收。',section:'decision',button:'查看决策'};
  }

  function connectorsMarkup(state){
    const sources=state.workspace.sources||[];
    const connected=sources.filter(source=>source.status==='connected').length;
    const unread=sources.filter(source=>source.status==='connected'&&!source.recordCount).length;
    const admissionReady=!['project_created','awaiting_admission'].includes(state.workflow?.phase);
    const handedOff=state.project?.handoff?.status==='submitted';
    const progressNote=state.actor==='enterprise'?(handedOff?'已提交服务方；授权范围变化后需要重新提交。':'全部连接后提交服务方；可随时撤销单个来源。'):connected<sources.length?`等待企业完成 ${sources.length-connected} 个来源的授权与连接。`:!handedOff?'等待企业提交已授权来源。':unread?`${unread} 个来源等待读取，其余可单独重试。`:'全部已授权来源已读取。';
    const emptyNote=state.actor==='fde'?'先初始化本项目需要的通用只读来源；随后由企业逐来源确认范围。':'请等待 FDE 配置本项目的数据来源；无需重复上传系统名称。';
    const primary=state.actor==='enterprise'&&canAuthorize()&&admissionReady&&sources.length&&connected<sources.length?'<button type="button" class="primary-button" data-authorization-plan>配置授权计划</button>':state.actor==='enterprise'&&canAuthorize()&&admissionReady&&sources.length&&connected===sources.length&&!handedOff?'<button type="button" class="primary-button" data-submit-sources>提交服务方开始诊断</button>':state.actor==='enterprise'&&handedOff?'<span class="role-lock">已提交服务方</span>':state.actor==='fde'&&unread&&handedOff?`<button type="button" class="primary-button" data-read-all-sources>读取全部已授权来源（${unread}）</button>`:!sources.length&&state.actor==='fde'?'<button type="button" class="primary-button" data-setup-connectors>初始化通用来源</button>':'';
    return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">DATA ACCESS</span><h4>系统只读接入</h4><p>企业确认范围并提交授权结果 → FDE读取并校验 → 可用数据进入诊断。授权不等于已读取；文件材料使用独立上传入口。</p></div>${primary}</div>
      ${state.actor==='enterprise'&&!admissionReady?'<div class="connector-alert warning" role="status"><strong>请先完成准入自述</strong><span>授权范围需要引用企业基本盘和目标流程；保存准入信息后，本页会自动开放授权计划。</span></div>':''}
      ${state.actor==='fde'&&connected===sources.length&&unread&&!handedOff?'<div class="connector-alert warning" role="status"><strong>等待企业提交授权结果</strong><span>来源虽已连接，但尚未完成企业到服务方的显式交接；提交前 FDE 不能读取。</span></div>':''}
      ${sources.length?`<div class="connector-progress-strip" role="status"><span>授权与连接进度</span><strong>${connected}/${sources.length}</strong><small>${host.esc(progressNote)}</small></div><div class="connector-source-grid">${sources.map(source=>sourceCard(source,state)).join('')}</div>`:`<div class="connector-empty-state"><strong>尚未配置数据来源</strong><span>${host.esc(emptyNote)}</span></div>`}</section>`;
  }

  function sourceCard(source,state){
    const latest=[...(source.latestRuns||[])].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    const needsReview=!source.authorization||!source.authorization.previewId||source.authorization.status!=='limited';
    const tone=source.status==='connected'?'good':source.status==='revoked'||source.status==='failed'?'bad':source.status==='paused'?'warn':'neutral';
    const actions=[];
    actions.push(`<button type="button" data-contract="${host.esc(source.id)}">查看契约</button>`);
    if(state.actor==='enterprise'&&canAuthorize()&&source.status!=='revoked'&&needsReview)actions.push(`<button type="button" data-authorize-source="${host.esc(source.id)}">单独调整范围</button>`);
    if(state.actor==='enterprise'&&canAuthorize()&&!needsReview&&!['connected','revoked'].includes(source.status))actions.push(`<button type="button" class="primary" data-source-action="connect" data-source-id="${host.esc(source.id)}">连接来源</button>`);
    if(source.status==='connected'&&!needsReview)actions.push(`<button type="button" data-source-preview="${host.esc(source.id)}">预览样本</button>`);
    if(state.actor==='fde'&&source.status==='connected'&&!needsReview&&state.project?.handoff?.status==='submitted')actions.push(`<button type="button" class="${source.recordCount?'':'primary'}" data-source-read="${host.esc(source.id)}">${source.recordCount?'重新读取该来源':'读取并校验'}</button><button type="button" data-source-action="pause" data-source-id="${host.esc(source.id)}">暂停</button>`);
    if(state.actor==='enterprise'&&canAuthorize()&&source.status==='paused')actions.push(`<button type="button" data-source-action="connect" data-source-id="${host.esc(source.id)}">恢复连接</button>`);
    if(state.actor==='enterprise'&&canAuthorize()&&source.authorization&&source.status!=='revoked')actions.push(`<button type="button" class="danger" data-source-action="revoke" data-source-id="${host.esc(source.id)}">撤销授权</button>`);
    if(state.actor==='fde'&&latest&&['quarantined','failed'].includes(latest.status))actions.push(`<button type="button" class="danger" data-run-retry="${host.esc(latest.id)}">重试失败批次</button>`);
    if(latest)actions.push(`<button type="button" data-run-history="${host.esc(latest.id)}">批次历史</button>`);
    const statusLabel=needsReview&&source.status==='connected'?'续读需重新审阅':source.status==='awaiting_authorization'&&!needsReview?'已授权待连接':STATUS_LABELS[source.status]||source.status;
    const activity=Boolean(source.authorization||source.recordCount||latest);
    const facts=activity?`<dl class="connector-source-facts"><div><dt>授权数据集</dt><dd>${source.authorization?.datasets?.length||0}/${source.datasets.length}</dd></div><div><dt>记录数</dt><dd>${source.recordCount||0}</dd></div><div><dt>最近批次</dt><dd>${host.esc(latest?STATUS_LABELS[latest.status]||latest.status:'尚无')}</dd></div><div><dt>最近读取</dt><dd>${host.esc(latest?formatTime(latest.completedAt||latest.createdAt):'尚无')}</dd></div></dl>`:`<div class="connector-source-empty-facts"><span>计划读取</span><strong>${source.datasets.map(name=>DATASET_LABELS[name]||name).join('、')}</strong><small>企业确认范围前不会读取任何记录</small></div>`;
    return `<article class="connector-source-card" data-source-card="${host.esc(source.id)}" data-record-count="${source.recordCount||0}" aria-label="${host.esc(SYSTEM_LABELS[source.systemType]||source.displayName)}"><div class="connector-source-head"><span class="connector-source-symbol">${source.systemType.toUpperCase()}</span><div><h5>${host.esc(SYSTEM_LABELS[source.systemType]||source.displayName)}</h5><small>${host.esc(SOURCE_PURPOSES[source.systemType]||'核对本系统可用于诊断的业务记录')}</small></div><em class="${tone}">${host.esc(statusLabel)}</em></div>
      <p class="source-identity">${host.esc(source.displayName)} · 合成契约环境</p>${facts}<div class="connector-dataset-list" aria-label="所需数据范围">${source.datasets.map(name=>`<span>${host.esc(DATASET_LABELS[name]||name)}</span>`).join('')}</div><div class="connector-source-actions">${actions.join('')}</div></article>`;
  }

  function mappingsMarkup(state){
    const mapping=state.mapping;const records=state.workspace.readiness.sourceRecords||0;
    if(!records)return gateMarkup('尚无已验收来源记录','先在“数据接入”完成来源读取；隔离批次不会进入映射。','connectors','返回数据接入');
    const open=(mapping?.candidates||[]).filter(item=>['pending','gap'].includes(item.status));
    return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">BATCH & MAPPING</span><h4>批次与跨系统映射</h4><p>精确采购单引用自动确认；供应商＋金额＋日期只能形成企业待确认候选。</p></div>${state.actor==='fde'?'<button type="button" class="primary-button" data-run-mapping>运行映射</button>':'<span class="role-lock">企业只确认候选，不运行映射器</span>'}</div>
      <div class="mapping-metrics"><article><span>来源记录</span><strong>${mapping.totalRecords}</strong></article><article><span>已确认映射</span><strong>${mapping.confirmedMappings}</strong></article><article><span>覆盖率</span><strong>${mapping.coverage}%</strong></article><article><span>待处理</span><strong>${(mapping.counts.pending||0)+(mapping.counts.gap||0)}</strong></article></div>
      ${mapping.dataConflicts?.length?`<section class="data-conflict-list"><div><span class="eyebrow">DATA CONFLICTS</span><h5>来源状态冲突</h5><p>先作为数据同步或责任边界问题，不直接判定业务违规。</p></div>${mapping.dataConflicts.map(item=>`<article><strong>${host.esc(item.poNo||'未关联采购单')}</strong><span>${host.esc(item.message)}</span></article>`).join('')}</section>`:''}
      <section class="mapping-worklist"><div class="mapping-worklist-head"><h5>候选与缺口</h5><span>${open.length} 项待处理</span></div>${open.length?open.map(item=>mappingCandidate(item,state)).join(''):`<div class="connector-empty-state compact"><strong>${mapping.ready?'映射覆盖已完成':'尚未运行映射'}</strong><span>${mapping.ready?'全部来源记录均有可解释的确认映射，可以进入诊断。':'由 FDE 运行映射后，这里会显示候选、缺口和冲突。'}</span></div>`}</section>
      ${evidenceTable(state.diagnosis?.sourceEvidence||[],state.diagnosis?.sourceEvidenceTotal)}${mapping.ready?`<div class="connector-success-strip"><strong>诊断前置门已通过</strong><span>${mapping.confirmedMappings}/${mapping.totalRecords} 条记录完成确认映射。</span><button type="button" data-section-target="diagnosis">进入诊断结果 →</button></div>`:''}</section>`;
  }

  function evidenceTable(rows=[],total=rows.length){return `<details class="source-evidence"><summary>查看来源记录（${rows.length}/${total??rows.length}）</summary><p>按系统与数据集追溯，不把记录条数当采购笔数。最多展示前200条；问题引用单独列出。</p><div class="evidence-scroll"><table><thead><tr><th>来源 / 数据集</th><th>业务主键 / 采购单</th><th>读取批次</th><th>源更新时间</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${host.esc(row.sourceName||SYSTEM_LABELS[row.systemType]||'来源待确认')}<small>${host.esc(DATASET_LABELS[row.dataset]||row.dataset)}</small></td><td>${host.esc(row.primaryKey)}<small>${host.esc(row.poNo||'尚未关联采购单')} · 记录 #${host.esc(row.id)}</small></td><td><button type="button" data-run-history="${host.esc(row.runId)}">查看批次</button><small>${host.esc(row.runId)}</small></td><td>${host.esc(formatTime(row.updatedAt))}</td></tr>`).join('')||'<tr><td colspan="4">当前没有可用的来源记录。</td></tr>'}</tbody></table></div></details>`;}

  function mappingCandidate(item,state){
    const summary=Object.entries(item.payload||{}).slice(0,4).map(([key,value])=>`${key}: ${value}`).join(' · ');
    const controls=item.status==='pending'&&state.actor==='enterprise'&&canProcess()?`<div class="mapping-actions"><button type="button" class="primary" data-mapping-decision="confirmed" data-candidate-id="${item.id}">确认关联 ${host.esc(item.candidatePoNo)}</button><button type="button" data-mapping-decision="rejected" data-candidate-id="${item.id}">不是该采购单</button></div>`:'';
    return `<article class="mapping-candidate ${item.status}"><div><span>${host.esc(DATASET_LABELS[item.dataset]||item.dataset)} · ${host.esc(item.namespace)}</span><strong>${host.esc(item.sourcePrimaryKey)}</strong><small>${host.esc(summary)}</small></div><div><span>${item.status==='gap'?'映射缺口':'候选采购单'}</span><strong>${host.esc(item.candidatePoNo||'无安全候选')}</strong><small>${host.esc(item.reason)}</small></div>${controls||`<em>${state.actor==='fde'?'等待企业处理':'需要补充采购单引用'}</em>`}</article>`;
  }

  function diagnosisMarkup(state){
    const report=state.diagnosis;
    const hasDiagnosis=Boolean(report?.diagnosisVersion?.active);
    if(!hasDiagnosis){
      const invalid=report?.evidenceValidity&&!report.evidenceValidity.ready;
      const stale=Boolean(report?.diagnosisVersion?.revisionRequired);
      const title=invalid?'当前授权或读取批次已失效':stale?'当前诊断版本待重跑':'诊断尚未运行';
      const description=invalid?'旧诊断只保留在历史版本中。请先恢复全部来源授权并重新读取，再运行诊断。':stale?'当前来源已具备条件，可运行规则生成新版本；旧版本不会被覆盖。':'规则结果、证据状态和评分会在运行后显示。';
      return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">DETERMINISTIC DIAGNOSIS</span><h4>版本化规则诊断</h4><p>只有当前授权、读取批次和映射均有效，才能生成正式问题候选。</p></div>${state.actor==='fde'?`<button type="button" class="primary-button" data-run-diagnosis ${state.mapping?.ready&&!invalid?'':'disabled'}>运行诊断</button>`:'<span class="role-lock">等待 FDE 运行规则</span>'}</div>${gateMarkup(title,description,invalid?'connectors':'mappings',invalid?'恢复数据接入':'查看映射依据')}</section>`;
    }
    if(state.actor==='enterprise')return enterpriseIssueList(report,'诊断结果为企业可读投影；规则权重、阈值和内部优先级不会下发到企业端。',!canProcess());
    const d=report.dimensions;
    const version=report.diagnosisVersion?.current;
    return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">DETERMINISTIC DIAGNOSIS / ${host.esc(report.ruleVersion)}</span><h4>可追溯诊断结果</h4><p>每个问题连接来源记录、确认映射、规则版本、合法例外与证据等级。</p></div><div class="connector-version-action"><span>诊断 V${version?.version||1} · ${version?.status==='revision_required'?'待补证重跑':'当前有效版'}</span><button type="button" data-run-diagnosis>运行诊断</button></div></div>
      ${report.diagnosisVersion?.revisionRequired?'<div class="connector-alert warning" role="status"><strong>当前版本已进入补证重跑</strong><span>企业选择了部分确认、需要补充或不成立。完成补证或修正映射后运行诊断，旧版本继续保留。</span></div>':''}
      ${groupedFdeIssues(report.issues)}<details class="diagnosis-method"><summary>数据质量、计算依据与系统建议（不是FDE最终决策）</summary>${dimensionsMarkup([d.dataReadiness,d.evidenceStrength,d.onsiteNecessity])}
      <div class="diagnosis-advisory"><span>系统建议（不自动决策）</span><strong>${host.esc(MODE_LABELS[d.recommendedMode]||d.recommendedMode)}</strong><small>${host.esc(d.dataReadiness.formula||d.onsiteNecessity.basis||'评分依据可展开核对')}</small></div></details>
      </section>`;
  }

  function dimensionCard(item){
    const pending=item.value===null||item.value===undefined;
    const value=pending?'待补样本':`${item.value}/100`;
    const rows=item.items||item.factors||[];
    return `<article class="${pending?'is-pending':''}"><span>${host.esc(item.label)}</span><strong>${host.esc(value)}</strong>${pending?'':`<p>${host.esc(item.basis||item.formula||'按可计算因素解释')}</p>`}${rows.length?`<details><summary>查看计算依据</summary>${rows.map(row=>`<div><span>${host.esc(row.label)}</span><b>${row.value===null?'未知':`${row.value}`}${row.weight?` · 权重 ${Math.round(row.weight*100)}%`:''}</b><small>${host.esc(row.basis||'')}</small></div>`).join('')}</details>`:''}</article>`;
  }
  function dimensionsMarkup(items=[]){
    const pending=items.filter(item=>item.value===null||item.value===undefined);
    return `${pending.length?`<div class="connector-empty-state compact diagnosis-dimensions-notice" role="status"><strong>${pending.length} 项判断待补样本</strong><span>当前样本不足，暂不计算对应指标；展开各卡片可查看计算依据。</span></div>`:''}<div class="connector-dimensions">${items.map(dimensionCard).join('')}</div>`;
  }

  function fdeIssue(issue,index){
    const override=issue.override;
    return `<details class="connector-issue"><summary><span class="connector-issue-number">${index+1}</span><div><b>${host.esc(issue.title)}</b><small>${host.esc(issue.poNo)} · ${host.esc(issue.observed)}</small></div><em class="severity-${issue.severity}">${severityLabel(issue.severity)}</em><span class="evidence-state">${host.esc(evidenceLabel(issue.evidenceState?.state))}</span></summary><div class="connector-issue-body"><dl><div><dt>规则与版本</dt><dd>${host.esc(issue.ruleId)} · ${host.esc(issue.ruleVersion)}</dd></div><div><dt>输入与前置条件</dt><dd>${host.esc(issue.contract.inputs.join('、'))}；${host.esc(issue.contract.preconditions)}</dd></div><div><dt>计算与阈值来源</dt><dd>${host.esc(issue.contract.calculation)}；${host.esc(issue.contract.thresholdSource)}</dd></div><div><dt>证据血缘</dt><dd>${evidenceTable(issue.evidence||[])}</dd></div><div><dt>合法例外</dt><dd>${host.esc(issue.legalExceptions.join('、'))}</dd></div><div><dt>业务影响</dt><dd>${host.esc(IMPACTS[issue.ruleId]||'需结合企业流程负责人说明判断实际影响。')}</dd></div></dl>${override?`<div class="override-record"><strong>${host.esc(override.priority)} · ${host.esc(override.disposition)}</strong><span>${host.esc(override.reason)}</span></div>`:`<form class="fde-override-form" data-override-issue="${issue.id}"><label>内部优先级<select name="priority"><option>P0</option><option selected>P1</option><option>P2</option><option>P3</option></select></label><label>覆核结论<select name="disposition"><option value="accepted">采纳规则结果</option><option value="deprioritized">降低优先级</option><option value="rejected">否决规则结果</option></select></label><label class="wide">理由<textarea name="reason" minlength="8" maxlength="500" required placeholder="至少 8 个字；必须保留独立业务判断依据"></textarea></label><button type="submit">记录 FDE 覆核</button></form>`}</div></details>`;
  }

  function issueGroup(issue){
    if(['payment_without_approval','po_changed_after_approval','approval_lead_time','rejection_reason_missing'].includes(issue.ruleId))return 'process';
    if(['invoice_amount_mismatch','settlement_incomplete','standard_payment_before_stock','prepayment_control_exception'].includes(issue.ruleId))return 'settlement';
    if(['stocking_delay','receipt_quantity_mismatch','receipt_sku_mismatch'].includes(issue.ruleId))return 'inventory';
    return 'data';
  }

  function groupedFdeIssues(issues=[]){
    const ranked=[...issues].sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.severity]-({critical:0,high:1,medium:2,low:3}[b.severity])));
    const top=ranked.slice(0,3),rest=ranked.slice(3);
    const groups=Object.entries(ISSUE_GROUPS).map(([key,label])=>{const rows=rest.filter(issue=>issueGroup(issue)===key);if(!rows.length)return '';const pending=rows.filter(issue=>!issue.override);return `<details class="diagnosis-root-group"><summary><span>${host.esc(label)}</span><b>${rows.length} 项</b></summary>${pending.length>1?`<form class="bulk-override-form" data-bulk-override="${key}"><label>同类处理<select name="disposition"><option value="accepted">采纳规则结果</option><option value="deprioritized">降低优先级</option><option value="rejected">否决规则结果</option></select></label><label>优先级<select name="priority"><option>P0</option><option selected>P1</option><option>P2</option><option>P3</option></select></label><label class="wide">统一审计理由<input name="reason" minlength="8" required placeholder="仅用于同类问题，至少 8 个字"></label><button type="submit">批量记录 ${pending.length} 项</button></form>`:''}<div class="connector-issue-list">${rows.map(issue=>fdeIssue(issue,issues.indexOf(issue))).join('')}</div></details>`;}).join('');
    return `<section class="diagnosis-priority"><header><div><span class="eyebrow">TOP FINDINGS</span><h5>${top.length?`优先复核的 ${top.length} 个问题`:'本轮未发现规则命中'}</h5></div><small>${top.length?'按规则严重程度排序；不代表损失金额，其他发现按业务类别分组':'仅限本次样本与规则范围，不代表全部业务无风险'}</small></header><div class="connector-issue-list">${top.map(issue=>fdeIssue(issue,issues.indexOf(issue))).join('')}</div></section>${groups}`;
  }

  function confirmationMarkup(state){
    const report=state.diagnosis;const count=report?.summary?.triggered??report?.summary?.issues??0;
    if(!count)return report?.diagnosisVersion?.active?gateMarkup('本轮无待确认异常','诊断已运行，未发现规则命中；不是对全部业务无风险的保证，无需制造异常确认。','decision','前往 FDE 决策记录'):gateMarkup('尚未生成诊断','先完成映射并由 FDE 运行诊断。','diagnosis','查看诊断结果');
    if(state.actor!=='enterprise')return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">ENTERPRISE CONFIRMATION</span><h4>企业事实核对</h4><p>FDE在这里查看企业回复及争议。企业确认事实不等于批准合作，FDE不能代替企业提交。</p></div><span class="role-lock">${report.summary.pendingConfirmation||0} 项待企业处理</span></div>${enterpriseIssueList(report,'由企业成员在独立企业端核对本版事实；这不是签约审批。对争议先补充证据，再重新诊断。',true)}</section>`;
    return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">ENTERPRISE CONFIRMATION</span><h4>逐项确认事实与例外</h4><p>确认属实会升级为“已验证事实”；不成立会退回补证；例外必须填写依据。</p></div><span>${report.summary.pendingConfirmation||0} 项待处理</span></div>${enterpriseIssueList(report,canProcess()?'企业确认不会自动形成驻场决定。':'当前岗位仅可查看；请由业务流程负责人完成确认。',!canProcess())}</section>`;
  }

  function enterpriseIssueList(report,note,readOnly=false){
    const issues=report.issues||[];
    const card=(issue,index)=>{const confirmation=issue.confirmation;const sourceTypes=issue.evidenceSummary?.sourceTypes||issue.sourceTypes||[];return `<article class="enterprise-issue-card"><div class="enterprise-issue-head"><span>${index+1}</span><div><h5>${host.esc(issue.title)}</h5><small>${host.esc(issue.poNo||'采购案例')} · ${host.esc(issue.observed)}</small></div><em>${severityLabel(issue.severity)}</em></div><dl><div><dt>为什么需要确认</dt><dd>${host.esc(IMPACTS[issue.ruleId]||'该信号会影响后续远程诊断或介入路径。')}</dd></div><div><dt>证据摘要</dt><dd>${issue.evidenceSummary?`${issue.evidenceSummary.recordCount} 条记录 · ${sourceTypes.map(type=>SYSTEM_LABELS[type]||type).join('、')}`:`${issue.evidenceRefs?.length||0} 条来源记录`}</dd></div><div><dt>可排除例外</dt><dd>${host.esc((issue.legalExceptions||[]).join('、')||'暂无')}</dd></div></dl>${confirmation?`<div class="confirmation-record"><strong>${confirmationLabel(confirmation.decision)}</strong><span>${host.esc(confirmation.note||'企业已完成复核')}</span></div>`:readOnly?'<div class="confirmation-wait">等待企业确认</div>':`<form class="connector-confirm-form" data-confirm-issue="${issue.id}"><label>确认结果<select name="decision"><option value="confirmed">确认属实</option><option value="partially_confirmed">部分属实，补证后重跑</option><option value="needs_supplement">目前无法判断，需要补充</option><option value="rejected">不成立，退回补证</option><option value="exception">属于已批准例外</option></select></label><label>说明<input name="note" maxlength="240" placeholder="除确认属实外，至少填写 4 个字"></label><button type="submit" class="primary-button">提交本项确认</button></form>`}</article>`};
    const ranked=[...issues].sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.severity]-({critical:0,high:1,medium:2,low:3}[b.severity]))),top=ranked.slice(0,3),rest=ranked.slice(3);
    const grouped=Object.entries(ISSUE_GROUPS).map(([key,label])=>{const rows=rest.filter(issue=>issueGroup(issue)===key);return rows.length?`<details class="diagnosis-root-group"><summary><span>${host.esc(label)}</span><b>${rows.length} 项</b></summary>${rows.map(issue=>card(issue,issues.indexOf(issue))).join('')}</details>`:''}).join('');
    return `<section class="enterprise-issue-board"><p class="connector-context-note">${host.esc(note)}</p><div class="enterprise-issue-top">${top.map(issue=>card(issue,issues.indexOf(issue))).join('')}</div>${grouped}</section>`;
  }

  function decisionMarkup(state){
    const report=state.diagnosis;const count=report?.summary?.triggered??report?.summary?.issues??0;
    if(!report?.diagnosisVersion?.active)return gateMarkup('尚无决策依据','必须先完成映射、诊断和企业事实确认。','diagnosis','查看诊断结果');
    const pending=report.summary.pendingConfirmation||0;const decision=report.latestDecision;
    if(state.actor==='enterprise')return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">DECISION RECORD</span><h4>服务方决策记录</h4><p>企业可查看最终路径和理由，但不会收到内部规则权重、优先级或故障控制。</p></div></div>${decision?decisionRecord(decision):gateMarkup('等待 FDE 决策',pending?`仍有 ${pending} 项事实待企业完成确认。`:'企业确认已完成，等待 FDE 独立判断。','confirmation','查看确认状态')}${snapshotList(state)}</section>`;
    const dimensions=report.dimensions;
    const revisionRequired=Boolean(report.diagnosisVersion?.revisionRequired);
    return `<section class="connector-section"><div class="connector-section-head"><div><span class="eyebrow">FDE DECISION</span><h4>介入路径与不可变快照</h4><p>这里展示证据准备度与待判断条件，不合成总分，也不自动批准驻场；顾问决定必须填写独立理由。</p></div></div>${dimensions?`<div class="decision-score-strip"><span>数据准备度 <b>${dimensions.dataReadiness.value??'未知'}</b></span><span>证据强度 <b>${dimensions.evidenceStrength.value??'未知'}</b></span><span>驻场必要性 <b>待 FDE 判断</b></span></div>`:''}${decision?decisionRecord(decision):revisionRequired?gateMarkup('决策尚未开放','企业反馈已触发补证重跑；必须形成新的有效诊断版本。','diagnosis','返回诊断重跑'):pending?gateMarkup('决策尚未开放',`还有 ${pending} 项问题等待企业逐项确认。`,'confirmation','查看企业确认'):`<form class="connector-decision-form"><label>介入方式<select name="mode">${Object.entries(MODE_LABELS).map(([value,label])=>`<option value="${value}" ${value===dimensions?.recommendedMode?'selected':''}>${label}</option>`).join('')}</select></label><label class="wide">顾问独立依据<textarea name="rationale" minlength="8" maxlength="500" required placeholder="请说明依据哪些事实选择此路径、限制与下一步。至少8个字。"></textarea></label><button type="submit" class="primary-button">记录决策并冻结报告快照</button></form>`}${snapshotList(state)}</section>`;
  }

  function decisionRecord(decision){return `<article class="connector-decision-record"><span class="eyebrow">RECORDED DECISION</span><h5>${host.esc(MODE_LABELS[decision.mode]||decision.mode)}</h5><p>${host.esc(decision.rationale)}</p><small>${host.esc(formatTime(decision.createdAt))}${decision.snapshotId?' · 已生成不可变报告版本':''}</small></article>`;}
  function snapshotList(state){return `<section class="snapshot-list"><div><h5>历史报告快照</h5><span>${state.snapshots.length} 个不可变版本</span></div>${state.snapshots.length?state.snapshots.map(item=>{const detail=state.actor==='enterprise'?`${confirmationProgress(item.confirmationSummary)} · 已冻结共享事实`:item.mappingSummary?`映射 ${item.mappingSummary.coverage}%`:'映射状态未记录';return `<button type="button" data-snapshot-id="${item.id}"><span>V${item.version} · ${host.esc(SNAPSHOT_STAGE_LABELS[item.stage]||'报告快照')}</span><small>${host.esc(formatTime(item.createdAt))} · ${host.esc(detail)}</small></button>`;}).join(''):'<p>首次记录 FDE 决策时生成快照。</p>'}</section>`;}

  function gateMarkup(title,description,section,button){return `<div class="connector-gate"><strong>${host.esc(title)}</strong><span>${host.esc(description)}</span>${section?`<button type="button" data-section-target="${section}">${host.esc(button)} →</button>`:''}</div>`;}

  function bindProject(panel,state){
    panel.querySelectorAll('[data-section-target]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.sectionTarget)));
    panel.querySelectorAll('[data-view-target]').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.viewTarget)));
    panel.querySelector('[data-reload-state]')?.addEventListener('click',()=>loadState(state,true));
    panel.querySelector('[data-setup-connectors]')?.addEventListener('click',()=>withBusy(state,()=>api(state,'/connectors/setup',{method:'POST',body:{},role:'fde'}),'正在初始化四个通用连接器…'));
    panel.querySelector('[data-authorization-plan]')?.addEventListener('click',()=>showAuthorizationPlan(state));
    panel.querySelector('[data-submit-sources]')?.addEventListener('click',()=>submitSourcesToFde(state));
    panel.querySelector('[data-read-all-sources]')?.addEventListener('click',()=>readAllSources(state));
    panel.querySelectorAll('[data-contract]').forEach(button=>button.addEventListener('click',()=>showContract(state,button.dataset.contract)));
    panel.querySelectorAll('[data-authorize-source]').forEach(button=>button.addEventListener('click',()=>showAuthorization(state,button.dataset.authorizeSource)));
    panel.querySelectorAll('[data-source-preview]').forEach(button=>button.addEventListener('click',()=>showSourcePreview(state,button.dataset.sourcePreview)));
    panel.querySelectorAll('[data-source-read]').forEach(button=>button.addEventListener('click',()=>readSource(state,button.dataset.sourceRead)));
    panel.querySelectorAll('[data-source-action]').forEach(button=>button.addEventListener('click',()=>sourceAction(state,button.dataset.sourceAction,button.dataset.sourceId)));
    panel.querySelectorAll('[data-run-retry]').forEach(button=>button.addEventListener('click',()=>retryRun(state,button.dataset.runRetry)));
    panel.querySelectorAll('[data-run-history]').forEach(button=>button.addEventListener('click',()=>showRunHistory(state,button.dataset.runHistory)));
    panel.querySelector('[data-run-mapping]')?.addEventListener('click',()=>withBusy(state,()=>api(state,'/procurement-mappings/run',{method:'POST',body:{},role:'fde'}),'正在建立确定性映射与候选…'));
    panel.querySelectorAll('[data-mapping-decision]').forEach(button=>button.addEventListener('click',()=>confirmMapping(state,button.dataset.candidateId,button.dataset.mappingDecision)));
    panel.querySelectorAll('[data-run-diagnosis]').forEach(button=>button.addEventListener('click',()=>withBusy(state,()=>api(state,'/procurement-diagnosis/run',{method:'POST',body:{},role:'fde'}),'正在运行版本化诊断规则…')));
    panel.querySelectorAll('[data-confirm-issue],[data-override-issue],[data-bulk-override]').forEach(form=>{const version=document.createElement('input');version.type='hidden';version.name='diagnosisVersion';version.value=state.diagnosis?.diagnosisVersion?.active?.version||state.diagnosis?.diagnosisVersion?.current?.parentVersion||0;form.append(version);form.addEventListener('formdata',event=>event.formData.set('diagnosisVersion',version.value));});
    panel.querySelectorAll('[data-confirm-issue]').forEach(form=>form.addEventListener('submit',event=>confirmIssue(state,event)));
    panel.querySelectorAll('[data-override-issue]').forEach(form=>form.addEventListener('submit',event=>recordOverride(state,event)));
    panel.querySelectorAll('[data-bulk-override]').forEach(form=>form.addEventListener('submit',event=>recordBulkOverride(state,event)));
    panel.querySelector('.connector-decision-form')?.addEventListener('submit',event=>recordDecision(state,event));
    panel.querySelectorAll('[data-snapshot-id]').forEach(button=>button.addEventListener('click',()=>showSnapshot(state,button.dataset.snapshotId)));
    if(state.loading)panel.querySelectorAll('button,select,input,textarea').forEach(control=>{control.disabled=true;});
  }

  function recentDateRange(){const end=new Date(),start=new Date(end);start.setDate(start.getDate()-29);const value=date=>date.toISOString().slice(0,10);return {from:value(start),to:value(end)};}
  function businessFieldLabel(field){return FIELD_LABELS[field]||String(field).replaceAll('_',' ');}

  async function showAuthorizationPlan(state){
    try{
      const sources=state.workspace.sources.filter(source=>source.status!=='revoked');
      const contracts=await Promise.all(sources.map(source=>contractFor(state,source.id,'enterprise')));
      const {from,to}=recentDateRange(),dialog=createDialog('connector-authorization-dialog');
      dialog.innerHTML=`<form class="authorization-plan-wizard"><div class="connector-dialog-head"><div><span class="eyebrow">AUTHORIZATION PLAN</span><h3>配置系统只读授权计划</h3><p>一次设置共同时间和用途；每个来源仍需单独勾选确认，不会静默全授权。</p></div><button type="button" data-dialog-close aria-label="关闭">×</button></div><div class="authorization-plan-layout"><fieldset class="authorization-conditions"><legend>共同使用条件</legend><label>开始日期<input type="date" name="timeFrom" value="${from}" max="${to}" required></label><label>结束日期<input type="date" name="timeTo" value="${to}" max="${to}" required></label><label>使用目的<select name="purpose"><option>驻场前采购闭环远程诊断</option><option>采购审批与付款控制复核</option><option>库存与收货一致性复核</option></select></label><label>保留期限<select name="retentionDays"><option value="7">7 天</option><option value="30" selected>30 天</option><option value="60">60 天</option><option value="90">90 天</option></select></label></fieldset><fieldset class="authorization-source-plan"><legend>逐来源确认</legend>${sources.map((source,index)=>{const contract=contracts[index].contract,datasets=Object.keys(contract.datasets);return `<label class="authorization-source-choice"><input type="checkbox" name="source" value="${host.esc(source.id)}" checked><span><strong>${host.esc(SYSTEM_LABELS[source.systemType]||source.displayName)}</strong><small>${datasets.map(name=>DATASET_LABELS[name]||name).join('、')}</small></span><em>只读</em></label>`;}).join('')}</fieldset></div><div class="authorization-preview" data-plan-result><strong>等待确认授权计划</strong><span>提交后系统逐来源生成预览、写入有限授权并连接；任一来源失败会单独标记，可重试且不会回滚已成功来源。</span></div><div class="connector-dialog-foot"><span>授权范围可撤销，历史审计保留</span><button type="submit" class="primary-button">确认所选来源并连接</button></div></form>`;
      document.body.append(dialog);const form=dialog.querySelector('form'),result=dialog.querySelector('[data-plan-result]');
      form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('[type="submit"]'),ids=[...form.querySelectorAll('[name="source"]:checked')].map(input=>input.value);if(!ids.length){result.innerHTML='<strong>至少确认一个来源</strong><span>未勾选来源不会获得授权。</span>';return;}submit.disabled=true;const fromValue=form.elements.timeFrom.value,toValue=form.elements.timeTo.value;if(fromValue>toValue){result.innerHTML='<strong>时间范围无效</strong><span>开始日期不能晚于结束日期。</span>';submit.disabled=false;return;}const failures=[];for(const id of ids){const source=sources.find(item=>item.id===id),contract=(await contractFor(state,id,'enterprise')).contract,datasets=Object.entries(contract.datasets),fields=[...new Set(datasets.flatMap(([,item])=>[...item.required,...item.optional]))];result.innerHTML=`<strong>正在处理 ${host.esc(SYSTEM_LABELS[source.systemType]||source.displayName)}</strong><span>生成范围预览并写入该来源授权…</span>`;try{const preview=await api(state,`/connectors/${encodeURIComponent(id)}/authorization-preview`,{method:'POST',body:{datasets:datasets.map(([name])=>name),allowedFields:fields,timeFrom:new Date(`${fromValue}T00:00:00.000Z`).toISOString(),timeTo:new Date(`${toValue}T23:59:59.999Z`).toISOString(),purpose:form.elements.purpose.value,retentionDays:Number(form.elements.retentionDays.value),caseCount:30},role:'enterprise'});await api(state,`/connectors/${encodeURIComponent(id)}/authorization`,{method:'POST',body:{previewId:preview.preview.id},role:'enterprise'});await api(state,`/connectors/${encodeURIComponent(id)}/connect`,{method:'POST',body:{},role:'enterprise'});}catch(error){failures.push(`${SYSTEM_LABELS[source.systemType]||source.displayName}：${error.message}`);}}
        state.revision+=1;await loadState(state,true,true);if(failures.length){result.innerHTML=`<strong>${failures.length} 个来源未完成</strong><span>${host.esc(failures.join('；'))}</span>`;submit.disabled=false;return;}dialog.close();host.showNotice(`${ids.length} 个来源已逐项授权并连接；请提交服务方开始诊断。`,'success');});
      bindDialogClose(dialog);dialog.showModal();
    }catch(error){state.error=error.message;refreshActive();}
  }

  async function showAuthorization(state,sourceId){
    try{
      const discovery=await contractFor(state,sourceId,'enterprise');const source=state.workspace.sources.find(item=>item.id===sourceId);const contract=discovery.contract;
      const dialog=createDialog('connector-authorization-dialog');
      const datasets=Object.entries(contract.datasets);
      const fields=[...new Set(datasets.flatMap(([,item])=>[...item.required,...item.optional]))].sort();
      const required=new Set(datasets.flatMap(([,item])=>item.required));
      const {from,to}=recentDateRange();
      dialog.innerHTML=`<form class="authorization-wizard"><div class="connector-dialog-head"><div><span class="eyebrow">ENTERPRISE AUTHORIZATION</span><h3>${host.esc(contract.displayName)} · 有限授权</h3><p>先审阅，再预览，最后提交；任一步都不能跳过。</p></div><button type="button" data-dialog-close aria-label="关闭">×</button></div><ol class="authorization-steps"><li class="active"><span>1</span>选择范围</li><li><span>2</span>生成预览</li><li><span>3</span>确认授权</li></ol><div class="authorization-grid"><fieldset><legend>授权数据集</legend>${datasets.map(([name])=>`<label><input type="checkbox" name="dataset" value="${host.esc(name)}" checked>${host.esc(DATASET_LABELS[name]||name)}</label>`).join('')}</fieldset><fieldset><legend>授权字段</legend><div class="authorization-field-grid">${fields.map(field=>`<label><input type="checkbox" name="field" value="${host.esc(field)}" ${required.has(field)?'checked disabled data-required="true"':'checked'}><span>${host.esc(businessFieldLabel(field))}${required.has(field)?'<small>诊断必需</small>':''}</span><code title="技术字段名">${host.esc(field)}</code></label>`).join('')}</div></fieldset><fieldset class="authorization-conditions"><legend>时间、用途与保留</legend><label>开始日期<input type="date" name="timeFrom" value="${from}" max="${to}" required></label><label>结束日期<input type="date" name="timeTo" value="${to}" max="${to}" required></label><label>使用目的<select name="purpose"><option>驻场前采购闭环远程诊断</option><option>采购审批与付款控制复核</option><option>库存与收货一致性复核</option></select></label><label>保留期限<select name="retentionDays"><option value="7">7 天</option><option value="30" selected>30 天</option><option value="60">60 天</option><option value="90">90 天</option></select></label></fieldset></div><div class="authorization-preview" data-preview-result><strong>尚未生成范围预览</strong><span>请先点击“生成授权预览”，核对记录数和字段后才能提交授权。</span></div><div class="connector-dialog-foot"><span class="authorization-submit-hint" id="authorization-submit-hint" data-submit-hint>提交前置：先生成授权预览</span><button type="button" class="connector-secondary-button" data-generate-preview>生成授权预览</button><button type="button" class="primary-button" data-submit-authorization disabled title="请先生成授权预览" aria-describedby="authorization-submit-hint">确认并提交授权</button></div></form>`;
      document.body.append(dialog);let preview=null;
      const form=dialog.querySelector('form');const submit=dialog.querySelector('[data-submit-authorization]');const submitHint=dialog.querySelector('[data-submit-hint]');const previewResult=dialog.querySelector('[data-preview-result]');const steps=[...dialog.querySelectorAll('.authorization-steps li')];
      const setWizardState=(state,message)=>{steps.forEach((step,index)=>{step.classList.toggle('active',(state==='initial'&&index===0)||(state==='preview'&&index===1)||(state==='ready'&&index===2));step.classList.toggle('complete',(state==='preview'||state==='ready')&&index===0||state==='ready'&&index===1);});submit.disabled=state!=='ready';submit.title=state==='ready'?'确认当前预览范围并提交授权':'请先生成授权预览';submitHint.textContent=message;submitHint.dataset.state=state;};
      form.addEventListener('change',()=>{preview=null;setWizardState('initial','提交前置：范围已改变，请重新生成授权预览');previewResult.innerHTML='<strong>范围已改变，请重新生成预览</strong><span>授权只能提交当前预览中的完全相同范围。</span>';});
      dialog.querySelector('[data-generate-preview]').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const selectedDatasets=[...form.querySelectorAll('[name="dataset"]:checked')].map(input=>input.value);const selectedFields=[...form.querySelectorAll('[name="field"]:checked')].map(input=>input.value);const from=form.elements.timeFrom.value,to=form.elements.timeTo.value;if(!selectedDatasets.length||!selectedFields.length||!from||!to)throw new Error('请选择数据集、字段和时间范围');if(from>to)throw new Error('开始日期不能晚于结束日期');const payload={datasets:selectedDatasets,allowedFields:selectedFields,timeFrom:new Date(`${from}T00:00:00.000Z`).toISOString(),timeTo:new Date(`${to}T23:59:59.999Z`).toISOString(),purpose:form.elements.purpose.value,retentionDays:Number(form.elements.retentionDays.value),caseCount:30};const result=await api(state,`/connectors/${encodeURIComponent(sourceId)}/authorization-preview`,{method:'POST',body:payload,role:'enterprise'});preview=result.preview;setWizardState('ready','前置已完成：请确认预览范围后提交授权');previewResult.innerHTML=`<strong>预览已生成 · 15 分钟内有效</strong><div>${Object.entries(preview.sampleSummary).map(([name,item])=>`<span>${host.esc(DATASET_LABELS[name]||name)}：预计 ${item.estimatedRows}/${item.totalRows} 行 · ${item.selectedFields.length} 字段</span>`).join('')}</div><small>范围指纹 ${host.esc(preview.scopeHash.slice(0,16))}… · 到期 ${host.esc(formatTime(preview.expiresAt))}</small>`;}catch(error){preview=null;setWizardState('initial','提交前置：预览失败，请修正范围后重新生成');previewResult.innerHTML=`<strong>预览失败</strong><span>${host.esc(error.message)}</span>`;}finally{button.disabled=false;}});
      submit.addEventListener('click',async()=>{if(!preview)return;submit.disabled=true;try{await api(state,`/connectors/${encodeURIComponent(sourceId)}/authorization`,{method:'POST',body:{previewId:preview.id},role:'enterprise'});state.revision+=1;state.workspace=await api(state,`/connectors?fresh=${Date.now()}`,{role:'enterprise'});dialog.close();refreshActive();host.showNotice(`${contract.displayName} 有限授权已提交；下一步由企业连接来源。`,'success');}catch(error){preview=null;setWizardState('initial','提交未完成：请重新生成授权预览后再试');previewResult.innerHTML=`<strong>授权未提交</strong><span>${host.esc(error.message)}。请重新生成预览后再提交。</span>`;}});
      bindDialogClose(dialog);dialog.showModal();
    }catch(error){state.error=error.message;refreshActive();}
  }

  async function showContract(state,sourceId){
    try{const value=await contractFor(state,sourceId,state.actor);const dialog=createDialog('connector-contract-dialog');dialog.innerHTML=`<div class="connector-dialog-head"><div><span class="eyebrow">READ-ONLY CONTRACT</span><h3>${host.esc(value.contract.displayName)}</h3><p>${host.esc(value.contract.description)} · 命名空间 ${host.esc(value.contract.namespace||'未设置')}</p></div><button type="button" data-dialog-close aria-label="关闭">×</button></div><div class="connector-contract-datasets">${Object.entries(value.contract.datasets).map(([name,item])=>`<section><h4>${host.esc(DATASET_LABELS[name]||name)}</h4><p>主键：${host.esc(item.primaryKey)}</p><div><span>必需字段</span><code>${host.esc(item.required.join(' · '))}</code></div>${item.optional.length?`<div><span>可选字段</span><code>${host.esc(item.optional.join(' · '))}</code></div>`:''}</section>`).join('')}</div><div class="connector-dialog-foot"><span>能力：${value.contract.capabilities.map(host.esc).join(' · ')}</span><button type="button" data-dialog-close>关闭</button></div>`;document.body.append(dialog);bindDialogClose(dialog);dialog.showModal();}catch(error){state.error=error.message;refreshActive();}
  }

  async function showSourcePreview(state,sourceId){
    try{const value=await api(state,`/connectors/${encodeURIComponent(sourceId)}/preview?caseCount=30`,{role:state.actor});const dialog=createDialog('connector-preview-dialog');dialog.innerHTML=`<div class="connector-dialog-head"><div><span class="eyebrow">AUTHORIZED SAMPLE PREVIEW</span><h3>${host.esc(value.source.displayName)}</h3><p>只展示已授权字段与时间窗口内的前三条合成样本。</p></div><button type="button" data-dialog-close aria-label="关闭样本预览">×</button></div><div class="sample-preview-list">${Object.entries(value.datasets).map(([name,item])=>`<details><summary>${host.esc(DATASET_LABELS[name]||name)} <span>${item.rowCount} 行</span></summary><pre>${host.esc(JSON.stringify(item.sample,null,2))}</pre></details>`).join('')}</div>`;document.body.append(dialog);bindDialogClose(dialog);dialog.showModal();}catch(error){state.error=error.message;refreshActive();}
  }

  async function showRunHistory(state,runId){
    try{const value=await api(state,`/connectors/runs/${encodeURIComponent(runId)}/history`,{role:state.actor});const dialog=createDialog('connector-history-dialog');dialog.innerHTML=`<div class="connector-dialog-head"><div><span class="eyebrow">RUN HISTORY</span><h3>${host.esc(DATASET_LABELS[value.run.dataset]||value.run.dataset)}</h3><p>${host.esc(value.run.id)} · ${host.esc(STATUS_LABELS[value.run.status]||value.run.status)}</p></div><button type="button" data-dialog-close aria-label="关闭读取历史">×</button></div><ol class="run-history-list">${value.history.map(item=>`<li><span>${host.esc(STATUS_LABELS[item.status]||item.status)}</span><b>${host.esc(RUN_STAGE_LABELS[item.stage]||'处理记录')}</b><small>${host.esc(formatTime(item.createdAt))}${item.reason?` · ${host.esc(runReasonLabel(item.reason))}`:''}</small></li>`).join('')}</ol>`;document.body.append(dialog);bindDialogClose(dialog);dialog.showModal();}catch(error){state.error=error.message;refreshActive();}
  }

  async function showSnapshot(state,snapshotId){
    try{
      const value=await api(state,`/procurement-diagnosis/snapshots/${encodeURIComponent(snapshotId)}`,{role:state.actor});
      const dialog=createDialog('connector-snapshot-dialog'),report=value.payload||{},decision=value.proposedDecision||{};
      const mappingText=value.mappingSummary?`映射覆盖 ${value.mappingSummary.coverage}%`:'共享事实版本';
      const evidenceText=value.payloadHash?`快照哈希 ${host.esc(value.payloadHash.slice(0,20))}…`:'企业可见内容已按该版本冻结';
      dialog.innerHTML=`<div class="connector-dialog-head"><div><span class="eyebrow">IMMUTABLE REPORT SNAPSHOT</span><h3>报告 V${value.version}</h3><p>${host.esc(formatTime(value.createdAt))} · ${host.esc(mappingText)} · ${host.esc(confirmationProgress(value.confirmationSummary))}</p></div><button type="button" data-dialog-close aria-label="关闭报告快照">×</button></div><div class="snapshot-detail"><article><span>决策</span><strong>${host.esc(MODE_LABELS[decision.mode]||decision.mode||'尚未形成')}</strong><p>${host.esc(decision.rationale||'该版本未记录最终介入决策。')}</p></article><article><span>问题事实</span><strong>${report.summary?.triggered??report.summary?.issues??0}</strong><p>${evidenceText}</p></article>${value.ruleVersion?`<article><span>规则版本</span><strong>${host.esc(value.ruleVersion)}</strong><p>${value.batchRefs?.length||0} 个已接受批次固定引用</p></article>`:''}</div>`;
      document.body.append(dialog);bindDialogClose(dialog);dialog.showModal();
    }catch(error){state.error=error.message;refreshActive();}
  }

  async function readSource(state,sourceId){await withBusy(state,async()=>{const result=await api(state,`/connectors/${encodeURIComponent(sourceId)}/read-runs`,{method:'POST',body:{caseCount:20},role:'fde'});const quarantined=result.runs.filter(run=>run.status==='quarantined');if(quarantined.length)host.showNotice(`${quarantined.length} 个数据集被隔离；上一份已接受批次未受影响。`,'warning');},'正在读取并校验单一来源…');}
  async function readAllSources(state){
    const sources=state.workspace.sources.filter(source=>source.status==='connected'&&!source.recordCount);if(!sources.length){host.showNotice('没有等待读取的已授权来源。','warning');return;}
    const failures=[];
    await withBusy(state,async()=>{for(const source of sources){try{const result=await api(state,`/connectors/${encodeURIComponent(source.id)}/read-runs`,{method:'POST',body:{caseCount:20},role:'fde'});if(result.runs.some(run=>run.status==='quarantined'))failures.push(`${SYSTEM_LABELS[source.systemType]||source.displayName} 存在隔离批次`);}catch(error){failures.push(`${SYSTEM_LABELS[source.systemType]||source.displayName}：${error.message}`);}}},`正在读取 ${sources.length} 个已授权来源…`);
    if(failures.length)host.showNotice(`批量读取完成，但有 ${failures.length} 个来源需处理：${failures.join('；')}`,'warning');
  }
  async function submitSourcesToFde(state){await withBusy(state,()=>api(state,'/connectors/handoff',{method:'POST',body:{},role:'enterprise'}),'正在提交服务方并写入审计…');host.showNotice('已提交 FDE 服务方；下一步由顾问读取并校验数据。','success');}
  async function retryRun(state,runId){await withBusy(state,()=>api(state,`/connectors/runs/${encodeURIComponent(runId)}/retry`,{method:'POST',body:{},role:'fde'}),'正在从失败批次重新读取…');}
  async function sourceAction(state,action,sourceId){if(action==='revoke'&&!window.confirm('确认撤销该来源授权吗？历史批次、证据与审计记录会保留。'))return;if(state.loading)return;state.loading=true;state.error='';state.busyLabel=action==='connect'?'正在连接来源…':action==='pause'?'正在暂停来源…':'正在撤销授权…';refreshActive();try{const method=action==='connect'?'POST':'PATCH';await api(state,`/connectors/${encodeURIComponent(sourceId)}/${action}`,{method,body:{},role:action==='pause'?'fde':'enterprise'});state.revision+=1;await loadState(state,true,true);host.showNotice('来源状态已更新。','success');}catch(error){state.error=error.message;state.loading=false;state.busyLabel='';refreshActive();host.showNotice(`操作未完成：${error.message}`,'error');}}
  async function confirmMapping(state,candidateId,decision){await withBusy(state,()=>api(state,`/procurement-mappings/candidates/${candidateId}/confirmation`,{method:'POST',body:{decision},role:'enterprise'}),'正在写入企业映射确认…');}

  async function confirmIssue(state,event){event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form).entries());if(data.decision!=='confirmed'&&String(data.note||'').trim().length<4){form.elements.note.setCustomValidity('除确认属实外，请填写至少 4 个字说明。');form.elements.note.reportValidity();form.elements.note.addEventListener('input',()=>form.elements.note.setCustomValidity(''),{once:true});return;}await withBusy(state,()=>api(state,`/procurement-diagnosis/issues/${form.dataset.confirmIssue}/confirmation`,{method:'POST',body:data,role:'enterprise'}),'正在写入企业事实确认…');}
  async function recordOverride(state,event){event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form).entries());await withBusy(state,()=>api(state,`/procurement-diagnosis/issues/${form.dataset.overrideIssue}/override`,{method:'POST',body:data,role:'fde'}),'正在记录 FDE 覆核理由…');}
  async function recordBulkOverride(state,event){event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),issues=(state.diagnosis?.issues||[]).filter(issue=>issueGroup(issue)===form.dataset.bulkOverride&&!issue.override);if(!issues.length)return;await withBusy(state,async()=>{for(const issue of issues)await api(state,`/procurement-diagnosis/issues/${issue.id}/override`,{method:'POST',body:data,role:'fde'});},`正在为 ${issues.length} 个同类问题写入审计覆核…`);}
  async function recordDecision(state,event){event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());await withBusy(state,()=>api(state,'/procurement-diagnosis/decision',{method:'POST',body:data,role:'fde'}),'正在写入决策并冻结报告快照…');}

  function enhancePrep(){
    const selected=host.getSelected(),state=current(),box=document.querySelector('#prep-content');if(!selected||!state||!box)return;
    if(!state.workspace){box.innerHTML=loadingSurface('正在读取介入与验证状态…');if(!state.loading)void loadState(state);return;}
    const valid=new Set(['plan','tasks','metrics','acceptance']);let active=host.getActivePrepSection?.()||'plan';if(!valid.has(active)){active='plan';host.setActivePrepSection?.(active);}
    const report=state.diagnosis,outcome=report?.outcome||{},decision=report?.latestDecision;
    box.innerHTML=`<section class="connector-execution-board" data-connector-execution><div class="connector-section-head"><div><span class="eyebrow">INTERVENTION & VALIDATION</span><h3>介入与验证</h3><p>承接已冻结的 FDE 决策，按方案、任务、指标、企业验收四步推进。</p></div>${roleBar(state)}</div><nav class="execution-stepper" aria-label="介入与验证进度">${[['plan','介入方案'],['tasks','执行任务'],['metrics','指标观察'],['acceptance','企业验收']].map(([key,label],index)=>`<button type="button" class="${executionStepClass(key,active,state,decision,outcome)}" data-execution-section="${key}" aria-current="${active===key?'step':'false'}"><span class="execution-step-number">${index+1}</span><span class="execution-step-copy"><strong>${label}</strong><small>${executionStepStatus(key,state,decision,outcome)}</small></span></button>`).join('')}</nav><div class="execution-stage"><div class="execution-stage-kicker">当前步骤 · ${[['plan','介入方案'],['tasks','执行任务'],['metrics','指标观察'],['acceptance','企业验收']].find(([key])=>key===active)?.[1]||'介入方案'}</div>${executionSectionMarkup(active,state,decision,outcome)}</div></section>`;
    box.querySelectorAll('[data-section-target]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.sectionTarget)));
    box.querySelectorAll('[data-execution-section]').forEach(button=>button.addEventListener('click',()=>{host.setActivePrepSection?.(button.dataset.executionSection);host.updateUrl('prep');host.refreshPrep();}));
    box.querySelector('.connector-intervention-form')?.addEventListener('submit',event=>createIntervention(state,event));
    box.querySelector('.connector-observation-form')?.addEventListener('submit',event=>recordObservation(state,event));
    box.querySelector('.connector-outcome-form')?.addEventListener('submit',event=>confirmOutcome(state,event));
  }

  function executionSectionMarkup(section,state,decision,outcome){
    if(!decision)return gateMarkup('尚未确定后续行动','介入是初筛后的可选分支。请先到“诊断工作台 → 决策记录”完成判断；未具备条件时继续补证，不必创建方案。','decision','前往诊断工作台 · 决策记录');
    if(decision.mode==='remote_supplement'&&!outcome.intervention)return gateMarkup('当前选择继续远程补证','本轮尚不进入介入执行。企业补充资料后，由 FDE 重新核验与诊断。','overview','返回诊断工作台查看补证任务');
    const intervention=outcome.intervention,metric=outcome.metrics?.[0];
    if(section==='plan'){
      if(!intervention)return state.actor==='fde'?`<form class="connector-intervention-form"><label>负责角色<select name="ownerRole"><option>FDE 项目负责人</option><option>联合负责人</option><option>企业流程负责人</option><option>采购负责人</option><option>财务负责人</option><option>仓储负责人</option></select></label><label>观察指标<select name="metricKey"><option value="issue_rate">每百笔采购可验证问题数</option><option value="approval_lead_time">审批最长耗时</option><option value="stocking_delay">质检后最长入库耗时</option></select></label><label class="wide">介入目标<textarea name="objective" minlength="8" maxlength="500" required>先远程修正采购、审批、付款与入库断点，再用同口径合成回放观察结果。</textarea></label><button type="submit" class="primary-button">建立介入方案</button></form>`:gateMarkup('等待 FDE 建立介入方案','企业可以查看与验收，但不能代替服务方建立方案。','','');
      return interventionSummary(intervention);
    }
    if(!intervention)return gateMarkup('介入方案尚未建立','完成介入方案后才会生成执行任务。','','');
    if(section==='tasks')return `${interventionSummary(intervention)}<article class="execution-task"><div><span>执行任务 01</span><strong>${host.esc(intervention.objective)}</strong><small>责任角色：${host.esc(intervention.ownerRole)}</small></div><em>${host.esc(outcome.status==='closed'?'已完成':metric?.observedValue!==null&&metric?.observedValue!==undefined?'待企业验收':'执行中')}</em></article>`;
    const metricView=metric&&metric.observedValue!==null?`<div class="execution-metric"><span>${host.esc(metric.label)}</span><strong>${metric.observedValue} ${host.esc(metric.unit)}</strong><small>基线 ${metric.baselineValue} · 目标 ≤ ${metric.targetValue}</small><p>${host.esc(metric.note)}</p></div>`:'';
    if(section==='metrics')return `${metricView}${state.actor==='fde'?`<form class="connector-observation-form"><label>观察值<input name="observedValue" type="number" min="0" step="0.1" value="${metric?.observedValue??metric?.targetValue??0}" required></label><label class="wide">观察说明<textarea name="note" minlength="4" maxlength="500" required>${host.esc(metric?.note||'合成回放只验证规则、指标计算和角色闭环，不代表真实改善或因果关系。')}</textarea></label><button type="submit" class="primary-button">${metricView?'更新观察结果':'记录观察结果'}</button></form>`:metricView||gateMarkup('等待 FDE 记录观察值','至少有一个可复核观察指标后，企业才可验收。','','')}`;
    if(!metric||metric.observedValue===null)return gateMarkup('企业验收尚未开放','先由 FDE 记录至少一个可复核观察指标。','','');
    if(outcome.status==='closed')return `${metricView}<div class="connector-success-strip"><strong>企业已验收并结项</strong><span>${host.esc(outcome.latestConfirmation?.note||outcome.boundary||'结果已留档')}</span></div>`;
    return `${metricView}${state.actor==='enterprise'?(canReviewOutcome()?`<form class="connector-outcome-form"><label>验收决定<select name="decision"><option value="confirmed">确认结果并结项</option><option value="rejected">退回整改</option></select></label><label class="wide">企业说明<textarea name="note" maxlength="500" placeholder="退回整改时至少填写 4 个字"></textarea></label><button type="submit" class="primary-button">提交企业验收</button></form>`:gateMarkup('当前岗位仅可查看','请由结果验收人或企业管理员提交验收。','','')):gateMarkup('等待企业验收','FDE 不能代替企业确认观察结果或关闭项目。','','')}`;
  }

  function interventionSummary(intervention){return `<div class="execution-summary"><span>介入方式 <b>${host.esc(MODE_LABELS[intervention.mode]||intervention.mode)}</b></span><span>负责人 <b>${host.esc(intervention.ownerRole)}</b></span><span>目标 <b>${host.esc(intervention.objective)}</b></span></div>`;}

  async function createIntervention(state,event){event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());await withBusy(state,()=>api(state,'/procurement-diagnosis/intervention',{method:'POST',body:data,role:'fde'}),'正在建立介入计划…');}
  async function recordObservation(state,event){event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());await withBusy(state,()=>api(state,'/procurement-diagnosis/intervention/observation',{method:'POST',body:data,role:'fde'}),'正在记录观察结果…');}
  async function confirmOutcome(state,event){event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());if(data.decision==='rejected'&&String(data.note||'').trim().length<4){form.elements.note.setCustomValidity('退回整改时请填写至少 4 个字。');form.elements.note.reportValidity();return;}await withBusy(state,()=>api(state,'/procurement-diagnosis/intervention/outcome-confirmation',{method:'POST',body:data,role:'enterprise'}),'正在写入企业验收…');}

  function executionStepStatus(key,state,decision,outcome){
    const intervention=outcome?.intervention,metric=outcome?.metrics?.[0],observed=metric&&metric.observedValue!==null&&metric.observedValue!==undefined;
    if(outcome?.status==='closed')return key==='acceptance'?'已验收':'已完成';
    if(key==='plan')return !decision?'待决策':decision.mode==='remote_supplement'&&!intervention?'不适用':intervention?'已建立':'当前';
    if(key==='tasks')return !intervention?'待方案':observed?'已执行':'当前';
    if(key==='metrics')return !intervention?'待执行':observed?'已记录':'当前';
    return observed?'当前':'待观察';
  }

  function executionStepClass(key,active,state,decision,outcome){
    const status=executionStepStatus(key,state,decision,outcome);
    return [active===key?'active':'',status==='已完成'||status==='已验收'||status==='已建立'||status==='已执行'||status==='已记录'?'is-done':''].filter(Boolean).join(' ');
  }

  function enhanceReports(){
    const selected=host.getSelected(),state=current(),box=document.querySelector('#reports-content');if(!selected||!state||!box)return;
    const nav=box.querySelector('.report-package-bar')?.outerHTML||'';
    if(!state.workspace){box.innerHTML=`${nav}${loadingSurface(state.actor==='enterprise'?'正在读取企业可见报告…':'正在读取报告事实集合…')}`;bindReportTypeTabs(box);if(!state.loading)void loadState(state);return;}
    const rawType=host.getActiveReportType?.()||'screening',type=rawType==='process'?'screening':rawType,report=state.diagnosis;
    if(rawType==='process')host.setActiveReportType?.('screening');
    if(state.actor==='enterprise')document.querySelectorAll('[data-fde]').forEach(element=>{element.hidden=true;});
    if(state.actor==='enterprise'){
      box.innerHTML=`${nav}${enterpriseReportMarkup(state,selected,type)}`;bindReportTypeTabs(box);bindReportPrint(box);box.querySelectorAll('[data-snapshot-id]').forEach(button=>button.addEventListener('click',()=>showSnapshot(state,button.dataset.snapshotId)));return;
    }
    if(type==='screening'){
      box.querySelector('[data-connector-report-bridge]')?.remove();
      if(state.workflow?.acquisitionPath!=='upload')renderScreeningEvidence(box,state,selected);
      box.querySelectorAll('[data-run-history]').forEach(button=>button.addEventListener('click',()=>showRunHistory(state,button.dataset.runHistory)));
      box.querySelectorAll('[data-section-target]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.sectionTarget)));
      return;
    }
    box.innerHTML=`${nav}${fdeReportMarkup(state,selected,type)}`;bindReportTypeTabs(box);bindReportPrint(box);box.querySelectorAll('[data-snapshot-id]').forEach(button=>button.addEventListener('click',()=>showSnapshot(state,button.dataset.snapshotId)));
  }


  function renderScreeningEvidence(box,state,selected){
    const report=state.diagnosis,section=box.querySelector('.report-section.selected');
    if(!report||!section)return;
    const id=section.id.replace('report-section-',''),generated=Boolean(report.diagnosisVersion?.active),d=report.dimensions;
    const rows=items=>`<div class="report-section-rows">${items.map(([label,value])=>`<div class="report-section-row"><span>${host.esc(label)}</span><strong>${host.esc(value??'未知，待核验')}</strong></div>`).join('')}</div>`;
    const issues=report.issues||[],sources=state.workspace.sources||[],revision=report.diagnosisVersion?.revisionRequired;
    const mode=MODE_LABELS[d?.recommendedMode]||'暂无建议';
    const findingList=issues.length?`<div class="report-issue-ledger">${issues.map((issue,index)=>`<article><span>${index+1}</span><div><h4>${host.esc(issue.title)}</h4><p><b>涉及单据：</b>${host.esc(issue.poNo)} · ${host.esc(issue.observed)}</p><p><b>潜在影响：</b>${host.esc(IMPACTS[issue.ruleId]||'需结合业务上下文复核，不直接推断损失')}</p><p><b>企业回复：</b>${host.esc(issue.confirmation?confirmationLabel(issue.confirmation.decision):'待企业确认')}</p><details class="technical-evidence"><summary>查看证据与后续处理</summary>${evidenceTable(issue.evidence||[])}<p>规则 ${host.esc(issue.ruleId)} · ${host.esc(issue.ruleVersion)}</p><div class="report-evidence-actions"><button type="button" data-section-target="mappings">查看关联依据</button><button type="button" data-section-target="diagnosis">进入诊断复核</button><button type="button" data-section-target="decision">进入决策记录</button></div></details></div><em>${severityLabel(issue.severity)}</em></article>`).join('')}</div>`:rows([['本轮结果',generated?'未发现规则命中；不代表无风险':'诊断尚未运行，不能报告为零问题']]);
    const content={
      '01':rows([['企业',selected.name],['目标流程',selected.flow],['本轮范围',`${report.summary.cases} 笔采购 · ${state.workspace.readiness.sourceRecords||0} 条来源记录`],['当前任务',state.workflow?.currentTask?.label||'等待资料'],['决策状态',report.latestDecision?'顾问决策已记录；系统不合成总分，也不代替顾问决定':'尚未记录 FDE 决策'],['系统建议路径',generated?mode:'待形成诊断依据'],['数据边界','本地合成验证；不能外推真实企业全量业务']]),
      '02':rows([['目标流程',selected.flow],['核验链路','采购依据 → 审批 → 付款与收货入库；预付款按合同约定单独核验'],['当前采购案例',report.summary.cases],['范围边界','只核对本轮授权样本；不等于全企业流程审计']]),
      '03':rows(sources.map(source=>[source.displayName||SYSTEM_LABELS[source.systemType],`${STATUS_LABELS[source.status]||source.status} · ${source.datasets.map(x=>DATASET_LABELS[x]||x).join('、')}`]))+evidenceTable(report.sourceEvidence||[],report.sourceEvidenceTotal),
      '04':rows([['电子记录',`${state.workspace.readiness.sourceRecords||0} 条已读取来源记录`],['判断范围','只能证明本次样本可电子化读取，不能证明企业全部记录已电子化']]),
      '05':rows([['数据集验收',`${state.workspace.readiness.acceptedDatasets}/${state.workspace.readiness.totalDatasets}`],['结构化边界','通过契约校验表示本批次字段满足接入条件，不等于业务内容真实']]),
      '06':rows([['关联覆盖',`${state.mapping?.coverage||0}%`],['待确认关联',state.mapping?.counts?.pending||0],['关联缺口',state.mapping?.counts?.gap||0],['追溯边界','映射关联来源单据与采购案例；无法从关联本身证明因果']]),
      '07':rows([['样本记录',state.workspace.readiness.sourceRecords||0],['采购笔数',report.summary.cases],['覆盖口径','实际已验收批次；不预设近90天或全量覆盖'],['授权详情','准确时间、字段与条数以各来源授权及读取批次为准']])+evidenceTable(report.sourceEvidence||[],report.sourceEvidenceTotal),
      '08':findingList,
      '09':generated&&d?`<p>三项维度分别解释，不合成一个“企业好坏总分”。</p>${dimensionsMarkup([d.dataReadiness,d.evidenceStrength,d.onsiteNecessity])}`:rows([['评分','尚未完成诊断，不展示预设分数']]),
      '10':rows([['尚待企业确认',report.summary.pendingConfirmation||0],['版本状态',revision?'当前资料已变化，需重跑核验':'未标记待重跑'],['未知信息','未覆盖的日期、系统外活动、实际损失及因果关系仍未知'],['例外边界','规则命中只是候选，须结合合同、流程与企业反证判断']]),
      '11':rows([['系统建议',generated?mode:'待形成诊断依据'],['计算依据',generated?(d?.onsiteNecessity?.basis||d?.dataReadiness?.formula):'尚无'],['FDE决定',report.latestDecision?MODE_LABELS[report.latestDecision.mode]:'尚未记录'],['判断边界','系统建议不自动批准驻场；需独立说明路径、理由与限制']]),
      '12':rows(issues.filter(issue=>!issue.confirmation||['needs_supplement','partially_confirmed','rejected'].includes(issue.confirmation.decision)).map(issue=>[issue.title,`${issue.poNo}：核对原始依据，补充可排除该信号的说明或记录`]).concat([['补充原则','仅补与未决问题直接相关的证据；不默认要求重复上传全部材料']])),
      '13':rows([['现场验证前置','先判断远程能否核清；远程可解决的问题不自动升级驻场'],...issues.filter(issue=>issue.severity==='critical'||issue.severity==='high').map(issue=>[issue.title,`${issue.poNo}：若远程仍不能解释，现场核对实际节点、责任人与原始记录`])]),
      '14':report.latestDecision?decisionRecord(report.latestDecision):gateMarkup('尚未记录最终决策','先完成当前版诊断与企业事实核对，再由FDE独立记录。','decision','进入诊断工作台 · 决策记录')
    };
    const body=section.querySelector('.report-section-rows');if(body&&content[id])body.outerHTML=content[id];
    const badge=box.querySelector('.report-top>.status-badge');if(badge){badge.textContent=revision?'资料已更新，待重跑':!generated?'待运行诊断':report.latestDecision?`FDE决定：${MODE_LABELS[report.latestDecision.mode]||report.latestDecision.mode}`:`系统建议：${mode}`;}
    const stamp=box.querySelector('.report-version-stamp'),version=report.diagnosisVersion?.current;
    if(stamp)stamp.textContent=version?`诊断 V${version.version} · ${formatTime(version.createdAt)}${revision?' · 待补证重跑':''}`:'尚未生成系统诊断版本';
  }

  function bindReportTypeTabs(box){box.querySelectorAll('[data-run-history]').forEach(button=>button.addEventListener('click',()=>showRunHistory(current(),button.dataset.runHistory)));box.querySelectorAll('[data-report-type]').forEach(button=>button.addEventListener('click',()=>{host.setActiveReportType?.(button.dataset.reportType);host.updateUrl('reports');host.refreshReports();}));box.querySelectorAll('[data-section-target]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.sectionTarget)));}
  function bindReportPrint(box){box.insertAdjacentHTML('afterbegin','<button type="button" class="report-print-button quiet-button" data-print-report>打印 / 另存 PDF</button>');box.querySelector('[data-print-report]')?.addEventListener('click',()=>window.print());}

  function fdeReportMarkup(state,selected,type){
    const report=state.diagnosis,outcome=report?.outcome||{};
    if(type==='process'&&!report.diagnosisVersion?.active)return `<section class="connector-report-surface"><header><h3>${host.esc(selected.name)} · 流程诊断报告</h3></header>${gateMarkup(report.diagnosisVersion?.revisionRequired?'当前流程诊断已失效':'尚未生成流程诊断',report.evidenceValidity&&!report.evidenceValidity.ready?'来源授权或读取批次已失效；旧版请到历史版本查看，当前报告不沿用旧证据。':'当前只有材料或映射记录；运行规则后才会产生本轮问题与计算依据。',report.evidenceValidity&&!report.evidenceValidity.ready?'connectors':'diagnosis',report.evidenceValidity&&!report.evidenceValidity.ready?'恢复数据接入':'进入诊断结果')}</section>`;
    if(type==='process')return `<section class="connector-report-surface"><header><span class="eyebrow">PROCESS DIAGNOSIS REPORT</span><h3>${host.esc(selected.name)} · 流程诊断报告</h3><p>诊断 V${report.diagnosisVersion?.current?.version||'—'} · ${host.esc(formatTime(report.diagnosisVersion?.current?.createdAt))} · ${report.summary.cases||0} 笔采购 · ${report.summary.triggered||0} 个可追溯问题。每项均说明事实、证据、影响和下一步。</p></header><div class="report-issue-ledger">${(report.issues||[]).map((issue,index)=>`<article><span>${index+1}</span><div><h4>${host.esc(issue.title)}</h4><p><b>发现事实：</b>${host.esc(issue.poNo)} · ${host.esc(issue.observed)}</p><p><b>业务影响：</b>${host.esc(IMPACTS[issue.ruleId]||'需结合企业流程负责人说明判断实际影响。')}</p><p><b>下一步行动：</b>${host.esc(issue.confirmation?'企业事实已确认，等待 FDE 纳入介入决策。':'请企业流程负责人确认事实、合法例外或补充反证。')}</p><small>${issue.evidenceRefs.length} 条来源证据 · ${host.esc(evidenceLabel(issue.evidenceState?.state))}</small><details class="technical-evidence"><summary>查看来源与规则</summary>${evidenceTable(issue.evidence||[])}<code>${host.esc(issue.ruleId)} · ${host.esc(issue.ruleVersion)}</code></details></div><em>${severityLabel(issue.severity)}</em></article>`).join('')||(report.diagnosisVersion?.active?'<p>本轮诊断已运行，未发现规则命中；不代表全部业务无风险。</p>':'<p>尚未生成流程诊断。</p>')}</div>${report.dimensions?`<details class="diagnosis-method"><summary>查看计算依据</summary><div class="connector-dimensions">${dimensionCard(report.dimensions.dataReadiness)}${dimensionCard(report.dimensions.evidenceStrength)}${dimensionCard(report.dimensions.onsiteNecessity)}</div></details>`:''}</section>`;
    if(type==='decision')return `<section class="connector-report-surface"><header><span class="eyebrow">ONSITE DECISION REPORT</span><h3>${host.esc(selected.name)} · 驻场决策报告</h3><p>企业确认与 FDE 独立判断分离，评分不自动批准驻场。</p></header>${report.diagnosisVersion?.revisionRequired?'<p class="connector-alert warning">材料已更新：下方是旧版冻结决定，新版需重新核验。</p>':''}${report.latestDecision?decisionRecord(report.latestDecision):gateMarkup('尚无驻场决策','完成企业确认并确保当前诊断版本无需补证后，才能冻结决策。','decision','进入决策记录')}</section>`;
    if(type==='outcome')return `<section class="connector-report-surface"><header><span class="eyebrow">INTERVENTION OUTCOME REPORT</span><h3>${host.esc(selected.name)} · 介入结果报告</h3><p>仅汇总已记录的执行指标和企业验收，不声明真实 ROI 或因果关系。</p></header>${outcome.intervention?`${interventionSummary(outcome.intervention)}<div class="connector-success-strip"><strong>${outcome.status==='closed'?'企业已验收并结项':'结果观察已记录，待企业验收'}</strong>${outcome.latestConfirmation?.note?`<span>${host.esc(outcome.latestConfirmation.note)}</span>`:''}</div>${outcome.metrics?.map(metric=>`<div class="execution-metric"><span>${host.esc(metric.label)}</span><strong>${metric.observedValue??'待观察'} ${host.esc(metric.unit)}</strong><small>基线 ${metric.baselineValue} · 目标 ${metric.targetValue}</small><p>${host.esc(metric.note||'尚无观察说明')}</p></div>`).join('')||''}`:gateMarkup('尚无介入结果',report.latestDecision?.mode==='remote_supplement'?'本次决策为远程补证，无需建立介入方案。':'仅当决策进入试点或驻场实施，才建立介入方案并记录观察。','decision','查看决策依据')}</section>`;
    return `<section class="connector-report-surface"><header><span class="eyebrow">VERSION HISTORY</span><h3>${host.esc(selected.name)} · 历史版本</h3><p>诊断修订与决策快照均保留，不覆盖旧结论。</p></header><div class="diagnosis-version-list">${(report.diagnosisVersion?.history||[]).map(item=>`<article><strong>诊断 V${item.version}</strong><span>${item.status==='generated'?'已生成':'待补证重跑'} · ${host.esc(item.trigger)}</span><small>${host.esc(formatTime(item.createdAt))}${item.parentVersion?` · 基于 V${item.parentVersion}`:''}</small></article>`).join('')||'<p>尚无诊断版本。</p>'}</div>${snapshotList(state)}</section>`;
  }

  function enterpriseReportMarkup(state,selected,type){
    const report=state.diagnosis,outcome=report?.outcome||{};
    const head=`<header><div><span class="eyebrow">ENTERPRISE REPORT</span><h3>${host.esc(selected.name)} · 企业可见报告</h3><p>只展示共享事实、业务影响、企业确认和最终决策；内部规则权重、优先级与故障控制不会下发。</p></div>${roleBar(state)}</header>`;
    if(type==='decision')return `<section class="enterprise-report">${head}${report.latestDecision?decisionRecord(report.latestDecision):gateMarkup('尚无最终决策','企业确认完成后，由 FDE 独立记录介入路径。','confirmation','进入企业确认')}</section>`;
    if(type==='outcome')return `<section class="enterprise-report">${head}${outcome.intervention?`${interventionSummary(outcome.intervention)}${outcome.metrics?.map(metric=>`<div class="execution-metric"><span>${host.esc(metric.label)}</span><strong>${metric.observedValue??'待观察'} ${host.esc(metric.unit)}</strong><small>基线 ${metric.baselineValue} · 目标 ${metric.targetValue}</small></div>`).join('')||''}`:gateMarkup('尚无介入结果','等待服务方建立介入方案并记录指标。','','')}</section>`;
    if(type==='history')return `<section class="enterprise-report">${head}${snapshotList(state)}</section>`;
    return `<section class="enterprise-report">${head}<div class="enterprise-report-metrics"><span>采购案例 <b>${report.summary.cases||0}</b></span><span>问题事实 <b>${report.summary.issues||0}</b></span><span>已确认 <b>${report.summary.confirmed||0}</b></span><span>待确认 <b>${report.summary.pendingConfirmation||0}</b></span></div>${enterpriseIssueList(report,'本报告与 FDE 报告来自同一事实集合，但表达和权限不同。',true)}</section>`;
  }

  function enhanceSettings(){
    const selected=host.getSelected(),state=current(),box=document.querySelector('#settings-content');if(!selected||!state||!box)return;
    const raw=host.getSettingsSection?.()||'archived';let section=['archived','deleted','all'].includes(raw)?'lifecycle':raw;
    if(state.actor!=='admin'&&section==='access'){section='lifecycle';host.setSettingsSection?.('archived');host.updateUrl('settings');}
    const top=settingsTopTabs(section,state);
    if(section==='lifecycle'){box.insertAdjacentHTML('afterbegin',top);bindSettingsTabs(box,state);window.fdeInstallInvitationPanel?.();window.fdeInstallSupportPanel?.();return;}
    if(!state.workspace){box.innerHTML=`${top}${loadingSurface('正在读取工作台设置…')}`;bindSettingsTabs(box,state);if(!state.loading)void loadState(state);return;}
    box.innerHTML=`${top}<section class="connector-settings-surface">${settingsSectionMarkup(section,state)}</section>`;bindSettingsTabs(box,state);window.fdeInstallInvitationPanel?.();window.fdeInstallSupportPanel?.();
  }

  function settingsTopTabs(active,state){const tabs=[['contracts','连接器契约'],['rules','规则目录'],['roles','角色与权限'],['audit','审计日志'],['support','服务支持'],['lifecycle','归档与已移除']];if(state.actor==='admin')tabs.unshift(['access','企业成员管理']);return `<nav class="connector-settings-tabs" aria-label="管理分类">${tabs.map(([key,label])=>`<button type="button" class="${active===key?'active':''}" data-connector-settings="${key}" aria-current="${active===key?'page':'false'}">${label}</button>`).join('')}</nav>`;}
  function bindSettingsTabs(box,state){box.querySelectorAll('[data-connector-settings]').forEach(button=>button.addEventListener('click',()=>{host.setSettingsSection?.(button.dataset.connectorSettings==='lifecycle'?'archived':button.dataset.connectorSettings);host.updateUrl('settings');host.refreshSettings?.();}));const filters=box.querySelector('[data-audit-filters]');filters?.addEventListener('change',()=>{state.auditFilters=Object.fromEntries(new FormData(filters));void loadAudit(state,true);});box.querySelector('[data-audit-more]')?.addEventListener('click',()=>void loadAudit(state,false));}
  function settingsSectionMarkup(section,state){
    if(section==='access')return `<header><span class="eyebrow">企业成员管理</span><h3>企业成员与账号</h3><p>平台管理员仅处理成员状态与账号治理；项目首次邀请由 FDE 在诊断项目的当前任务中发起。</p></header><div data-invitation-mount></div>`;
    if(section==='contracts')return `<header><span class="eyebrow">CONNECTOR CONTRACTS</span><h3>连接器契约</h3><p>这里只展示通用 ERP / OA / 财务 / WMS 合成契约，不代表任何厂商真实接口。</p></header><div class="settings-contract-grid">${state.workspace.sources.length?state.workspace.sources.map(source=>`<article><span>${source.systemType.toUpperCase()}</span><h4>${host.esc(source.displayName)}</h4><p>${host.esc(source.mode)} · ${source.datasets.length} 个数据集</p><small>${source.datasets.map(name=>DATASET_LABELS[name]||name).join('、')}</small></article>`).join(''):'<p>尚未初始化连接器来源。</p>'}</div>`;
    if(section==='rules')return `<header><span class="eyebrow">RULE CATALOG</span><h3>规则目录</h3><p>规则版本、输入、前置条件、算法与合法例外集中维护；规则只形成建议，不自动批准驻场。</p></header><div class="settings-rule-list">${state.rules.length?state.rules.map(rule=>`<details><summary><span>${host.esc(rule.ruleId)}</span><strong>${host.esc(rule.title)}</strong><em>${severityLabel(rule.severity)}</em></summary><dl><div><dt>版本</dt><dd>${host.esc(rule.ruleVersion)}</dd></div><div><dt>输入</dt><dd>${host.esc(rule.inputs.join('、'))}</dd></div><div><dt>前置条件</dt><dd>${host.esc(rule.preconditions)}</dd></div><div><dt>计算</dt><dd>${host.esc(rule.calculation)}</dd></div><div><dt>阈值来源</dt><dd>${host.esc(rule.thresholdSource)}</dd></div><div><dt>合法例外</dt><dd>${host.esc(rule.legalExceptions.join('、'))}</dd></div></dl></details>`).join(''):'<p>企业角色无权读取内部规则目录；请切换为 FDE 顾问。</p>'}</div>`;
    if(section==='roles')return `<header><span class="eyebrow">ROLE BOUNDARY</span><h3>角色与权限</h3><p>每个动作由服务端验证角色和企业租户，界面隐藏不作为权限控制。</p></header><div class="settings-role-grid"><article><h4>FDE 顾问</h4><p>初始化连接器、读取批次、运行映射与诊断、业务覆核、决策、介入与指标记录。</p><small>不能代替企业授权、事实确认或结果验收。</small></article><article><h4>企业授权方</h4><p>审阅并提交有限授权、连接来源、确认映射、确认事实与例外、验收结果。</p><small>不能运行内部规则、修改权重或形成 FDE 决策。</small></article><article><h4>模拟操作员</h4><p>仅用于合成读取和失败恢复测试。</p><small>不能读取其他企业，也不能执行企业确认或 FDE 决策。</small></article></div>`;
    if(section==='support')return `<header><span class="eyebrow">SERVICE SUPPORT</span><h3>服务支持</h3><p>企业问题按租户进入受控队列，FDE 或平台管理员处理并保留状态变化记录。</p></header><div data-support-mount></div>`;
    return `<header><span class="eyebrow">AUDIT LOG</span><h3>审计日志</h3><p>默认最近 50 条；可按角色、结果和日期筛选，不展示授权令牌或敏感载荷。</p></header><form class="audit-filters" data-audit-filters><label>角色<select name="role"><option value="">全部角色</option><option value="fde" ${state.auditFilters.role==='fde'?'selected':''}>FDE 顾问</option><option value="enterprise_owner" ${state.auditFilters.role==='enterprise_owner'?'selected':''}>企业授权方</option><option value="admin" ${state.auditFilters.role==='admin'?'selected':''}>平台管理员</option></select></label><label>结果<select name="decision"><option value="">全部结果</option><option value="success" ${state.auditFilters.decision==='success'?'selected':''}>成功</option><option value="failed" ${state.auditFilters.decision==='failed'?'selected':''}>失败</option><option value="denied" ${state.auditFilters.decision==='denied'?'selected':''}>已拒绝</option><option value="allowed" ${state.auditFilters.decision==='allowed'?'selected':''}>已允许</option></select></label><label>开始日期<input type="date" name="from" value="${host.esc(state.auditFilters.from)}"></label><label>结束日期<input type="date" name="to" value="${host.esc(state.auditFilters.to)}"></label></form><div class="settings-audit-list">${state.audit.length?state.audit.map(event=>`<article><span>${host.esc(formatTime(event.created_at))}</span><strong>${host.esc(event.action)}</strong><em>${host.esc(event.decision)}</em><small>${host.esc(event.role||'system')} · ${host.esc(event.reason)}</small></article>`).join(''):'<p>当前筛选下没有审计事件。</p>'}</div>${state.auditPage.hasMore?'<button type="button" class="quiet-button audit-more" data-audit-more>加载更早记录</button>':''}`;
  }

  function loadingSurface(message){return `<div class="connector-loading-surface" role="status"><span class="connector-loading-dot" aria-hidden="true"></span><strong>${host.esc(message)}</strong><small>页面会在数据就绪后自动恢复，不会显示其他角色的旧内容。</small></div>`;}

  async function withBusy(state,task,label){if(state.loading)return;state.loading=true;state.error='';state.busyLabel=label;refreshActive();try{await task();await loadState(state,true,true);host.showNotice('项目状态已更新。','success');}catch(error){state.error=error.message;state.loading=false;state.busyLabel='';refreshActive();host.showNotice(`操作未完成：${error.message}`,'error');}}

  async function loadState(state,force=false,keepBusy=false){
    if(state.loading&&!force&&!keepBusy)return;const revision=state.revision;state.loading=true;state.error='';if(!keepBusy)state.busyLabel='正在读取连接器、映射、诊断和报告快照…';refreshActive();
    try{
      if(state.actor==='admin'){
        const [workspace,rulesPayload,auditPayload]=await Promise.all([api(state,'/connectors',{role:'admin'}),api(state,'/diagnostic-rules',{role:'admin'}),api(state,'/audit?limit=50',{role:'admin'})]);
        if(revision!==state.revision){state.loading=false;state.busyLabel='';refreshActive();return;}state.workspace=workspace;state.mapping=null;state.diagnosis=null;state.project=null;state.workflow=null;state.snapshots=[];state.rules=rulesPayload.rules||[];state.audit=auditPayload.events||[];state.auditPage=auditPayload.page||{hasMore:false,nextBeforeId:null};state.loading=false;state.busyLabel='';refreshActive();return;
      }
      const [workspace,mapping,diagnosis,delivery,project,workflowPayload,snapshotPayload,rulesPayload,auditPayload]=await Promise.all([api(state,'/connectors',{role:state.actor}),api(state,'/procurement-mappings',{role:state.actor}),api(state,'/procurement-diagnosis',{role:state.actor}),api(state,'/delivery',{role:state.actor}),api(state,'/connector-project-state',{role:state.actor}),api(state,'/project-workflow',{role:state.actor}),api(state,'/procurement-diagnosis/snapshots',{role:state.actor}),state.actor==='fde'?api(state,'/diagnostic-rules',{role:'fde'}):Promise.resolve({rules:[]}),state.actor==='fde'?api(state,'/audit?limit=50',{role:'fde'}):Promise.resolve({events:[],page:{hasMore:false,nextBeforeId:null}})]);
      if(revision!==state.revision){state.loading=false;state.busyLabel='';refreshActive();return;}state.workspace=workspace;state.mapping=mapping;state.diagnosis=diagnosis;state.delivery=delivery;state.diagnosis.outcome=deliveryOutcome(delivery,state.diagnosis.outcome);state.project=project;state.workflow=workflowPayload.workflow;state.snapshots=snapshotPayload.snapshots||[];state.rules=rulesPayload.rules||[];state.audit=auditPayload.events||[];state.auditPage=auditPayload.page||{hasMore:false,nextBeforeId:null};state.loading=false;state.busyLabel='';if(state.actor==='fde')applyDiagnosis(host.getSelected(),diagnosis);refreshActive();
    }catch(error){state.error=error.message;state.loading=false;state.busyLabel='';refreshActive();}
  }

  async function loadAudit(state,reset){const query=new URLSearchParams({limit:'50'});for(const [key,value] of Object.entries(state.auditFilters||{}))if(value)query.set(key,key==='to'?`${value}T23:59:59.999Z`:key==='from'?`${value}T00:00:00.000Z`:value);if(!reset&&state.auditPage.nextBeforeId)query.set('beforeId',state.auditPage.nextBeforeId);try{const payload=await api(state,`/audit?${query}`,{role:state.actor});state.audit=reset?payload.events||[]:[...state.audit,...(payload.events||[])];state.auditPage=payload.page||{hasMore:false,nextBeforeId:null};host.refreshSettings?.();}catch(error){state.error=error.message;host.showNotice(`审计记录读取失败：${error.message}`,'error');}}

  function deliveryOutcome(delivery,fallback={}){
    const history=(delivery?.history||[]).filter(event=>!event.stale);
    const remote=history.filter(event=>event.kind==='remote').at(-1);
    const observation=history.filter(event=>event.kind==='observation').at(-1);
    const confirmation=observation?history.filter(event=>event.kind==='observation-confirmation'&&event.payload?.observationId===observation.id).at(-1):null;
    if(!remote&&!observation)return fallback||{};
    const observationPayload=observation?.payload||{};
    const interventionPayload=remote?.payload||{};
    const accepted=confirmation?.payload?.accepted===true;
    return {
      status:accepted?'closed':observation?'observing':'intervention_active',
      intervention:remote?{id:remote.id,mode:'remote',objective:interventionPayload.objective,ownerRole:interventionPayload.ownerRole||'fde',status:observation?'completed':'active',createdAt:remote.createdAt,updatedAt:observation?.createdAt||remote.createdAt}:null,
      metrics:observation?[{id:observation.id,metricKey:'delivery.observation',label:observationPayload.metricDefinition,baselineValue:observationPayload.baselineValue,observedValue:observationPayload.observationValue,targetValue:null,unit:observationPayload.unit||'',status:accepted?'accepted':'observed',note:observationPayload.note||observationPayload.confounders?.join('；')||'',updatedAt:observation.createdAt}]:[],
      latestConfirmation:confirmation?{id:confirmation.id,decision:confirmation.payload.accepted?'confirmed':'rejected',note:confirmation.payload.note,createdAt:confirmation.createdAt}:null,
      boundary:observationPayload.boundary||'仅合成观察，不代表真实企业成效、因果或 ROI。',
    };
  }

  async function api(state,tail,{method='GET',body,role=state.actor}={}){
    if(body&&Object.hasOwn(body,'diagnosisVersion'))body.diagnosisVersion=Number(body.diagnosisVersion);
    const write=method!=='GET';
    const controller=new AbortController();
    const timeoutId=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await host.request(`/api/enterprises/${encodeURIComponent(state.enterpriseId)}${tail}`,{method,cache:'no-store',signal:controller.signal,headers:{...identityHeaders(state.enterpriseId,role),...(write?{'content-type':'application/json'}:{})},body:write?JSON.stringify(body||{}):undefined});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.message||payload.error||`请求失败 (${response.status})`);
      return payload;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('读取项目数据超时，请点击“重新读取”');
      throw error;
    }finally{
      clearTimeout(timeoutId);
    }
  }
  function identityHeaders(enterpriseId,role){return role==='enterprise'?{'x-actor-id':`owner-${enterpriseId}`,'x-role':'enterprise_owner','x-enterprise-id':enterpriseId}:{'x-actor-id':'fde-demo','x-role':'fde','x-enterprise-id':enterpriseId};}

  function applyDiagnosis(selected,report){
    if(!selected||!report?.dimensions||!report?.connector)return;
    if(selected.enterpriseId!==report.enterpriseId && report.enterpriseId)return;
    if(selected.assessment?.provenance?.some(value=>value==='live'||value==='contract_test'))return;
    if(!report.diagnosisVersion?.active){const invalid=report.evidenceValidity&&!report.evidenceValidity.ready;selected.connectorDiagnosis=report;selected.statusLabel=invalid?'授权或批次失效':'待运行诊断';selected.gate=invalid?'当前证据链已失效，旧结论仅保留在历史版本；需重新授权、读取并重跑。':'材料与映射不等于诊断结果，需由FDE运行本轮规则。';selected.recommendation=invalid?'先恢复当前数据接入，再建立新的诊断版本。':'先核验资料并完成映射，再运行诊断。';selected.diagnosticIssues=[];host.refreshContext?.();return;}
    const revisionRequired=Boolean(report.diagnosisVersion?.revisionRequired);const historicalDecision=report.latestDecision;if(revisionRequired)report.latestDecision=null;
    const cases=new Map(report.cases.map(item=>[item.id,item.poNo]));const mode=report.latestDecision?.mode||report.dimensions.recommendedMode;const decisionLabel=MODE_LABELS[mode]||mode;const outcome=report.outcome||{},decisionRecorded=Boolean(report.latestDecision?.snapshotId);
    const decisionGate=report.latestDecision?.snapshotId?`FDE 已记录“${decisionLabel}”，当前报告版本已冻结。`:report.latestDecision?`FDE 已记录历史决策“${decisionLabel}”，但该旧版本未生成快照；需重新完成当前规则诊断与确认后再冻结。`:`${report.summary.pendingConfirmation} 个问题仍待企业确认。`;
    selected.connectorDiagnosis=report;selected.status=mode==='onsite_recommended'?'recommended':mode==='remote_supplement'?'not_recommended':'conditional';selected.statusLabel=decisionLabel;selected.score=report.dimensions.dataReadiness.value;selected.readiness=`数据准备度 ${report.dimensions.dataReadiness.value} / 证据强度 ${report.dimensions.evidenceStrength.value??'无法计算'}`;selected.workflowState=report.project?.status||'diagnosis_generated';selected.summary=`四系统 ${report.connector.readiness.acceptedDatasets}/${report.connector.readiness.totalDatasets} 个数据集已验收，${report.summary.cases} 笔采购形成 ${report.summary.triggered} 个可复核信号。`;selected.gate=decisionGate;selected.recommendation=report.latestDecision?report.latestDecision.rationale:`系统建议“${decisionLabel}”，但不会自动形成驻场决定。`;selected.sources=report.connector.sources.map(source=>[source.displayName,source.systemType,`${source.recordCount} 条记录`]);selected.evidence=[['数据准备度',`${report.dimensions.dataReadiness.value}/100`,report.dimensions.dataReadiness.formula],['证据强度',`${report.dimensions.evidenceStrength.value??'无法计算'}`,report.dimensions.evidenceStrength.basis],['驻场必要性',`${report.dimensions.onsiteNecessity.value}/100`,report.dimensions.onsiteNecessity.basis]];selected.signals=report.issues.map(issue=>[issue.title,severityLabel(issue.severity),`${cases.get(issue.caseId)} · ${issue.observed}`]);selected.risks=report.issues.filter(issue=>['critical','high'].includes(issue.severity)).slice(0,6).map(issue=>`${cases.get(issue.caseId)}：${issue.title}`);selected.diagnosticMeta={ruleVersion:report.ruleVersion,sourceBatchId:`${report.connector.readiness.acceptedDatasets} 个数据集`,acceptedRows:report.connector.readiness.sourceRecords,dimensions:report.dimensions};selected.diagnosticIssues=report.issues.map((issue,index)=>({id:String(index+1),title:issue.title,businessTitle:issue.title,severity:['critical','high'].includes(issue.severity)?'高':issue.severity==='medium'?'中':'低',confidence:`${Math.round((issue.evidenceState?.confidence||issue.contract.defaultConfidence)*100)}%`,observed:`${cases.get(issue.caseId)}：${issue.observed}`,evidenceRefs:issue.evidenceRefs.map(id=>`来源记录 #${id}`),rule:`${issue.ruleVersion} / ${issue.ruleId}`,impact:IMPACTS[issue.ruleId]||'需结合企业流程负责人说明。',missing:issue.confirmation?'当前事实已确认；如有新证据可发起补证重跑。':'请企业确认事实，或补充能够推翻判断的证据。',nextAction:decisionRecorded?'已纳入顾问决策，转入介入执行跟踪':issue.confirmation?'等待 FDE 决策':'企业逐项确认',owner:decisionRecorded?'FDE 项目负责人':issue.confirmation?'FDE 顾问':'企业流程负责人',status:evidenceLabel(issue.evidenceState?.state),category:issue.contract.outputType==='data_conflict'?'数据冲突':'跨系统采购闭环',confirmation:issue.confirmation?confirmationLabel(issue.confirmation.decision||issue.confirmation.status||'confirmed'):'待企业确认',followup:decisionRecorded?'进入介入执行任务与指标观察':issue.confirmation?'等待 FDE 冻结决策':'由企业确认事实或发起补证'}));if(revisionRequired){selected.status='conditional';selected.statusLabel='需要补证重跑';selected.consultantDecision=null;selected.gate='企业反馈或新证据已使上一版决策过期；需补证并重跑诊断。';selected.recommendation='上一版结论仅作历史记录；当前必须形成新的诊断与决策版本。';}report.latestDecision=historicalDecision;host.refreshMetrics?.();host.refreshQueue?.();host.refreshContext?.();
  }

  function enterpriseRole(){return host.getUserRole?.()||'enterprise_owner';}
  function canAuthorize(){return ['enterprise_owner','enterprise_admin','enterprise_authorizer','enterprise_process_owner','enterprise_result_reviewer'].includes(enterpriseRole());}
  function canProcess(){return canAuthorize();}
  function canReviewOutcome(){return canAuthorize();}
  function storedRole(){const routed=host.getConnectorRole?.();return ['enterprise','admin'].includes(routed)?routed:'fde';}
  function openSection(section){host.setActiveProjectSection(section);host.setView('project');host.updateUrl('project');host.refreshProject();}
  function openView(view){host.setView(view);host.updateUrl(view);if(view==='prep')host.refreshPrep?.();else if(view==='reports')host.refreshReports?.();else host.refreshProject();}
  function refreshActive(){const state=current();if(state)applyShellRole(state);if(host.getActiveView()==='enterprise'){host.refreshEnterprise?.();}else if(host.getActiveView()==='reports')host.refreshReports();else if(host.getActiveView()==='prep')host.refreshPrep?.();else if(host.getActiveView()==='settings')host.refreshSettings?.();else host.refreshProject();}
  function applyShellRole(state){const view=host.getActiveView();if(!['enterprise','project','reports','prep','settings'].includes(view))return;const enterprise=state.actor==='enterprise',admin=state.actor==='admin',selected=host.getSelected(),shell=document.querySelector('.app-shell'),sidebar=document.querySelector('.app-sidebar'),roleSwitch=document.querySelector('#role-switch'),roleMenu=document.querySelector('#role-menu'),entryLabel=document.querySelector('#enterprise-entry-label'),context=document.querySelector('#context-rail'),contextHeading=document.querySelector('#context-rail .rail-heading .eyebrow'),contextPin=document.querySelector('#context-rail .rail-heading .rail-pin'),contextToggle=document.querySelector('#context-rail-toggle'),topEyebrow=document.querySelector('.workspace-topbar .eyebrow'),topTitle=document.querySelector('.workspace-topbar h1');shell?.classList.toggle('connector-enterprise-shell',enterprise);if(sidebar)sidebar.hidden=admin;if(roleSwitch)roleSwitch.hidden=true;if(roleMenu)roleMenu.hidden=true;if(entryLabel){entryLabel.hidden=!enterprise;entryLabel.textContent=`${selected?.name||'当前企业'} · 企业报告`;}if(context){context.hidden=admin;context.setAttribute('aria-label',enterprise?'当前任务指引':'当前项目摘要');if(contextHeading)contextHeading.textContent=enterprise?'当前任务指引':'当前项目';if(contextPin)contextPin.textContent=enterprise?'GUIDE':'LIVE';}if(contextToggle){const railLabel=enterprise?'当前任务指引':'当前项目摘要',collapsed=document.body.classList.contains('context-rail-collapsed');contextToggle.setAttribute('aria-label',collapsed?`展开${railLabel}`:`收起${railLabel}`);contextToggle.title=collapsed?`展开${railLabel}`:`收起${railLabel}`;}if(!admin)document.querySelectorAll('[data-fde]').forEach(element=>{element.hidden=enterprise;});if(topEyebrow&&(admin||enterprise))topEyebrow.textContent=admin?'PLATFORM ADMINISTRATION':'企业共享结果';if(topTitle&&(admin||enterprise))topTitle.textContent=admin?'平台管理':`${selected?.name||'当前企业'} · 企业报告`;}
  async function contractFor(state,sourceId,role){let value=state.contracts.get(sourceId);if(!value){value=await api(state,`/connectors/${encodeURIComponent(sourceId)}/discover`,{role});state.contracts.set(sourceId,value);}return value;}
  function createDialog(className){document.querySelector(`dialog.${className}`)?.remove();const dialog=document.createElement('dialog');dialog.className=className;dialog.addEventListener('close',()=>dialog.remove(),{once:true});return dialog;}
  function bindDialogClose(dialog){dialog.querySelectorAll('[data-dialog-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});}
  function severityLabel(value){return value==='critical'?'阻断':value==='high'?'高风险':value==='medium'?'中风险':'低风险';}
  function evidenceLabel(value){return {evidence_insufficient:'证据不足',mapping_candidate:'待确认映射',high_confidence_candidate:'高置信候选',verified_fact:'已验证事实',fde_conclusion:'FDE 结论'}[value]||'待形成证据';}
  function confirmationLabel(value){return {confirmed:'已确认属实',partially_confirmed:'部分属实 · 待补证重跑',needs_supplement:'目前无法判断 · 待补充',rejected:'已标记不成立 · 待补证重跑',exception:'已确认合法例外'}[value]||value;}
  function confirmationProgress(summary={}){const confirmed=summary?.confirmed??0,triggered=summary?.triggered??summary?.issues??0;return `${confirmed}/${triggered} 已确认`;}
  function formatTime(value){if(!value)return '尚无';try{return new Date(value).toLocaleString('zh-CN',{hour12:false});}catch{return String(value);}}
  function runReasonLabel(reason){if(!reason)return '';if(typeof reason==='string')return reason;if(Array.isArray(reason))return `${reason.length} 条记录未通过校验`;if(Number.isFinite(reason.inserted)&&Number.isFinite(reason.duplicates))return `新增 ${reason.inserted} 条 · 去重 ${reason.duplicates} 条`;if(reason.code==='persist_failed')return '保存失败，可重新读取';return '处理详情已记录';}
}
