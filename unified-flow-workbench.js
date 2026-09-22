const ROLE_LABELS={fde:'FDE 顾问',enterprise_owner:'企业授权方（兼容）',enterprise_admin:'企业管理员',enterprise_authorizer:'系统授权人',enterprise_process_owner:'业务流程负责人',enterprise_result_reviewer:'结果验收人'};
const PHASE_LABELS={project_created:'项目已建立',awaiting_admission:'等待准入信息',collecting_evidence:'收集诊断材料',evidence_review:'服务方复核材料',awaiting_authorization:'等待系统授权',data_connected:'读取系统数据',batch_validated:'建立跨系统关联',mapping_complete:'运行诊断',diagnosis_generated:'等待企业确认',awaiting_enterprise_confirmation:'等待企业确认',decision_ready:'形成介入决策',intervention_active:'执行介入方案',observing:'验收观察结果',closed:'项目已结项'};
const workflowPhaseLabel=workflow=>workflow.phase==='file_report_published'?'初筛报告已发布':workflow.phaseLabel||PHASE_LABELS[workflow.phase]||workflow.phase;
const DIMENSION_LABELS={process:'流程可还原',timing:'时效可计算',data:'数据可结构化',system:'系统可读取',pain:'痛点可量化'};
const STATUS_LABELS={verified:'已验证',submitted:'待复核',rejected:'已退回',missing:'缺失'};
const MAIN_FLOW=[
  {key:'invite',label:'邀请进入',note:'FDE 建档并生成岗位邀请',owner:'FDE 顾问',task:'invite_members',entry:'project'},
  {key:'identity',label:'企业身份确认',note:'企业接受邀请并完成岗位激活',owner:'企业成员',task:'identity',entry:'enterprise'},
  {key:'admission',label:'准入自述',note:'只填够判断的基本盘、诉求和合作条件',owner:'业务流程负责人',task:'complete_admission',entry:'enterprise'},
  {key:'acquisition',label:'资料采集方式',note:'选择系统只读连接或批量上传材料',owner:'企业流程负责人',task:'complete_materials',entry:'enterprise'},
  {key:'authorization',label:'授权或上传',note:'提交有限授权范围或已脱敏文件',owner:'系统授权人 / 流程负责人',task:'authorize_systems',entry:'enterprise'},
  {key:'evidence',label:'证据检查',note:'校验材料、批次和跨系统映射',owner:'FDE 顾问',task:'review_materials',entry:'project'},
  {key:'escalation',label:'异常升级',note:'只有证据缺口或高意向时才申请深度材料',owner:'企业 / FDE',task:'escalation',entry:'enterprise'},
  {key:'diagnosis',label:'FDE 诊断',note:'按版本化规则生成可追溯问题',owner:'FDE 顾问',task:'run_diagnosis',entry:'project'},
  {key:'confirmation',label:'企业确认',note:'企业确认事实、例外或请求补证',owner:'业务流程负责人',task:'confirm_facts',entry:'enterprise'},
  {key:'decision',label:'决策报告',note:'FDE 记录远程、补证或驻场判断',owner:'FDE 顾问',task:'record_decision',entry:'reports'},
  {key:'supplement',label:'补充 / 重跑',note:'历史只读，受控开放指定阶段并生成新版本',owner:'企业申请 / FDE 审核',task:'supplement',entry:'enterprise'},
];
const FLOW_GROUPS=[
  {key:'intake',label:'01 · 准入与采集',note:'先确认企业身份，再取得最小必要材料',stages:['invite','identity','admission','acquisition','authorization']},
  {key:'diagnosis',label:'02 · 证据与诊断',note:'从批次校验到企业事实确认',stages:['evidence','escalation','diagnosis','confirmation']},
  {key:'decision',label:'03 · 决策与复跑',note:'冻结决策，必要时受控补充并重跑',stages:['decision','supplement']},
];
const MACRO_FLOW=[
  {key:'setup',label:'建档与邀请',note:'建立企业身份和岗位边界',stages:['invite','identity']},
  {key:'admission',label:'企业准入',note:'完成最小必要自述',stages:['admission']},
  {key:'acquisition',label:'资料采集',note:'选择系统接入、上传或两者结合',stages:['acquisition','authorization','evidence']},
  {key:'joint_review',label:'联合确认',note:'异常升级、规则诊断和企业确认',stages:['escalation','diagnosis','confirmation']},
  {key:'decision',label:'决策与复跑',note:'冻结报告，按需补充或重跑',stages:['decision','supplement']},
];
const FLOW_STATUS_LABELS={done:'已完成',current:'当前步骤',locked:'待前置完成',optional:'按需触发',available:'可申请'};

export function installUnifiedFlowWorkbench(host){
  const cache=new Map();
  const revisions=new Map();
  const flowSelections=new Map();
  const macroSelections=new Map();
  host.onRenderProject(()=>enhance('project'));
  host.onRenderEnterprise(()=>enhance('enterprise'));
  host.onRenderReports?.(()=>enhance('reports'));
  window.addEventListener('fde:project-facts-changed',event=>{const view=event.detail?.view||host.getActiveView();void refresh(view,{silent:true});});
  if(host.getSelected())void refresh(host.getActiveView());

  async function enhance(view){
    const selected=host.getSelected();
    if(!selected)return;
    const id=selected.enterpriseId;
    const state=cache.get(id);
    if(!state){if(view==='project'){const context=document.querySelector('#context-content');if(context)context.innerHTML=loadingMarkup();}void refresh(view);return;}
    if(view==='project')renderProject(state,selected);
    if(view==='enterprise')renderEnterprise(state,selected);
    if(view==='reports')renderFileReport(state,selected);
  }

  async function refresh(view,{silent=false}={}){
    const selected=host.getSelected();
    if(!selected)return;
    const id=selected.enterpriseId;
    const revision=(revisions.get(id)||0)+1;
    revisions.set(id,revision);
    const previous=cache.get(id)||{};
    cache.set(id,{...previous,loading:!silent,error:''});
    try{
      const [workflowPayload,evidencePayload]=await Promise.all([
        api(`/api/enterprises/${encodeURIComponent(id)}/project-workflow`),
        api(`/api/enterprises/${encodeURIComponent(id)}/unified-evidence`),
      ]);
      const workflow=workflowPayload.workflow;
      // A completed request may outlive navigation. Cache per tenant, never paint it over another workspace.
      if(revisions.get(id)!==revision)return;
      if(host.getSelected()?.enterpriseId!==id||host.getActiveView()!==view){cache.set(id,{workflow,evidence:evidencePayload.workspace,history:workflow.history,loading:false,error:''});return;}
      const enterpriseRoot=document.querySelector('#enterprise');
      const revisionTier=enterpriseRoot?.dataset.revisionTier;
      const previousPolicy=previous.workflow?.revisionPolicy;
      const latestPolicy=workflow.revisionPolicy;
      const previousVersion=revisionTier==='tier0'?previousPolicy?.latestAdmission?.version:previousPolicy?.latestMaterials?.version;
      const latestVersion=revisionTier==='tier0'?latestPolicy?.latestAdmission?.version:latestPolicy?.latestMaterials?.version;
      if(revisionTier&&Number(latestVersion)>Number(previousVersion||0))delete enterpriseRoot.dataset.revisionTier;
      const state={workflow,evidence:evidencePayload.workspace,history:workflow.history,loading:false,error:''};
      if(revisions.get(id)!==revision)return;
      cache.set(id,state);
      window.__fdeUnifiedFlowReady=true;
      if(view==='project')renderProject(state,selected);
      if(view==='enterprise')renderEnterprise(state,selected);
      if(view==='reports')renderFileReport(state,selected);
    }catch(error){
      if(revisions.get(id)!==revision)return;
      const state={...previous,loading:false,error:error.message};cache.set(id,state);
      if(host.getSelected()?.enterpriseId!==id||host.getActiveView()!==view)return;
      window.__fdeUnifiedFlowReady=true;
      if(view==='project')renderProject(state,selected);
      if(view==='enterprise')renderEnterprise(state,selected);
    }
  }

  function renderProject(state,selected){
    const content=document.querySelector('#project-content');
    if(!content)return;
    const filePanel=content.querySelector('[data-file-workspace]');
    if(filePanel)filePanel.inert=Boolean(state.error);
    const previousBoard=content.querySelector(':scope > .unified-flow-board');
    const previousDrawer=previousBoard?.querySelector('[data-flow-drawer]');
    const previousMemberDrawer=previousBoard?.querySelector('[data-member-drawer]');
    const previousInvitationMount=previousMemberDrawer?.querySelector('[data-invitation-mount]');
    const preservedInvitationPanel=previousInvitationMount?.dataset.enterpriseId===selected.enterpriseId?previousInvitationMount.querySelector('[data-invitation-panel]'):null;
    const keepDrawerOpen=Boolean(previousDrawer?.open);
    const restoreDrawerFocus=Boolean(previousDrawer?.contains(document.activeElement));
    const keepMemberDrawerOpen=Boolean(previousMemberDrawer?.open);
    const restoreMemberDrawerFocus=Boolean(previousMemberDrawer?.contains(document.activeElement));
    previousBoard?.remove();
    const board=document.createElement('section');board.className='unified-flow-board';
    if(state.error){board.innerHTML=errorMarkup(state.error);content.prepend(board);bindRetry(board,'project');const context=document.querySelector('#context-content');if(context){context.innerHTML=errorMarkup(state.error);bindRetry(context,'project');}return;}
    if(!state.workflow){board.innerHTML=loadingMarkup();content.prepend(board);return;}
    const {workflow,evidence}=state,current=workflow.currentTask;
    const taskSummary=fdeTaskSummaryMarkup(workflow,evidence);
    const reviewAction=current.key==='review_materials'?reviewMarkup(evidence):'';
    const reopenAction=reopenReviewMarkup(state.history?.requests||[]);
    board.classList.add('project-flow-overlay');
    if(taskSummary||reviewAction||reopenAction)board.classList.add('has-inline-action');
    board.innerHTML=`<div class="mobile-project-actions"><button type="button" class="quiet-button mobile-flow-trigger" data-open-project-flow-inline>项目进度与完整流程 →</button><button type="button" class="quiet-button mobile-flow-trigger" data-open-project-members-inline>企业成员与邀请 →</button></div>
      ${taskSummary}
      ${reviewAction}
      ${reopenAction}
      <dialog class="fde-flow-drawer" data-flow-drawer aria-labelledby="fde-flow-drawer-title"><div class="fde-flow-drawer-shell"><header class="fde-flow-drawer-head"><div><span class="eyebrow">PROJECT CONTEXT</span><h3 id="fde-flow-drawer-title">流程与审计</h3><p>${esc(selected.name)} · 当前阶段 ${esc(workflowPhaseLabel(workflow))}</p></div><button type="button" class="quiet-button" data-close-flow aria-label="关闭完整流程">关闭</button></header><div class="fde-flow-drawer-body">${mainFlowMarkup(workflow,evidence,'project')}<details class="workflow-management"><summary>任务指派与审计记录</summary>${assignmentMarkup(current)}${timelineMarkup(workflow.tasks)}${activityMarkup(workflow.activity)}</details>${projectVersionHistoryMarkup(state.history)}</div></div></dialog>
      <dialog class="fde-member-drawer" data-member-drawer aria-labelledby="fde-member-drawer-title"><div class="fde-member-drawer-shell"><header class="fde-flow-drawer-head"><div><span class="eyebrow">ACCESS & INVITATIONS</span><h3 id="fde-member-drawer-title">企业成员与邀请</h3><p>${esc(selected.name)} · 项目全生命周期均可管理，不随当前任务消失</p></div><button type="button" class="workbench-modal-close" data-close-members aria-label="关闭企业成员与邀请">×</button></header><div class="fde-member-drawer-body"><div data-invitation-mount data-enterprise-id="${esc(selected.enterpriseId)}"></div></div></div></dialog>`;
    content.prepend(board);
    if(preservedInvitationPanel)board.querySelector('[data-invitation-mount]')?.append(preservedInvitationPanel);
    board.querySelector('[data-current-view]')?.addEventListener('click',event=>host.setView(event.currentTarget.dataset.currentView));
    board.querySelector('[data-current-section]')?.addEventListener('click',event=>{host.setActiveProjectSection(event.currentTarget.dataset.currentSection);host.refreshProject();});
    board.querySelector('[data-focus-review]')?.addEventListener('click',event=>{board.querySelector('.artifact-review')?.scrollIntoView({behavior:'smooth',block:'center'});board.querySelector('.artifact-review input, .artifact-review button')?.focus({preventScroll:true});});
    board.querySelector('[data-focus-file-review]')?.addEventListener('click',event=>{content.querySelector('[data-file-workspace]')?.scrollIntoView({behavior:'smooth',block:'center'});content.querySelector('[data-file-workspace] input, [data-file-workspace] textarea, [data-file-workspace] button')?.focus({preventScroll:true});});
    bindFlowEntries(board,state,selected,'project');
    board.querySelector('[data-task-assignment]')?.addEventListener('submit',event=>assignTask(event,state,selected));
    board.querySelectorAll('[data-review-artifact]').forEach(button=>button.addEventListener('click',()=>reviewArtifact(button,state,selected)));
    board.querySelectorAll('[data-reopen-decision]').forEach(button=>button.addEventListener('click',()=>decideReopen(button,selected,'project')));
    bindRetry(board,'project');
    renderProjectContext(state,selected,board,{keepDrawerOpen,restoreDrawerFocus,keepMemberDrawerOpen,restoreMemberDrawerFocus});
    if(!preservedInvitationPanel)window.fdeInstallInvitationPanel?.(board);
    mountFiles(content,state,selected);
  }

  function mountFiles(container,state,selected,options){
    if(container?.id==='project-content'){
      const shell=container.querySelector('.connector-shell');
      if(['delivery-plan','delivery'].includes(host.getActiveProjectSection?.())){if(shell)shell.hidden=false;container.querySelector('[data-file-workspace]')?.remove();return;}
      // Keep the unified project workspace visible even when file evidence exists.
      // File diagnosis is an additional evidence surface, not a replacement for
      // the project navigation, connector state, mapping, and decision paths.
      if(shell)shell.hidden=false;
    }
    mountFileDiagnosis(container,state.workflow?.file,host.getUserRole(),async(kind,body)=>{
      await api('/api/enterprises/'+encodeURIComponent(selected.enterpriseId)+'/file-diagnosis/'+kind,{method:'POST',body});
      setTimeout(()=>refresh(host.getActiveView()),0);
    },options);
  }
  function renderFileReport(state,selected){
    const container=document.querySelector('#reports-content');
    const active=Boolean(state.workflow?.file?.basis.files.length);
    if(container)for(const child of container.children)if(!child.hasAttribute('data-file-workspace'))child.hidden=active;
    if(active)mountFiles(container,state,selected,{reportsOnly:true});
    else container?.querySelector('[data-file-workspace]')?.remove();
  }

  function projectContextMarkup(state,selected){
    const {workflow,evidence}=state,current=workflow.currentTask;
    const statuses=new Map(MAIN_FLOW.map(stage=>[stage.key,flowStageStatus(stage,workflow,evidence)]));
    const required=MAIN_FLOW.filter(stage=>!['escalation','supplement'].includes(stage.key));
    const completed=required.filter(stage=>statuses.get(stage.key)==='done').length;
    const connectorPath=workflow.acquisitionPath==='connector';
    const blocker=workflow.reopen?.tier?`${workflow.reopen.stage?.label||workflow.reopen.tier}正在受控补充`:!connectorPath&&evidence.pendingReview?`${evidence.pendingReview} 份材料待复核`:!connectorPath&&evidence.missing?.length?`${evidence.missing.length} 项证据仍缺失`:'暂无阻断项';
    const tone=['failed','quarantined'].includes(workflow.connector?.status)?'bad':['awaiting_authorization','awaiting_enterprise_confirmation'].includes(workflow.phase)?'warn':'good';
    const admissionVersion=workflow.revisionPolicy?.latestAdmission;
    const materialsVersion=workflow.revisionPolicy?.latestMaterials;
    const latestSubmission=[admissionVersion?`准入 V${admissionVersion.version}`:'准入未提交',materialsVersion?`材料 V${materialsVersion.version}`:'材料未提交'].join(' · ');
    return `<section class="project-flow-context" data-enterprise-id="${esc(selected.enterpriseId)}">${host.renderEnterpriseSwitcher?.(selected)||''}<div class="context-company"><span class="context-symbol">${esc(String(selected.name||'企').slice(0,1))}</span><div><strong>${esc(selected.name)}</strong><small>驻场前远程初筛</small></div></div><div class="context-decision ${tone}"><span>当前阶段</span><strong>${esc(workflowPhaseLabel(workflow))}</strong><p>${esc(current.note||taskGuidance(current.key))}</p></div><progress class="project-context-progress" value="${completed}" max="${required.length}" aria-label="必经流程完成 ${completed} 共 ${required.length}"></progress><div class="context-stat"><span>必经流程</span><strong>${completed} / ${required.length} 已完成</strong></div><div class="context-stat"><span>企业最新提交</span><strong>${esc(latestSubmission)}</strong></div><div class="context-stat"><span>当前责任岗位</span><strong>${esc(ROLE_LABELS[current.ownerRole]||current.ownerRole)}</strong></div><div class="context-stat"><span>服务端状态</span><strong>${esc(workflowPhaseLabel(workflow))}</strong></div><div class="context-stat"><span>阻断 / 补充</span><strong>${esc(blocker)}</strong></div><div class="project-context-actions"><button type="button" class="rail-action" data-open-project-flow>查看完整流程 →</button><button type="button" class="rail-action secondary" data-open-project-members>企业成员与邀请 →</button></div></section>`;
  }

  function renderProjectContext(state,selected,board,{keepDrawerOpen=false,restoreDrawerFocus=false,keepMemberDrawerOpen=false,restoreMemberDrawerFocus=false}={}){
    const context=document.querySelector('#context-content');
    const drawer=board.querySelector('[data-flow-drawer]');
    const memberDrawer=board.querySelector('[data-member-drawer]');
    if(!context||!drawer||!memberDrawer)return;
    context.innerHTML=projectContextMarkup(state,selected);
    context.querySelector('[data-enterprise-project-switcher]')?.addEventListener('change',event=>host.switchEnterpriseProject?.(event.currentTarget.value));
    const openDrawer=trigger=>{
      drawer.dataset.trigger=trigger?.dataset.openProjectFlow!==undefined?'rail':trigger?.dataset.openProjectFlowSummary!==undefined?'summary':'inline';
      if(typeof drawer.showModal==='function'){if(!drawer.open)drawer.showModal();}else drawer.setAttribute('open','');
      drawer.querySelector('[data-close-flow]')?.focus();
    };
    context.querySelector('[data-open-project-flow]')?.addEventListener('click',event=>openDrawer(event.currentTarget));
    board.querySelector('[data-open-project-flow-summary]')?.addEventListener('click',event=>openDrawer(event.currentTarget));
    board.querySelector('[data-open-project-flow-inline]')?.addEventListener('click',event=>openDrawer(event.currentTarget));
    const openMembers=trigger=>{
      memberDrawer.dataset.trigger=trigger?.dataset.openProjectMembersInline!==undefined?'inline':'rail';
      if(typeof memberDrawer.showModal==='function'){if(!memberDrawer.open)memberDrawer.showModal();}else memberDrawer.setAttribute('open','');
      memberDrawer.querySelector('[data-close-members]')?.focus();
    };
    context.querySelector('[data-open-project-members]')?.addEventListener('click',event=>openMembers(event.currentTarget));
    board.querySelector('[data-open-project-members-inline]')?.addEventListener('click',event=>openMembers(event.currentTarget));
    board.querySelector('[data-open-invitation]')?.addEventListener('click',event=>openMembers(event.currentTarget));
    drawer.querySelector('[data-close-flow]')?.addEventListener('click',()=>drawer.close());
    drawer.addEventListener('click',event=>{if(event.target===drawer)drawer.close();});
    drawer.addEventListener('close',()=>{
      const selector=drawer.dataset.trigger==='inline'?'[data-open-project-flow-inline]':drawer.dataset.trigger==='summary'?'[data-open-project-flow-summary]':'[data-open-project-flow]';
      document.querySelector(selector)?.focus();
    });
    memberDrawer.querySelector('[data-close-members]')?.addEventListener('click',()=>memberDrawer.close());
    memberDrawer.addEventListener('click',event=>{if(event.target===memberDrawer)memberDrawer.close();});
    memberDrawer.addEventListener('close',()=>{
      const selector=memberDrawer.dataset.trigger==='inline'?'[data-open-project-members-inline]':'[data-open-project-members],[data-open-invitation]';
      document.querySelector(selector)?.focus();
    });
    if(keepDrawerOpen){
      if(typeof drawer.showModal==='function')drawer.showModal();else drawer.setAttribute('open','');
      if(restoreDrawerFocus)drawer.querySelector('[data-close-flow]')?.focus();
    }
    if(keepMemberDrawerOpen){
      if(typeof memberDrawer.showModal==='function')memberDrawer.showModal();else memberDrawer.setAttribute('open','');
      if(restoreMemberDrawerFocus)memberDrawer.querySelector('[data-close-members]')?.focus();
    }
  }

  function renderEnterprise(state,selected){
    const root=document.querySelector('#enterprise');
    if(!root)return;
    renderEnterpriseTaskRail(state,selected);
    renderEnterpriseSidebar(state,selected);
    const previousBoard=root.querySelector(':scope > .unified-enterprise-board');
    const previousProgress=previousBoard?.querySelector('.workflow-progress');
    const keepProgressOpen=Boolean(previousProgress?.open);
    const historyOpen=Boolean(previousBoard?.querySelector('[data-enterprise-history-dialog]')?.open);
    previousBoard?.querySelector('[data-enterprise-history-dialog]')?.close();
    const restoreProgressFocus=Boolean(previousProgress?.contains(document.activeElement));
    const focusedMacro=previousBoard?.querySelector('[data-macro-phase]:focus')?.dataset.macroPhase||'';
    const historyState=new Map([...previousBoard?.querySelectorAll('.enterprise-history-item[data-history-key]')||[]].map(item=>[item.dataset.historyKey,{open:item.open,formOpen:Boolean(item.querySelector('[data-reopen-form]:not([hidden])')),reason:item.querySelector('[data-reopen-form] textarea')?.value||''}]));
    previousBoard?.remove();
    root.querySelector(':scope > .enterprise-recent')?.remove();
    root.querySelector(':scope > .enterprise-hydrating')?.remove();
    let legacy=root.querySelector(':scope > .enterprise-card');
    const connector=root.querySelector(':scope > .enterprise-connector-panel');
    // Keep drafts intact, but do not submit against an unverified workflow state.
    for(const panel of [legacy,connector,root.querySelector('[data-file-workspace]')])if(panel)panel.inert=Boolean(state.error);
    if(state.error){const board=document.createElement('section');board.className='unified-enterprise-board';board.innerHTML=errorMarkup(state.error);root.insertBefore(board,legacy||connector);bindRetry(board,'enterprise');return;}
    if(!state.workflow)return;
    const {workflow,evidence}=state,current=workflow.currentTask,role=host.getUserRole();
    const board=document.createElement('section');board.className='unified-enterprise-board';
    board.innerHTML=enterpriseHomeMarkup(workflow,state.history,role,selected,root.dataset.acquisitionPath||workflow.acquisitionPath,root.dataset.enterprisePage,evidence);
    root.insertBefore(board,legacy||connector);
    const path=root.dataset.acquisitionPath||workflow.acquisitionPath||'';
    const revisionTier=root.dataset.revisionTier||'';
    const canRevise=role.startsWith('enterprise_')&&workflow.revisionPolicy?.directEditAllowed;
    const page=root.dataset.enterprisePage;
    const showAdmission=(page==='1'||!page&&workflow.phase==='awaiting_admission')&&canRevise||revisionTier==='tier0'&&canRevise;
    const showUpload=(page==='2'||!page&&workflow.phase==='collecting_evidence')&&canRevise&&['upload','both'].includes(path)||revisionTier==='tier1'&&canRevise;
    const showConnector=page==='2'&&['connector','both'].includes(path)||!workflow.file&&(['3','4'].includes(page)||!page&&(['collecting_evidence'].includes(workflow.phase)&&['connector','both'].includes(path)||['awaiting_authorization','diagnosis_generated','awaiting_enterprise_confirmation','observing','closed'].includes(workflow.phase)));
    if((showAdmission||showUpload)&&!legacy?.querySelector('#enterprise-detail form')){
      host.ensureEnterpriseLegacy?.();
      legacy=root.querySelector(':scope > .enterprise-card');
    }
    if(legacy){legacy.hidden=!(showAdmission||showUpload);legacy.querySelector('#enterprise-checklist')?.setAttribute('hidden','');legacy.querySelector('#enterprise-actions')?.setAttribute('hidden','');}
    if(showAdmission)activateLegacy('tier0');
    if(showUpload)activateLegacy('tier1');
    if(revisionTier&&(showAdmission||showUpload))prepareRevisionForm(legacy,revisionTier,state.history);
    if(connector){connector.hidden=!showConnector;limitConnectorStages(connector,page==='2'?'awaiting_authorization':page==='3'?'awaiting_enterprise_confirmation':page==='4'?'observing':workflow.phase);}
    board.querySelectorAll('[data-enterprise-page]').forEach(button=>button.addEventListener('click',()=>{
      root.dataset.enterprisePage=button.dataset.enterprisePage;
      delete root.dataset.revisionTier;
      if(button.dataset.enterprisePage==='1'&&state.history?.intakes?.some(item=>item.tier==='tier0'))root.dataset.revisionTier='tier0';
      renderEnterprise(state,selected);
    }));
    const historyDialog=board.querySelector('[data-enterprise-history-dialog]');
    const openHistory=()=>{if(!historyDialog.open)historyDialog.showModal();};
    board.querySelectorAll('[data-open-enterprise-history]').forEach(button=>button.addEventListener('click',openHistory));
    root.append(board.querySelector('.enterprise-recent'));
    board.querySelector('[data-close-enterprise-history]')?.addEventListener('click',()=>historyDialog.close());
    if(historyOpen)openHistory();
    board.querySelector('[data-enterprise-primary]')?.addEventListener('click',()=>{
      const taskPage={complete_admission:'1',authorize_systems:'2',confirm_facts:'3',accept_outcome:'4'}[current.key];
      if(taskPage&&root.dataset.enterprisePage!==taskPage){
        root.dataset.enterprisePage=taskPage;
        delete root.dataset.revisionTier;
        if(current.key==='authorize_systems')root.dataset.acquisitionPath='connector';
        renderEnterprise(state,selected);
        root.querySelector('[data-enterprise-primary]')?.click();
        return;
      }
      const target=showAdmission||showUpload?legacy:showConnector?connector:root.querySelector('[data-file-workspace]');
      if(target){target.scrollIntoView({behavior:'smooth',block:'start'});target.querySelector('input:not([type="hidden"]),select,button')?.focus({preventScroll:true});}
    });
    const progress=board.querySelector('.workflow-progress');
    if(progress&&keepProgressOpen)progress.open=true;
    if(progress&&restoreProgressFocus)queueMicrotask(()=>progress.querySelector('summary')?.focus());
    historyState.forEach((saved,key)=>{const item=board.querySelector(`.enterprise-history-item[data-history-key="${CSS.escape(key)}"]`);if(!item)return;item.open=saved.open;const form=item.querySelector('[data-reopen-form]');const opener=item.querySelector('[data-reopen-open]');if(saved.formOpen&&form){form.hidden=false;if(opener)opener.hidden=true;const reason=form.querySelector('textarea');if(reason)reason.value=saved.reason;}});
    bindFlowEntries(board,state,selected,'enterprise');
    if(focusedMacro)queueMicrotask(()=>board.querySelector(`[data-macro-phase="${CSS.escape(focusedMacro)}"]`)?.focus());
    board.querySelectorAll('[data-acquisition-path]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        await api('/api/enterprises/'+encodeURIComponent(selected.enterpriseId)+'/acquisition-choice',{method:'POST',body:{mode:button.dataset.acquisitionPath}});
        root.dataset.acquisitionPath=button.dataset.acquisitionPath;root.dataset.enterprisePage='2';delete root.dataset.revisionTier;
        if(['upload','both'].includes(button.dataset.acquisitionPath)&&state.history?.intakes?.some(item=>item.tier==='tier1'))root.dataset.revisionTier='tier1';
        await refresh('enterprise');
      }catch(error){host.showNotice?.(error.message,'error');button.disabled=false;}
    }));
    const resetDialog=board.querySelector('[data-demo-reset-dialog]');
    board.querySelector('[data-open-demo-reset]')?.addEventListener('click',()=>resetDialog?.showModal());
    board.querySelector('[data-confirm-demo-reset]')?.addEventListener('click',async()=>{
      const confirmButton=board.querySelector('[data-confirm-demo-reset]');
      if(!confirmButton)return;
      confirmButton.disabled=true;
      confirmButton.textContent='正在恢复…';
      try{
        await api('/api/enterprises/'+encodeURIComponent(selected.enterpriseId)+'/demo-reset',{method:'POST'});
        resetDialog?.close();
        root.dataset.acquisitionPath='upload';
        root.dataset.enterprisePage='2';
        delete root.dataset.revisionTier;
        await refresh('enterprise');
        host.showNotice?.('演示资料已清除，已回到重新上传起点。','success');
      }catch(error){
        host.showNotice?.(error.message,'error');
        confirmButton.disabled=false;
        confirmButton.textContent='确认恢复';
      }
    });
    board.querySelectorAll('[data-reopen-open]').forEach(button=>button.addEventListener('click',()=>{
      board.querySelector(`[data-reopen-form="${button.dataset.reopenOpen}"]`)?.toggleAttribute('hidden',false);
      button.hidden=true;
    }));
    board.querySelectorAll('[data-reopen-cancel]').forEach(button=>button.addEventListener('click',()=>{
      const form=button.closest('[data-reopen-form]');form?.toggleAttribute('hidden',true);form?.closest('.enterprise-history-item')?.querySelector('[data-reopen-open]')?.toggleAttribute('hidden',false);
    }));
    board.querySelectorAll('[data-reopen-form]').forEach(form=>form.addEventListener('submit',event=>submitReopenRequest(event,selected)));
    board.querySelectorAll('[data-direct-edit]').forEach(button=>button.addEventListener('click',()=>openDirectRevision(state,selected,button.dataset.directEdit)));
    const exitRevision=legacy?.querySelector('[data-cancel-direct-revision]');
    if(exitRevision)exitRevision.onclick=()=>{
      delete root.dataset.revisionTier;
      root.dataset.enterprisePage='0';
      renderEnterprise(state,selected);
      root.querySelector('[data-enterprise-page="0"]')?.focus();
      host.showNotice?.('已退出修改，未提交草稿保留；再次修改可继续填写。','success');
    };
    bindRetry(board,'enterprise');
    if(workflow.file&&(['3','4'].includes(page)||!page&&['awaiting_enterprise_confirmation','decision_ready','file_report_published'].includes(workflow.phase)))mountFiles(root,state,selected);
    else root.querySelector(':scope > [data-file-workspace]')?.setAttribute('hidden','');
  }

  function openDirectRevision(state,selected,tier){
    const root=document.querySelector('#enterprise');
    if(!root||!state.workflow.revisionPolicy?.directEditAllowed)return;
    root.dataset.revisionTier=tier;
    root.dataset.enterprisePage=tier==='tier0'?'1':'2';
    if(tier==='tier1')root.dataset.acquisitionPath='upload';
    root.querySelector('[data-enterprise-history-dialog]')?.close();
    renderEnterprise(state,selected);
    requestAnimationFrame(()=>root.querySelector(':scope > .enterprise-card:not([hidden])')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function enterpriseHomeMarkup(workflow,history,role,selected,acquisitionPath,page,evidence){
    const task=workflow.currentTask;
    const phases=['项目激活','填写企业信息','提供诊断资料','确认诊断事实','查看结论'];
    const phase=workflow.phase;
    const index=enterprisePhaseIndex(phase);
    const done=['closed','file_report_published'].includes(phase);
    const viewing=page===undefined?index:Number(page);
    const canResetDemo=role==='enterprise_owner'&&selected.enterpriseId==='qingshan';
    const own=task.actionable&&task.ownerRole!=='fde'&&!done;
    const messages={
      complete_admission:['填写企业信息','说明企业基本情况、主要问题和现有系统。提交后可以修改并保留版本。','继续填写'],
      complete_materials:['提供诊断资料','选择资料提供方式。已有系统可授权读取，文件可直接上传，也可以结合使用。','选择资料提供方式'],
      authorize_systems:['完成系统授权','审阅系统、字段与时间范围，确认本次只读授权。','审阅授权范围'],
      confirm_facts:['确认诊断事实','核对服务方提出的事实；存在例外或错误时，填写说明并提交。','核对诊断事实'],
      accept_outcome:['确认最终结果','查看本次执行结果，确认是否达到约定目标。','查看并确认结果'],
    };
    const waiting={read_batches:'等待服务方读取并校验数据',map_records:'等待服务方核对数据关联',run_diagnosis:'等待服务方分析诊断资料',review_materials:'等待服务方复核你提交的资料',record_decision:'等待服务方整理结论报告',execute_intervention:'等待服务方推进后续工作',invite_members:'等待服务方完成项目邀请'};
    const title=phase==='file_report_published'?'初筛报告已发布':done?'项目已完成':own?(messages[task.key]?.[0]||task.label):(waiting[task.key]||`等待${ROLE_LABELS[task.ownerRole]||'项目负责人'}处理`);
    const note=done?'你可以查看已提交资料和历史记录。':own?(messages[task.key]?.[1]||'按下方要求完成本次任务。'):`当前待办由服务方处理，你仍可回看、修改并提交资料新版本。${index<3?'诊断完成后，同企业成员均可确认诊断事实。':'处理完成后可查看相应结果。'}`;
    const latest=['tier0','tier1'].map(tier=>[...(history?.intakes||[])].filter(item=>item.tier===tier).sort((a,b)=>b.version-a.version)[0]).filter(Boolean);
    return `<ol class="enterprise-milestones" aria-label="项目进度">${phases.map((label,i)=>`<li ${i===index&&!done?'aria-current="step"':''} class="${done||i<index?'done':i===index?'current':'waiting'}"><span>${i+1}</span><div><button type="button" data-enterprise-page="${i}" aria-pressed="${viewing===i}">${label}</button><small>${done||i<index?'已完成':i>index?'待完成':own?'当前待办':'服务方或协作成员处理中'}</small></div></li>`).join('')}</ol>
      <section class="enterprise-current-task" aria-label="当前任务"><div><span class="unified-role">${esc(ROLE_LABELS[role]||role)}</span><h3>${esc(title)}</h3><p>${esc(note)}</p>${own&&messages[task.key]?.[2]?`<button class="primary-button" type="button" data-enterprise-primary>${messages[task.key][2]}</button>`:''}${taskContractMarkup(workflow,evidence,'enterprise')}</div></section>
      ${viewing===0?`<section><h3>项目激活信息</h3><p>${esc(selected.name)} · 当前企业账号已登录。同企业成员可使用全部企业端业务功能。</p></section>`:''}
      ${viewing===2?`<div class="enterprise-acquisition-actions" aria-label="资料提供方式">${[['connector','授权企业系统'],['upload','批量上传资料'],['both','两种方式结合']].map(([key,label])=>`<button type="button" class="quiet-button ${acquisitionPath===key?'is-active':''}" aria-pressed="${acquisitionPath===key}" data-acquisition-path="${key}">${label}</button>`).join('')}</div>${canResetDemo?`<div class="enterprise-demo-reset"><div><strong>重复演示</strong><span>清除当前已提交资料，回到可重新上传的起点。</span></div><div class="enterprise-demo-reset-actions"><a class="quiet-button" href="demo/real-delivery-simulation.csv" download>下载合成样本</a><button type="button" class="quiet-button" data-open-demo-reset>重置上传数据</button></div></div><dialog class="enterprise-demo-reset-dialog" data-demo-reset-dialog aria-labelledby="demo-reset-title"><form method="dialog"><span class="eyebrow">DEMO RESET</span><h3 id="demo-reset-title">重置当前演示项目？</h3><p>将清除本项目已提交的企业资料、上传文件和诊断产物，保留账号、成员与审计记录，并回到“批量上传资料”起点。</p><div class="enterprise-dialog-actions"><button type="submit" class="quiet-button">取消</button><button type="button" class="primary-button" data-confirm-demo-reset>确认恢复</button></div></form></dialog>`:''}`:''}
      ${viewing===3?'<p>核对已生成的诊断事实。尚未生成诊断时，请先提供资料并等待 FDE 诊断；不能提前确认。</p>':''}
      ${viewing===4?'<p>查看已发布结论及结果验收。尚未生成报告时，可返回补充资料；旧报告不会被新提交覆盖。</p>':''}
      <section class="enterprise-recent"><header><h4>最近提交</h4><button type="button" class="quiet-button" data-open-enterprise-history>查看资料与全部版本</button></header>${latest.length?latest.map(item=>`<div class="enterprise-recent-row"><strong>${item.tier==='tier0'?'企业信息':'诊断资料'}</strong><span>V${item.version} · ${esc(formatTime(item.createdAt))}</span><span>已提交</span></div>`).join(''):'<p>暂无提交记录。完成当前任务后，记录会显示在这里。</p>'}</section>
      <dialog class="enterprise-history-drawer" data-enterprise-history-dialog aria-label="资料与版本记录"><header><h3>资料与版本记录</h3><button type="button" class="quiet-button" data-close-enterprise-history>关闭</button></header><p>${esc(selected.name)} · ${esc(ROLE_LABELS[role]||role)}</p>${enterpriseHistoryMarkup(history,workflow,role)||'<p>暂无资料版本。</p>'}</dialog>`;
  }

  function prepareRevisionForm(legacy,tier,history){
    const form=legacy?.querySelector('#enterprise-detail form');
    if(!form)return;
    const latest=[...(history?.intakes||[])].filter(item=>item.tier===tier).sort((a,b)=>b.version-a.version)[0];
    if(!latest)return;
    // Hydrate each editor once. Background state updates must not overwrite drafts.
    if(form.dataset.revisionHydrated===tier)return;
    form.dataset.revisionHydrated=tier;
    const detail=legacy.querySelector('#enterprise-detail');
    if(!detail.querySelector('.direct-revision-note'))detail.insertAdjacentHTML('afterbegin',`<div class="direct-revision-note" role="status"><div><strong>正在修改版本 ${latest.version}</strong><span>重新提交后生成版本 ${latest.version+1}，旧版本保留。</span></div><button type="button" class="quiet-button" data-cancel-direct-revision>退出修改</button></div>`);
    const payload=tier==='tier0'?latest.payload:Array.isArray(latest.payload)?latest.payload:[];
    if(tier==='tier0'){
      Object.entries(payload||{}).forEach(([name,value])=>setFormValue(form,name,value));
      const roles=String(payload?.decisionMaker||'').split(/[、,，]/).map(value=>value.trim()).filter(Boolean);
      form.querySelectorAll('[name="decisionMakerRole"]').forEach(input=>{input.checked=roles.includes(input.value);input.dispatchEvent(new Event('change',{bubbles:true}));});
    }else{
      const first=payload[0]||{};
      const artifactIds=[...new Set(payload.flatMap(item=>item.artifactIds||[]))];
      form.dataset.existingArtifactIds=JSON.stringify(artifactIds);
      form.dataset.existingArtifactName=String(first.artifactName||'已上传材料');
      if(artifactIds.length)form.querySelectorAll('input[type="file"]').forEach(input=>{input.required=false;});
      const kinds=new Set(payload.map(item=>item.kind));
      form.querySelectorAll('[name="evidence-kind"]').forEach(input=>{input.checked=kinds.has(input.value);});
      for(const item of payload){setFormValue(form,`artifact-${item.kind}`,item.artifactName);setFormValue(form,`source-${item.kind}`,item.sourceSystem);setFormValue(form,`period-${item.kind}`,item.period);setFormValue(form,`note-${item.kind}`,item.verificationNote);}
      const commonPeriod=form.querySelector('.evidence-package-common select[name^="period-"]')||form.querySelector('select[name^="period-"]');
      if(first.period&&commonPeriod)setFormValue(form,commonPeriod.name,first.period);
      const commonReview=form.querySelector('.evidence-package-common [name="verificationNote"]');
      if(first.verificationNote&&commonReview){
        commonReview.value=String(first.verificationNote);
        commonReview.dispatchEvent(new Event('input',{bubbles:true}));
        const trigger=commonReview.closest('.choice-field')?.querySelector('.choice-trigger');
        if(trigger){trigger.textContent=`已选：${first.verificationNote}`;trigger.title=String(first.verificationNote);}
      }
    }
  }

  function setFormValue(form,name,value){
    const control=form.elements.namedItem(name);
    if(!control||typeof value==='object')return;
    if(control.tagName==='SELECT'&&![...control.options].some(option=>option.value===String(value))){const option=document.createElement('option');option.value=String(value);option.textContent=String(value);option.dataset.revisionValue='true';control.append(option);}
    control.value=String(value);
    control.dispatchEvent(new Event('input',{bubbles:true}));
    control.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function activateLegacy(tier){
    const detail=document.querySelector('#enterprise-detail');
    const expectedForm=tier==='tier0'?'form:has([name="industry"])':'form.tier1-form';
    if(!detail?.querySelector(expectedForm)){
      if(host.openEnterpriseTier)host.openEnterpriseTier(tier);
      else document.querySelector(`[data-tier-action="${tier}"]`)?.click();
    }
    window.fdeEnhanceEnterprise?.();
  }

  function limitConnectorStages(panel,phase){
    const stages=[...panel.querySelectorAll('.enterprise-connector-stage')];
    stages.forEach(stage=>stage.hidden=true);
    let target=-1;
    if(['collecting_evidence','awaiting_authorization'].includes(phase))target=0;
    else if(['diagnosis_generated','awaiting_enterprise_confirmation'].includes(phase))target=1;
    else if(['observing','closed'].includes(phase))target=stages.length-1;
    if(stages[target]){stages[target].hidden=false;if(stages[target].dataset.userControlled!=='true')stages[target].open=true;}
    panel.querySelector('.enterprise-shared-decision')?.toggleAttribute('hidden',!['observing','closed'].includes(phase));
  }

  function flowInspectorMarkup(stage,status,workflow,evidence){
    const detail=flowStageDetail(stage,status,workflow,evidence);
    const action=status==='locked'?'等待前置步骤完成':mainFlowEntryLabel(stage,status);
    return `<section id="flow-stage-inspector" class="main-flow-inspector" data-flow-inspector="${stage.key}" aria-live="polite"><div><span class="eyebrow">STEP ${MAIN_FLOW.indexOf(stage)+1} · ${esc(FLOW_STATUS_LABELS[status]||'')}</span><h5>${esc(stage.label)}</h5><p>${esc(stage.note)} · 责任：${esc(stage.owner)}</p></div><dl><div><dt>前置</dt><dd>${esc(detail.precondition)}</dd></div><div><dt>可执行动作</dt><dd>${esc(action)}</dd></div><div><dt>服务端状态</dt><dd>${esc(detail.serviceStatus)}</dd></div><div><dt>下一步</dt><dd>${esc(detail.next)}</dd></div><div><dt>失败 / 补充</dt><dd>${esc(detail.failure)}</dd></div></dl>${stage.key==='escalation'?escalationChainMarkup(workflow,evidence):''}</section>`;
  }
  function escalationChainMarkup(workflow,evidence){
    const missing=(evidence.missing||[]).map(item=>DIMENSION_LABELS[item]||item);
    const connectorState=workflow.connector?.status||'';
    const signal=evidence.pendingReview?`${evidence.pendingReview} 份材料待复核`:missing.length?`${missing.join('、')}存在证据缺口`:['failed','quarantined','paused'].includes(connectorState)?`连接器状态异常：${connectorState}`:'未检测到强制升级信号';
    const reason=missing.length?'当前材料不足以独立复核企业说法':evidence.pendingReview?'未复核材料不能进入诊断':'仅在异常信号或明确高意向时开放深度材料';
    const supplement=missing.length?`优先补充：${missing.join('、')}`:'按触发原因补充最小范围材料，不收全量数据';
    return `<ol class="escalation-trigger-chain" aria-label="异常升级触发闭环"><li><span>1</span><div><strong>检测信号</strong><small>${esc(signal)}</small></div></li><li><span>2</span><div><strong>说明原因</strong><small>${esc(reason)}</small></div></li><li><span>3</span><div><strong>限定补充</strong><small>${esc(supplement)}</small></div></li><li><span>4</span><div><strong>生成新版本并重跑</strong><small>FDE 批准指定阶段后，企业补交；旧版本保留只读。</small></div></li><li><span>5</span><div><strong>双方确认</strong><small>企业流程负责人确认事实，FDE 冻结新决策与报告。</small></div></li></ol>`;
  }
  function mainFlowEntryLabel(stage,status){
    if(['escalation','supplement'].includes(stage.key))return status==='optional'?'查看条件':status==='done'?'查看记录':'申请补充';
    return {evidence:'查看记录',diagnosis:'查看诊断',confirmation:'查看确认',decision:'查看报告'}[stage.key]||(status==='current'?'查看当前':status==='done'?'查看详情':status==='available'?'查看要求':status==='optional'?'查看条件':'锁定');
  }
  function defaultMainFlowStage(workflow,statuses){
    if(['intervention_active','observing','closed'].includes(workflow.phase))return MAIN_FLOW.find(stage=>stage.key==='decision');
    return MAIN_FLOW.find(stage=>statuses.get(stage.key)==='current')||[...MAIN_FLOW].reverse().find(stage=>statuses.get(stage.key)==='done')||MAIN_FLOW.find(stage=>statuses.get(stage.key)==='available')||MAIN_FLOW[0];
  }
  function mainFlowMarkup(workflow,evidence,view){
    const statuses=new Map(MAIN_FLOW.map(stage=>[stage.key,flowStageStatus(stage,workflow,evidence)]));
    const selectionKey=`${workflow.enterpriseId}:${view}`;
    const savedKey=flowSelections.get(selectionKey);
    const savedStage=MAIN_FLOW.find(stage=>stage.key===savedKey&&statuses.get(stage.key)!=='locked');
    const defaultStage=savedStage||defaultMainFlowStage(workflow,statuses);
    const requiredStages=MAIN_FLOW.filter(stage=>!['escalation','supplement'].includes(stage.key));
    const requiredCompleted=requiredStages.filter(stage=>statuses.get(stage.key)==='done').length;
    const onDemandOpen=['escalation','supplement'].filter(key=>['available','current'].includes(statuses.get(key))).length;
    const savedMacro=MACRO_FLOW.find(group=>group.key===macroSelections.get(selectionKey));
    const activeMacro=savedMacro||MACRO_FLOW.find(group=>group.stages.includes(defaultStage.key))||MACRO_FLOW[0];
    const currentStage=activeMacro.stages.includes(defaultStage.key)?defaultStage:MAIN_FLOW.find(stage=>activeMacro.stages.includes(stage.key)&&statuses.get(stage.key)!=='locked')||MAIN_FLOW.find(stage=>stage.key===activeMacro.stages[0]);
    const macroStatus=group=>{const values=group.stages.map(key=>statuses.get(key));return values.every(value=>value==='done')?'done':values.some(value=>['current','available'].includes(value))?'current':values.some(value=>value==='done')?'current':'locked';};
    const tabs=MACRO_FLOW.map((group,index)=>`<button type="button" class="macro-flow-tab ${macroStatus(group)} ${group.key===activeMacro.key?'active':''}" data-macro-phase="${group.key}" aria-selected="${group.key===activeMacro.key}" aria-controls="macro-flow-${group.key}"><span>${index+1}</span><strong>${esc(group.label)}</strong><small>${view==='enterprise'?(group.key===activeMacro.key?'正在查看':macroStatus(group)==='done'?'已完成':macroStatus(group)==='current'?'进行中':'待前置'):esc(group.note)}</small></button>`).join('');
    const panes=MACRO_FLOW.map(group=>`<section id="macro-flow-${group.key}" class="main-flow-group macro-flow-pane" data-flow-group="${group.key}" ${group.key===activeMacro.key?'':'hidden'}><header><div><strong>${esc(group.label)}</strong><small>${esc(group.note)}</small></div><span>${group.stages.filter(key=>statuses.get(key)==='done').length}/${group.stages.length}</span></header><div class="main-flow-rail">${group.stages.map(key=>{
      const stage=MAIN_FLOW.find(item=>item.key===key);
      const status=statuses.get(stage.key);
      const selected=stage.key===currentStage.key;
      const action=mainFlowEntryLabel(stage,status);
      const statusLabel=FLOW_STATUS_LABELS[status]||status;
      return `<button type="button" class="main-flow-chip ${status}${selected?' selected':''}" data-flow-entry="${stage.entry}" data-flow-stage="${stage.key}" aria-label="${esc(`${stage.label}，${action}，${statusLabel}`)}" aria-controls="flow-stage-inspector" aria-expanded="${selected}" ${status==='current'?'aria-current="step"':''} ${status==='locked'?'disabled':''}><span>${MAIN_FLOW.indexOf(stage)+1}</span><strong>${esc(stage.label)}</strong><em>${esc(action)}</em></button>`;
    }).join('')}</div>${group.stages.includes(currentStage.key)?flowInspectorMarkup(currentStage,statuses.get(currentStage.key),workflow,evidence):''}</section>`).join('');
    const onDemandLabel=onDemandOpen?`${onDemandOpen} 个按需入口可用`:'按需步骤未触发';
    const title=view==='enterprise'?'我的项目任务':'企业诊断项目主流程';
    const note=view==='enterprise'?'按阶段找到当前任务；页面一次只展示一个阶段和一个主要动作。':'只展开当前宏阶段；具体步骤、前置条件和失败路径在同一区域查看。';
    return `<section class="main-flow ${view==='enterprise'?'enterprise-task-map':''}" aria-label="企业诊断项目主流程"><header><div><h4>${title}</h4><p>${note}</p></div><div class="main-flow-summary"><span class="main-flow-count">必经步骤 ${requiredCompleted}/${requiredStages.length}</span><small>${onDemandLabel} · 当前项目：${esc(workflowPhaseLabel(workflow))}</small></div></header><nav class="macro-flow-tabs" aria-label="五个项目阶段">${tabs}</nav><div class="main-flow-groups">${panes}</div></section>`;
  }
  function flowStageStatus(stage,workflow,evidence){
    if(workflow.acquisitionPath==='upload'&&stage.key==='authorization')return evidence.readyForSubmission?'done':'locked';
    if(workflow.acquisitionPath==='upload'&&stage.key==='evidence')return evidence.readyForDiagnosis&&!evidence.pendingReview?'done':evidence.readyForSubmission?'current':'locked';
    const taskStatus=key=>workflow.tasks.find(item=>item.key===key)?.status||'locked';
    const groupStatus=keys=>{const states=keys.map(taskStatus);if(states.length&&states.every(item=>item==='done'))return 'done';if(states.includes('current'))return 'current';if(states.some(item=>item==='done'))return 'current';return 'locked';};
    if(stage.key==='identity')return workflow.members>0?'done':workflow.invitations>0?'current':'locked';
    if(stage.key==='acquisition')return evidence.readyForSubmission?'done':taskStatus('complete_materials');
    if(stage.key==='authorization')return groupStatus(['authorize_systems']);
    if(stage.key==='evidence')return groupStatus(['review_materials','map_records']);
    if(stage.key==='escalation')return evidence.pendingReview||evidence.missing.length?'available':'optional';
    if(stage.key==='supplement'){
      const requests=workflow.history?.requests||[];
      const hasActiveRequest=requests.some(item=>['pending','approved'].includes(item.status));
      const hasSubmittedVersion=Boolean(workflow.history?.intakes?.length||workflow.history?.evidencePackages?.length);
      return workflow.reopen?.tier||hasActiveRequest?'current':hasSubmittedVersion?'available':'optional';
    }
    return groupStatus([stage.task]);
  }
  function flowStageDetail(stage,status,workflow,evidence){const index=MAIN_FLOW.findIndex(item=>item.key===stage.key);const next=MAIN_FLOW[index+1]?.label||'进入介入执行与结果观察';const details={
    invite:['FDE 已建立企业项目。','邀请成员',next,'邀请过期或撤销后，由 FDE 重新生成一次性邀请。'],
    identity:['邀请链接有效；企业成员完成岗位激活。','企业身份已建立',next,'激活失败或账号停用时，回到成员与邀请重新处理。'],
    admission:['企业账号已激活；流程负责人具备提交权限。','每次提交生成新版本并同步给 FDE',next,'决策冻结前可直接修改；冻结后才进入受控补充与重跑。'],
    acquisition:['准入自述已提交；企业选择连接器或上传路径。','资料采集方式待服务端接收材料后确认',next,'没有系统接口时走批量上传，不要求企业重复填写来源系统。'],
    authorization:['授权范围完成预览，或已准备脱敏文件。','授权 / 文件版本可追溯',next,'授权拒绝、过期或文件不合格时重新预览、重传，历史不覆盖。'],
    evidence:['已有提交材料或已接受读取批次。','批次、校验和映射状态由服务端记录',next,'待复核材料、缺主键或映射冲突会隔离并进入补充路径。'],
    escalation:['发现证据缺口、异常信号或企业明确高意向。','异常升级为按需状态，不是默认必填',next,'未触发时不收深度材料；触发后需登记原因和申请范围。'],
    diagnosis:['映射已确认；规则版本和输入批次已冻结。','规则运行结果与版本写入审计',next,'缺输入只跳过并说明，不把未知当成违规或零分。'],
    confirmation:['诊断已生成；企业流程负责人可逐项确认。','企业确认结果独立留痕',next,'否认、部分确认或请求补证会锁住决策并生成新版本。'],
    decision:['关键事实已确认；FDE 填写决策理由。','决策快照与报告版本已冻结',next,'没有理由或事实未确认时，服务端拒绝冻结正式决策。'],
    supplement:['FDE 决策已冻结，且企业发现事实需要更正。','冻结后的补充申请由企业提出、FDE 审核',next,'决策冻结前无需申请；冻结后批准时只开放指定阶段。'],
  }[stage.key]||['由上一阶段完成后开放。',workflowPhaseLabel(workflow),next,'保留当前版本并走人工复核。'];return {precondition:details[0],serviceStatus:`${details[1]} · 当前阶段 ${workflowPhaseLabel(workflow)} · ${FLOW_STATUS_LABELS[status]||status}`,next:details[2],failure:details[3]};}
  function governanceMarkup(workflow,evidence,view){const current=workflow.currentTask||{};const next=workflow.nextTask;const connectorStatus=workflow.connector?.status||workflow.phase;const preconditions={invite_members:'已创建企业项目；由 FDE 发送岗位邀请。',complete_admission:'企业账号已激活；当前岗位具备提交权限。',complete_materials:'准入自述已提交；选择连接器或准备脱敏材料。',review_materials:'企业已提交材料；服务端已建立版本。',authorize_systems:'企业已提交授权预览；系统授权人确认范围。',read_batches:'来源授权有效；读取动作由 FDE 执行。',map_records:'至少一个来源批次已验收；关键主键可用。',run_diagnosis:'映射已确认；规则版本和输入批次已冻结。',confirm_facts:'诊断已生成；企业流程负责人逐项确认。',record_decision:'关键事实已确认；FDE 填写决策理由。',execute_intervention:'FDE 决策已冻结；介入方案已建立。',accept_outcome:'至少有一个可复核观察指标。'}[current.key]||'由服务端当前任务状态决定。';const failure=workflow.reopen?.tier?`当前存在${workflow.reopen.stage?.label||workflow.reopen.tier}补充申请，旧版本保持只读。`:evidence.pendingReview?`有 ${evidence.pendingReview} 份材料待服务方复核，未复核内容不会进入诊断。`:['failed','quarantined','paused'].includes(connectorStatus)?`当前系统状态为${PHASE_LABELS[connectorStatus]||connectorStatus}，请走重试、修复或重新授权路径。`:'若证据不足、映射冲突或读取失败，系统保留旧版本并进入补充/重跑路径。';return `<section class="flow-governance"><header><div><span class="eyebrow">TASK CONTRACT</span><h4>当前步骤操作契约</h4></div><span class="flow-service-status">服务端状态：${esc(PHASE_LABELS[workflow.phase]||workflow.phase)}</span></header><div class="flow-governance-grid"><div><span>前置条件</span><strong>${esc(preconditions)}</strong></div><div><span>可执行动作</span><strong>${current.actionable?esc(current.label):`等待${esc(ROLE_LABELS[current.ownerRole]||current.ownerRole)}处理`}</strong></div><div><span>下一步出口</span><strong>${esc(next?.label||'当前流程已到末端')}</strong></div><div><span>失败 / 补充路径</span><strong>${esc(failure)}</strong></div></div></section>`;}
  function activityMarkup(activity=[]){if(!activity.length)return '<section class="flow-activity"><header><span class="eyebrow">AUDIT TRAIL</span><h4>审计活动</h4></header><p>当前项目还没有可展示的审计事件。</p></section>';return `<section class="flow-activity"><header><div><span class="eyebrow">AUDIT TRAIL</span><h4>最近审计活动</h4></div><span>服务端记录 · ${activity.length} 条</span></header><ol>${activity.slice(0,6).map(item=>`<li><strong>${esc(item.action)}</strong><span>${esc(item.decision)} · ${esc(ROLE_LABELS[item.role]||item.role||'系统')}</span><small>${esc(formatTime(item.createdAt))} · ${esc(item.reason)}</small></li>`).join('')}</ol></section>`;}
  function focusEnterpriseStage(board,stage){
    const root=document.querySelector('#enterprise');
    if(!root)return;
    if(stage==='invite'||stage==='identity'){
      const history=board.querySelector('.enterprise-history');
      if(history){history.scrollIntoView({behavior:'smooth',block:'start'});history.querySelector('.enterprise-history-item')?.toggleAttribute('open',true);host.showNotice?.('已定位到“已提交内容、版本与补充申请”。','success');}
      else host.showNotice?.('当前还没有提交记录；完成企业身份确认后会在这里生成记录。','warning');
      return;
    }
    if(stage==='supplement'){
      const item=[...board.querySelectorAll('.enterprise-history-item:not(.request-only)')][0];
      if(!item){host.showNotice?.('当前还没有可申请补充的已提交版本。','error');return;}
      item.open=true;
      const openButton=item.querySelector('[data-reopen-open]');
      if(openButton){openButton.click();}
      item.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const connector=root.querySelector('.enterprise-connector-panel');
    const history=board.querySelector('.enterprise-history');
    const target=connector||history;
    if(target){target.scrollIntoView({behavior:'smooth',block:'start'});connector?.querySelector('.enterprise-connector-stage:not([hidden])')?.toggleAttribute('open',true);host.showNotice?.(stage==='evidence'?'已定位到系统接入与批次记录。':'已定位到企业协作记录。','success');}
    else host.showNotice?.('当前页面还没有可查看的企业记录，请等待服务端状态就绪。','warning');
  }
  function updateFlowInspector(board,stage,workflow,evidence){if(!stage)return null;board.querySelector('.main-flow-inspector')?.remove();let selectedChip=null;board.querySelectorAll('.main-flow-chip').forEach(chip=>{const selected=chip.dataset.flowStage===stage.key;if(selected)selectedChip=chip;chip.classList.toggle('selected',selected);chip.setAttribute('aria-expanded',String(selected));});const group=selectedChip?.closest('.main-flow-group');if(!group)return null;group.insertAdjacentHTML('beforeend',flowInspectorMarkup(stage,flowStageStatus(stage,workflow,evidence),workflow,evidence));return group.querySelector('.main-flow-inspector');}
  function bindFlowEntries(board,state,selected,view){const selectionKey=`${state.workflow.enterpriseId}:${view}`;board.querySelectorAll('[data-macro-phase]').forEach(button=>button.addEventListener('click',()=>{const macro=MACRO_FLOW.find(item=>item.key===button.dataset.macroPhase);if(!macro)return;macroSelections.set(selectionKey,macro.key);board.querySelectorAll('[data-macro-phase]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));});board.querySelectorAll('.macro-flow-pane').forEach(pane=>{pane.hidden=pane.dataset.flowGroup!==macro.key;});const selectedStage=MAIN_FLOW.find(stage=>macro.stages.includes(stage.key)&&flowStageStatus(stage,state.workflow,state.evidence)!=='locked')||MAIN_FLOW.find(stage=>stage.key===macro.stages[0]);if(selectedStage){flowSelections.set(selectionKey,selectedStage.key);updateFlowInspector(board,selectedStage,state.workflow,state.evidence);}}));board.querySelectorAll('[data-flow-entry]').forEach(button=>button.addEventListener('click',()=>{const stage=button.dataset.flowStage;if(button.disabled)return;const selectedStage=MAIN_FLOW.find(item=>item.key===stage);flowSelections.set(selectionKey,stage);const macro=MACRO_FLOW.find(item=>item.stages.includes(stage));if(macro)macroSelections.set(selectionKey,macro.key);const inspector=updateFlowInspector(board,selectedStage,state.workflow,state.evidence);if(view==='project'){requestAnimationFrame(()=>inspector?.scrollIntoView({behavior:'smooth',block:'nearest'}));return;}if(view==='enterprise'){
      if(['acquisition','authorization'].includes(stage)){document.querySelector('#enterprise').dataset.acquisitionPath=stage==='authorization'?'connector':'upload';renderEnterprise(state,selected);return;}
      if(stage==='admission'){document.querySelector('[data-tier-action="tier0"]')?.click();return;}
      if(stage==='acquisition'){document.querySelector('[data-tier-action="tier1"]')?.click();return;}
      focusEnterpriseStage(board,stage);return;
    }
    if(button.dataset.flowEntry==='reports'){host.setActiveReportType?.(stage==='decision'?'decision':'process');host.setView('reports');host.refreshReports?.();return;}if(button.dataset.flowEntry==='project'){const sections={invite:'overview',evidence:'mappings',diagnosis:'diagnosis',decision:'decision'};host.setActiveProjectSection(sections[stage]||'overview');host.setView('project');host.refreshProject();return;}const root=document.querySelector('#enterprise');if(!root)return;if(['acquisition','authorization'].includes(stage))root.dataset.acquisitionPath=stage==='authorization'?'connector':'upload';if(stage==='admission')document.querySelector('[data-tier-action="tier0"]')?.click();if(stage==='acquisition')document.querySelector('[data-tier-action="tier1"]')?.click();if(stage==='supplement')root.querySelector('.enterprise-history')?.scrollIntoView({behavior:'smooth',block:'start'});renderEnterprise(state,selected);}));}
  function acquisitionMarkup(evidence,selectedPath){return `<section class="acquisition-choice"><div><span class="eyebrow">MATERIAL ACQUISITION</span><h4>补充诊断材料</h4><p>已有业务系统优先选择只读连接；截图、表格、文档和导出文件统一批量补充。系统自动记录来源，五项仅用于显示诊断覆盖。</p></div><div class="acquisition-grid">${evidence.acquisitionPaths.map(path=>`<button type="button" class="${selectedPath===path.key?'is-active':''}" aria-pressed="${selectedPath===path.key}" data-acquisition-path="${path.key}"><strong>${esc(path.label)}</strong><span>${esc(path.description)}</span><em>${selectedPath===path.key?'当前方式':'进入 →'}</em></button>`).join('')}</div></section>`;}
  function coverageMarkup(evidence){return `<section class="evidence-coverage"><div class="coverage-head"><div><span class="eyebrow">DIAGNOSTIC COVERAGE</span><h4>当前证据覆盖</h4></div><span>${evidence.readyForDiagnosis?'已达到诊断条件':evidence.readyForSubmission?'已提交，等待复核':'仍需补充核心材料'}</span></div><div class="coverage-grid">${Object.values(evidence.dimensions).map(item=>`<article class="${item.status}"><span>${esc(DIMENSION_LABELS[item.key]||item.label)}</span><strong>${esc(STATUS_LABELS[item.status]||item.status)}</strong><small>${item.verifiedCount} 已验证 · ${item.submittedCount} 已提交</small></article>`).join('')}</div><p>${esc(evidence.boundary)}</p></section>`;}
  function reviewMarkup(evidence){const pending=evidence.files.filter(item=>item.validationStatus==='pending_review');return `<section class="artifact-review"><div><span class="eyebrow">FDE REVIEW QUEUE</span><h4>补充材料复核</h4><p>上传成功不等于机器已理解。CSV/JSON 仅表示可预览结构，其他文件明确进入人工复核。</p></div>${pending.length?pending.map(item=>`<article><div><strong>${esc(item.name)}</strong><span>${esc(parserLabel(item.parserStatus))} · ${esc(item.period||'时间范围未提供')}</span><small>${esc(item.verificationNote||'未填写复核重点')}</small></div><label>复核依据<input data-review-note="${item.id}" value="材料与复核重点一致，可作为本轮初筛证据。" minlength="4"></label><div><button type="button" class="quiet-button" data-review-artifact="${item.id}" data-review-status="rejected">退回补充</button><button type="button" class="primary-button" data-review-artifact="${item.id}" data-review-status="verified">确认可用</button></div></article>`).join(''):'<div class="unified-empty">没有待复核材料。</div>'}</section>`;}
  function assignmentMarkup(task){return `<form class="task-assignment" data-task-assignment data-task-key="${esc(task.key)}"><label>责任岗位<select name="ownerRole">${Object.entries(ROLE_LABELS).filter(([value])=>value!=='enterprise_owner').map(([value,label])=>`<option value="${value}" ${value===task.ownerRole?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>截止时间<input type="datetime-local" name="dueAt" value="${task.dueAt?esc(task.dueAt.slice(0,16)):''}"></label><label class="wide">任务说明<input name="note" maxlength="300" value="${esc(task.note||'')}"></label><button type="submit" class="quiet-button">保存指派</button><p aria-live="polite"></p></form>`;}
  function timelineMarkup(tasks){return `<ol class="unified-timeline">${tasks.map((task,index)=>`<li class="${task.status}" ${task.status==='current'?'aria-current="step"':''}><span>${task.status==='done'?'✓':index+1}</span><div><strong>${esc(task.label)}</strong><small>${esc(ROLE_LABELS[task.ownerRole]||task.ownerRole)}</small></div></li>`).join('')}</ol>`;}
  function historyValue(value){
    const labels={industry:'行业',employeeRange:'员工规模',revenueRange:'营收区间',coreSystemCloud:'系统部署方式',painPoints:'主要问题',systemLedger:'现有系统',decisionMaker:'协作岗位',budgetRange:'预算情况',targetCycle:'期望周期',kind:'复核用途',artifactName:'材料名称',sourceSystem:'材料来源',period:'时间范围',verificationNote:'复核说明'};
    if(Array.isArray(value))return value.length?value.map(historyValue).join('\n'):'未填写';
    if(value&&typeof value==='object')return Object.entries(value).filter(([key])=>labels[key]).map(([key,item])=>`${labels[key]}：${key==='kind'?(DIMENSION_LABELS[item]||item):historyValue(item)}`).join('\n');
    return value==='manual_upload'?'文件上传':String(value||'未填写');
  }
  function historyItemMarkup(item,requests,isLatest,{directEditAllowed=false,canEdit=false}={}){const request=requests.find(row=>row.tier===item.tier&&['pending','approved'].includes(row.status));const impact=item.tier==='tier0'?'新版本会更新企业基本盘与采集方向。':'新版本会更新本轮材料范围；已冻结决策需重新诊断。';let action='<span class="history-readonly">历史版本只读</span>';if(isLatest&&request&&!directEditAllowed)action=`<span class="reopen-status">${esc(request.status==='approved'?'已获 FDE 授权，正在等待重新提交':'补充申请待 FDE 审核')}</span>`;else if(isLatest&&directEditAllowed&&canEdit)action=`<button type="button" class="quiet-button" data-direct-edit="${item.tier}">修改并生成新版本</button>`;else if(isLatest&&!directEditAllowed&&canEdit)action=`<button type="button" class="quiet-button" data-reopen-open="${item.tier}">申请补充 / 重跑</button><form class="reopen-request-form" data-reopen-form="${item.tier}" hidden><label>补充原因<textarea name="reason" rows="3" minlength="4" required placeholder="说明为什么需要改动已冻结结论所依据的内容。"></textarea></label><div><button type="submit" class="primary-button">提交补充申请</button><button type="button" class="quiet-button" data-reopen-cancel>取消</button></div><p aria-live="polite"></p></form>`;return `<details class="enterprise-history-item" data-history-key="${esc(`${item.tier}-${item.version}`)}"><summary><strong>${esc(item.tier==='tier0'?'准入自述':'诊断材料')}</strong><span class="history-version-state ${isLatest?'current':'superseded'}">${isLatest?'最新提交':'历史版本'}</span><span>V${item.version} · ${esc(formatTime(item.createdAt))}</span></summary><div class="enterprise-history-body"><p>${esc(historyValue(item.payload))}</p><small class="history-impact">变更影响：${esc(impact)}</small>${action}</div></details>`;}
  function enterpriseHistoryMarkup(history,workflow,role){const source=history||{intakes:[],evidencePackages:[],requests:[]};const requests=source.requests||[];const visible=(source.intakes||[]).filter(item=>['tier0','tier1'].includes(item.tier)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||b.version-a.version);const latestByTier=new Map();for(const item of visible){if(!latestByTier.has(item.tier))latestByTier.set(item.tier,item.version);}if(!visible.length&&!requests.length)return '';const canEdit=role.startsWith('enterprise_');const directEditAllowed=Boolean(workflow.revisionPolicy?.directEditAllowed);return `<section class="enterprise-history" tabindex="-1"><header><div><h4>已提交内容、版本与补充申请</h4><p>${esc(workflow.revisionPolicy?.reason||'每次提交保留版本和时间。')}</p></div></header>${visible.map(item=>historyItemMarkup(item,requests,latestByTier.get(item.tier)===item.version,{directEditAllowed,canEdit})).join('')}${requests.filter(item=>!visible.some(version=>version.tier===item.tier)).map(item=>`<div class="enterprise-history-item request-only"><strong>${esc(item.stage?.label||item.tier)}</strong><span>${esc(item.status==='pending'?'补充申请待 FDE 审核':item.status==='approved'?'已授权补充':item.status)}</span></div>`).join('')}</section>`;}
  function projectVersionHistoryMarkup(history){const source=history||{intakes:[],requests:[]};const latestIntake=[...(source.intakes||[])].filter(item=>item.tier==='tier0').sort((a,b)=>b.version-a.version)[0];const latestEvidence=[...(source.intakes||[])].filter(item=>item.tier==='tier1').sort((a,b)=>b.version-a.version)[0];const pending=(source.requests||[]).filter(item=>['pending','approved'].includes(item.status));const version=(item)=>item?`V${item.version} · ${formatTime(item.createdAt)}`:'尚未提交';return `<details class="workflow-management project-version-history"><summary>企业最新提交版本</summary><div class="project-version-grid"><div><span>准入自述</span><strong>${esc(version(latestIntake))}</strong></div><div><span>诊断材料</span><strong>${esc(version(latestEvidence))}</strong></div><div><span>待处理补充</span><strong>${pending.length?`${pending.length} 项`:'无'}</strong></div></div><p>FDE 以最新提交版本为准；决策冻结前企业可直接修订，冻结后才进入受控补充与重跑。</p></details>`;}
  function reopenReviewMarkup(requests){const pending=requests.filter(item=>item.status==='pending');if(!pending.length)return '';return `<section class="reopen-review"><header><div><span class="eyebrow">CONTROLLED REOPEN</span><h4>企业补充申请</h4><p>只开放申请指定的阶段；批准后旧版本仍保留，重新提交后自动关闭授权。</p></div></header>${pending.map(item=>`<article><div><strong>${esc(item.stage?.label||item.tier)}</strong><p>${esc(item.reason)}</p><small>基于版本 ${item.baseVersion} · ${esc(item.requestedAt||'')}</small></div><div><button type="button" class="primary-button" data-reopen-decision="${item.id}" data-decision="approved">批准开放</button><button type="button" class="quiet-button" data-reopen-decision="${item.id}" data-decision="rejected">驳回</button></div></article>`).join('')}</section>`;}
  function loadingMarkup(){return '<div class="unified-loading" role="status">正在读取项目工作流…</div>';}
  function errorMarkup(message){return `<div class="unified-error" role="alert"><strong>工作流读取失败</strong><span>${esc(message)}</span><button type="button" class="quiet-button" data-unified-retry>重试</button></div>`;}
  function bindRetry(root,view){root.querySelector('[data-unified-retry]')?.addEventListener('click',()=>refresh(view));}
  async function assignTask(event,state,selected){event.preventDefault();const form=event.currentTarget,status=form.querySelector('p'),button=form.querySelector('button');button.disabled=true;status.textContent='正在保存…';try{await api(`/api/enterprises/${encodeURIComponent(selected.enterpriseId)}/project-tasks/${encodeURIComponent(form.dataset.taskKey)}`,{method:'PATCH',body:{ownerRole:form.elements.ownerRole.value,dueAt:form.elements.dueAt.value||null,note:form.elements.note.value}});status.textContent='指派已保存';await refresh('project',{silent:true});}catch(error){status.textContent=`保存失败：${error.message}`;}finally{button.disabled=false;}}
  async function reviewArtifact(button,state,selected){const note=button.closest('article').querySelector(`[data-review-note="${button.dataset.reviewArtifact}"]`);button.disabled=true;try{await api(`/api/enterprises/${encodeURIComponent(selected.enterpriseId)}/unified-evidence/artifacts/${encodeURIComponent(button.dataset.reviewArtifact)}/review`,{method:'POST',body:{status:button.dataset.reviewStatus,note:note.value}});host.showNotice(button.dataset.reviewStatus==='verified'?'材料已确认为可用证据。':'材料已退回补充。',button.dataset.reviewStatus==='verified'?'success':'error');await refresh('project',{silent:true});}catch(error){host.showNotice(`复核未保存：${error.message}`,'error');button.disabled=false;}}
  async function submitReopenRequest(event,selected){event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button[type="submit"]');button.disabled=true;try{await api(`/api/enterprises/${encodeURIComponent(selected.enterpriseId)}/reopen-requests`,{method:'POST',body:{tier:form.dataset.reopenForm,reason:form.elements.reason.value}});host.showNotice('补充申请已提交，等待 FDE 审核。','success');await refresh('enterprise',{silent:true});}catch(error){host.showNotice(`补充申请未提交：${error.message}`,'error');button.disabled=false;}}
  async function decideReopen(button,selected,view){button.disabled=true;try{await api(`/api/enterprises/${encodeURIComponent(selected.enterpriseId)}/reopen-requests/${encodeURIComponent(button.dataset.reopenDecision)}/decision`,{method:'POST',body:{decision:button.dataset.decision,expiresInHours:72}});host.showNotice(button.dataset.decision==='approved'?'已批准指定阶段重新补充。':'已驳回补充申请。',button.dataset.decision==='approved'?'success':'error');await refresh(view,{silent:true});}catch(error){host.showNotice(`补充申请处理失败：${error.message}`,'error');button.disabled=false;}}
  function taskGuidance(key){return {invite_members:'先创建并发送对应岗位的一次性激活链接。',complete_admission:'完成约 5 分钟的准入信息，提交后进入材料收集。',complete_materials:'可连接业务系统，也可批量上传补充材料；无需重复填写来源系统。',review_materials:'逐份确认材料是否可用于诊断，退回项需说明原因。',authorize_systems:'由系统授权人逐个审阅只读范围并连接来源。',read_batches:'由 FDE 读取并校验已授权数据批次。',map_records:'由 FDE 建立跨系统记录关联，企业处理模糊候选。',run_diagnosis:'由 FDE 运行版本化规则并保留证据血缘。',confirm_facts:'由业务流程负责人逐项确认事实或例外。',record_decision:'由 FDE 独立记录介入路径并冻结报告快照。',execute_intervention:'按已冻结决策执行任务并记录指标。',accept_outcome:'由结果验收人确认观察结果或退回整改。',closed:'项目已完成，记录保持可追溯。'}[key]||'按当前任务继续推进。';}
  function parserLabel(value){return {structured_preview:'结构可预览，仍待复核',manual_review_only:'仅人工复核，未机器解析',machine_validated:'连接器已校验'}[value]||value;}
  function taskCtaMarkup(task,evidence,workflow){
    if(!task.actionable)return `<span class="status-badge warn">等待${esc(ROLE_LABELS[task.ownerRole]||task.ownerRole||'责任岗位')}处理</span>`;
    if(task.key==='invite_members')return '<button type="button" class="primary-button" data-open-invitation>邀请成员</button>';
    if(task.key==='review_materials')return `<button type="button" class="primary-button" data-focus-review>定位待复核材料（${evidence.pendingReview}）</button>`;
    if(task.key==='run_diagnosis'&&workflow?.file)return '<button type="button" class="primary-button" data-focus-file-review>定位文件评审</button>';
    if(['execute_intervention','accept_outcome'].includes(task.key))return '<button type="button" class="primary-button" data-current-view="prep">进入介入执行</button>';
    const section={read_batches:'connectors',map_records:'mappings',run_diagnosis:'diagnosis',confirm_facts:'confirmation',record_decision:'decision'}[task.key];
    return section?`<button type="button" class="primary-button" data-current-section="${section}">打开当前工作区</button>`:'<span class="status-badge good">按流程推进</span>';
  }
  function taskContractDetails(workflow,evidence){
    const current=workflow.currentTask||{};
    const owner=ROLE_LABELS[current.ownerRole]||current.ownerRole||'待分配';
    const next=workflow.nextTask?.label||'当前流程已到末端';
    const connectorStatus=workflow.connector?.status||workflow.phase;
    const preconditions={invite_members:'已创建企业项目；由 FDE 发送岗位邀请。',complete_admission:'企业账号已激活；当前岗位具备提交权限。',complete_materials:'准入自述已提交；选择连接器或准备脱敏材料。',review_materials:'企业已提交材料；服务端已建立版本。',authorize_systems:'授权范围完成预览，或已准备脱敏文件。',read_batches:'来源授权有效；读取动作由 FDE 执行。',map_records:'至少一个来源批次已验收；关键主键可用。',run_diagnosis:'映射已确认；规则版本和输入批次已冻结。',confirm_facts:'诊断已生成；企业流程负责人逐项确认。',record_decision:'关键事实已确认；FDE 填写决策理由。',execute_intervention:'FDE 决策已冻结；介入方案已建立。',accept_outcome:'至少有一个可复核观察指标。'}[current.key]||'由服务端当前任务状态决定。';
    const failure=workflow.reopen?.tier?`当前存在${workflow.reopen.stage?.label||workflow.reopen.tier}补充申请，旧版本保持只读。`:evidence?.pendingReview?`有 ${evidence.pendingReview} 份材料待服务方复核，未复核内容不会进入诊断。`:['failed','quarantined','paused'].includes(connectorStatus)?`当前系统状态为${PHASE_LABELS[connectorStatus]||connectorStatus}，请走重试、修复或重新授权路径。`:'若证据不足、映射冲突或读取失败，系统保留旧版本并进入补充/重跑路径。';
    return {current,owner,next,preconditions,failure,status:PHASE_LABELS[workflow.phase]||workflow.phase};
  }
  function enterprisePhaseIndex(phase){return phase==='project_created'?0:phase==='awaiting_admission'?1:['collecting_evidence','evidence_review','awaiting_authorization','data_connected','batch_validated','mapping_complete'].includes(phase)?2:['diagnosis_generated','awaiting_enterprise_confirmation'].includes(phase)?3:4;}
  function renderEnterpriseSidebar(state,selected){
    const list=document.querySelector('#enterprise-subnav-list'),root=document.querySelector('#enterprise');
    if(!list||!root)return;
    const enterpriseVisible=host.getActiveView?.()==='enterprise'&&host.getUserRole?.()!=='fde_owner';
    list.hidden=!enterpriseVisible;
    list.classList.toggle('is-collapsed',!enterpriseVisible);
    list.setAttribute('aria-hidden',String(!enterpriseVisible));
    const navButton=document.querySelector('.sidebar-nav [data-view="enterprise"]');
    navButton?.setAttribute('aria-expanded',String(enterpriseVisible));
    if(!enterpriseVisible||state?.error||!state?.workflow){list.replaceChildren();return;}
    const workflow=state.workflow,phase=workflow.phase,index=enterprisePhaseIndex(phase),done=['closed','file_report_published'].includes(phase),viewing=root.dataset.enterprisePage===undefined?index:Number(root.dataset.enterprisePage),own=workflow.currentTask?.actionable&&workflow.currentTask?.ownerRole!=='fde';
    const phases=['项目激活','填写企业信息','提供诊断资料','确认诊断事实','查看结论'];
    list.innerHTML=`<div class="sidebar-subnav-group"><span class="sidebar-subnav-group-label">PROJECT FLOW · 项目流程</span>${phases.map((label,i)=>{const active=viewing===i,status=done||i<index?'已完成':i>index?'待完成':own?'当前待办':'协作处理中';return `<button type="button" class="sidebar-subnav-item enterprise-sidebar-subnav-item ${active?'active':''} ${i>index?'is-future':''}" data-enterprise-page="${i}" data-nav-index="${String(i+1).padStart(2,'0')}" aria-current="${active?'page':'false'}"><span>${esc(label)}</span><small>${status}</small></button>`;}).join('')}</div>`;
    list.querySelectorAll('[data-enterprise-page]').forEach(button=>button.addEventListener('click',()=>{
      root.dataset.enterprisePage=button.dataset.enterprisePage;
      delete root.dataset.revisionTier;
      if(button.dataset.enterprisePage==='1'&&state.history?.intakes?.some(item=>item.tier==='tier0'))root.dataset.revisionTier='tier0';
      renderEnterprise(state,selected);
    }));
  }
  function renderEnterpriseTaskRail(state,selected){
    const context=document.querySelector('#context-content');
    if(!context)return;
    const heading=document.querySelector('#context-rail .rail-heading .eyebrow');
    const pin=document.querySelector('#context-rail .rail-heading .rail-pin');
    if(heading)heading.textContent='当前任务指引';
    if(pin)pin.textContent='GUIDE';
    if(state?.error){context.innerHTML=errorMarkup(state.error);return;}
    if(!state?.workflow){context.innerHTML='<p class="muted">正在读取当前任务指引…</p>';return;}
    const detail=taskContractDetails(state.workflow,state.evidence),current=detail.current;
    const target=current.actionable?current.label||'按当前流程继续':`等待${detail.owner}完成当前处理`;
    context.innerHTML=`<section class="enterprise-task-rail" data-enterprise-task-rail aria-label="本页操作说明"><header><div><span class="eyebrow">TASK CONTRACT</span><h3>本页操作说明</h3><p>${esc(selected?.name||'当前企业')} · 把这一步完成后，系统才会推进后续流程。</p></div><span class="flow-service-status">${esc(detail.status)} · ${current.actionable?'当前可处理':'等待协作方处理'}</span></header><dl><div><dt>当前目标</dt><dd>${esc(target)}</dd><small>${esc(current.actionable?current.note||taskGuidance(current.key):'当前没有需要企业处理的动作。')}</small></div><div><dt>责任岗位</dt><dd>${esc(detail.owner)}</dd><small>${current.actionable?'当前登录角色可操作':'完成后会自动开放下一步'}</small></div><div><dt>开始前确认</dt><dd>${esc(detail.preconditions)}</dd></div><div><dt>完成后</dt><dd>${esc(detail.next)}</dd></div><div><dt>异常 / 补充</dt><dd>${esc(detail.failure)}</dd></div></dl></section>`;
  }
  function taskContractMarkup(workflow,evidence,view='project'){
    const detail=taskContractDetails(workflow,evidence),current=detail.current;
    const publicTaskLabel=view==='enterprise'&&!current.actionable?`等待${detail.owner}完成当前处理`:current.label||'按当前流程继续';
    const waiting=current.actionable?'当前可处理':'等待协作方处理';
    const action=view==='project'?(current.actionable?taskCtaMarkup(current,evidence,workflow):`<span class="status-badge warn">等待${esc(detail.owner)}处理</span>`):'';
    return `<section class="workflow-action-contract ${view==='enterprise'?'is-compact':''}" aria-label="当前任务操作说明"><header><div><span class="eyebrow">TASK CONTRACT</span><h4>${view==='enterprise'?'本页操作说明':'当前任务操作指引'}</h4><p>先满足前置条件，再完成本次动作；完成后由系统交给下一责任岗位。</p></div><span class="flow-service-status">服务端阶段：${esc(detail.status)} · ${waiting}</span></header><div class="workflow-action-grid"><div><span>当前目标</span><strong>${esc(publicTaskLabel)}</strong><small>${esc(current.actionable?current.note||taskGuidance(current.key):'当前没有需要企业处理的动作。')}</small></div><div><span>责任岗位</span><strong>${esc(detail.owner)}</strong><small>${current.actionable?'当前登录角色可操作':'完成后会自动开放下一步'}</small></div><div><span>开始前确认</span><strong>${esc(detail.preconditions)}</strong></div><div><span>完成后</span><strong>${esc(detail.next)}</strong></div><div><span>异常 / 补充</span><strong>${esc(detail.failure)}</strong></div></div>${action?`<div class="workflow-action-footer"><span>${current.actionable?'现在完成后，系统才会推进下一步。':'当前没有可执行动作。'}</span>${action}</div>`:''}</section>`;
  }
  function fdeTaskSummaryMarkup(workflow,evidence){
    const detail=taskContractDetails(workflow,evidence),current=detail.current;
    const target=current.actionable?current.label||'按当前流程继续':`等待${detail.owner}完成当前处理`;
    const note=current.actionable?current.note||taskGuidance(current.key):'当前没有需要 FDE 处理的动作。';
    const action=current.actionable?taskCtaMarkup(current,evidence,workflow):`<span class="status-badge warn">等待${esc(detail.owner)}处理</span>`;
    return `<section class="fde-current-task-bar" aria-label="FDE 当前任务"><div class="fde-current-task-main"><span class="eyebrow">CURRENT TASK</span><strong>${esc(target)}</strong><p>${esc(note)}</p><small>责任岗位：${esc(detail.owner)} · ${esc(current.actionable?'当前可处理':'等待协作方处理')}</small></div><div class="fde-current-task-actions"><button type="button" class="quiet-button" data-open-project-flow-summary>查看流程详情</button>${action}</div></section>`;
  }
  function formatTime(value){return new Date(value).toLocaleString('zh-CN',{hour12:false});}
  async function api(path,{method='GET',body}={}){const response=await host.request(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||payload.error||`请求失败（${response.status}）`);return payload;}
  function esc(value){return host.esc(value);}
}
import { mountFileDiagnosis } from './file-diagnosis-workbench.js';
