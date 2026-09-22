const RISK = {hallucination:'幻觉或无依据结论',tool_overreach:'工具越权',sensitive_output:'敏感信息输出',content_safety:'内容安全',stale_knowledge:'知识过期',prompt_injection:'提示注入',irreversibility:'错误不可逆',human_takeover:'人工接管 / 拒答 / 升级'};
const TEXT = {businessUsers:'业务使用者',businessOwner:'业务责任人',acceptanceOwner:'验收责任人',sponsor:'业务发起人',resources:'可投入资源',frequencyUnit:'频率单位',volumeUnit:'业务量单位',currentCostUnit:'成本单位',metricUnit:'指标单位',metricDefinition:'指标定义',measurementWindow:'测量窗口',measurementSource:'测量来源',evaluationOwner:'评测负责人',evaluationWindow:'评测窗口',successMetric:'成功指标',holdoutPlan:'对照 / 留出方案',groundingRequirements:'来源与引用要求',toolSuccessCriteria:'工具成功标准',refusalCriteria:'拒答与升级标准',knowledgeOwner:'知识负责人',monitoringOwner:'监控负责人',rollbackPlan:'回滚方案',notes:'补充依据'};
const NUM = {frequency:'频率',volume:'业务量',currentCost:'当前成本',currentDuration:'当前耗时',loss:'损失',errorRate:'错误率（0–1）',baseline:'基线值',target:'目标值',systemCount:'跨系统数量'};
const ENUM = {consequence:['业务后果','low','medium','high','critical'],observability:['可观测性','none','partial','good'],inputStructure:['输入结构化程度','unstructured','mixed','structured'],stability:['流程稳定性','low','medium','high'],humanJudgment:['需要人类判断','true','false'],writeAllowed:['允许写回','true','false'],dataSensitivity:['数据敏感度','low','medium','high','restricted'],reversibility:['错误可逆性','low','medium','high'],maintenanceCost:['维护成本','low','medium','high'],promptInjectionExposure:['提示注入暴露','unknown','low','medium','high'],knowledgeFreshness:['知识新鲜度','unknown','stale','managed','live']};
const WORDS = {unknown:'未知',low:'低',medium:'中',high:'高',critical:'严重',none:'无',partial:'部分',good:'良好',unstructured:'非结构化',mixed:'混合',structured:'结构化',true:'是',false:'否',restricted:'受限',stale:'过期',managed:'受管理',live:'实时',ready:'已准备',needs_preparation:'需要补充准备',insufficient:'不足',deterministic:'确定性方案适配',limited:'适配有限',copilot_or_rag:'Copilot / RAG 候选',workflow_or_agent:'Workflow / Agent 候选',reference_only:'仅参考映射',candidate_only:'仅候选'};
const PROFILES = {generic:'通用', 'example-manufacturing':'制造示例','example-procurement':'采购示例','example-commerce':'电商示例'};
const CASE_CATEGORIES={normal:'正常路径',boundary:'边界输入',unauthorized:'越权输入',error_timeout:'异常和超时',authorization_revoked:'撤销授权',refusal_takeover:'拒答与人工接管'};
Object.assign(TEXT,{currentDurationUnit:'耗时单位',currentDurationWindow:'耗时观察窗口',currentDurationDefinition:'耗时定义',currentDurationSource:'耗时来源',lossUnit:'损失单位',lossWindow:'损失观察窗口',lossDefinition:'损失定义',lossSource:'损失来源'});

export function installQualificationWorkbench(host) {
  if(document.querySelector('link[data-qualification-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/qualification-workbench.css';link.dataset.qualificationStyle='';document.head.insertBefore(link,document.querySelector('link[href*="brand-theme.css"]'));
  const states=new Map(),esc=value=>host.esc(String(value??''));
  const word=value=>WORDS[value]||value;
  const editable=()=>host.getUserRole()==='fde';
  const storageKey=s=>'fde:qualification-draft:v2:'+s.key;
  function draftStore(s){try{sessionStorage.setItem(storageKey(s),JSON.stringify({input:s.input,expectedVersion:s.expectedVersion,industryProfileId:s.industryProfileId,platformProfileId:s.platformProfileId,pending:s.pending}));return true;}catch{feedback(s,'浏览器无法保存草稿；刷新可能丢失本次编辑。');return false;}}
  const canonical=value=>JSON.stringify(value,(_,v)=>typeof v==='string'?v.trim():v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  const snapshot=s=>({input:s.input,industryPackage:s.industryProfileId,platformProfileId:s.platformProfileId});
  function reconcile(s){
    if(!s.pending)return;
    const saved=s.history.find(row=>row.version===s.pending.expectedVersion+1);
    if(!saved||canonical({input:saved.payload.input,industryPackage:saved.payload.industryPackage,platformProfileId:saved.payload.platformProfileId})!==canonical(s.pending.snapshot))return;
    const unchanged=canonical(snapshot(s))===canonical(s.pending.snapshot);
    s.expectedVersion=saved.version;delete s.pending;
    if(unchanged){s.dirty=false;s.editing=false;s.restored=false;try{sessionStorage.removeItem(storageKey(s));}catch{}}
    else draftStore(s);
  }
  function feedback(s,message){const n=s.node.querySelector('[data-q-feedback]');if(n)n.textContent=message;}
  async function api(s,history=false,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await host.request('/api/enterprises/'+encodeURIComponent(s.id)+'/opportunity-qualification'+(history?'?history=1':''),{method:body?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json','x-role':s.role,'x-enterprise-id':s.id,'x-actor-id':s.role==='fde'?'fde-demo':'owner-'+s.id},...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message||data.error||'资格读取失败'),{status:response.status});return data.qualification;
    }finally{clearTimeout(timer);}
  }
  function state(){
    const id=host.getSelected()?.enterpriseId,role=host.getUserRole();if(!id||!(role==='fde'||String(role).startsWith('enterprise')))return null;
    const key=id+':'+role;
    if(!states.has(key)){
      const s={id,key,role,node:document.createElement('section'),latest:null,history:[],input:{},expectedVersion:0,industryProfileId:'generic',platformProfileId:'none'};
      if(role==='fde')try{const d=JSON.parse(sessionStorage.getItem(storageKey(s))||'null');if(d){Object.assign(s,d);s.editing=true;s.dirty=true;s.restored=true;}}catch{}
      s.node.className='qualification-workbench';s.node.dataset.qualificationWorkbench='';states.set(key,s);
    }return states.get(key);
  }
  function mount(){
    const view=host.getActiveView(),s=state();
    for(const other of states.values())if(other!==s)other.node.remove();
    if(!s)return;
    const target=view==='project'&&host.getActiveProjectSection()==='delivery'?document.querySelector('[data-delivery-mount]'):view==='enterprise'?document.querySelector('#enterprise'):view==='reports'?document.querySelector('#reports'):null;
    if(!target){s.node.remove();return;}
    const report=view==='reports';
    // Keep the editor node intact across host renders and enterprise switches.
    if(s.report!==report){s.report=report;if(s.loaded)render(s);}
    if(!target.contains(s.node))target.append(s.node);
    if(!s.loaded&&!s.loading&&!s.failed)void load(s);
  }
  async function load(s){
    s.loading=true;s.failed=false;if(!s.loaded&&!s.dirty)s.node.innerHTML='<p role="status">正在读取资格版本…</p>';
    try{const [latest,history]=await Promise.all([api(s),api(s,true)]);s.latest=latest;s.history=Array.isArray(history)?history:[];reconcile(s);s.loaded=true;render(s);}
    catch(error){s.failed=true;if(s.dirty){render(s);feedback(s,'读取失败，草稿仍保留：'+error.message);}else{s.node.innerHTML=`<p role="alert">${esc(error.message)}</p><button data-q-retry>重新读取资格</button>`;s.node.querySelector('button').onclick=()=>load(s);}}
    finally{s.loading=false;}
  }
  function valueMarkup(value){
    if(value===null||value===undefined||value==='')return '待补充';
    if(Array.isArray(value))return value.length?'<ul>'+value.map(v=>'<li>'+valueMarkup(v)+'</li>').join('')+'</ul>':'暂无记录';
    if(typeof value==='object')return '<dl>'+Object.entries(value).map(([k,v])=>`<div><dt>${esc(TEXT[k]||k)}</dt><dd>${valueMarkup(v)}</dd></div>`).join('')+'</dl>';
    return esc(word(value));
  }
  function result(row,historical=false){
    if(!row)return '<p>尚未保存资格判断。填写已有信息即可保存；缺项需继续准备。</p>';
    if(row.stale||historical||row.effectiveStatus==='superseded'){
      const content=result({...row,stale:false,effectiveStatus:'active',payload:{...row.payload,pilotEligible:false,nextAction:row.stale?'按最新依据重新评估后，再进入人工试点评审':'查看当前资格版本；本历史快照不用于当前试点评审'}});
      return content.replace('需要补充准备（needs_preparation）或尚未确认试点资格',row.stale?'依据已失效，需要重新评估；原试点资格不再有效':'历史判断，仅供追溯，不代表当前试点资格');
    }
    const p=row.payload||{};
    const routes=(p.routes||[]).map(({label,type,reason,risks,evidenceNeeded,humanGates,platformMapping})=>({路线:label||type,理由:reason,风险:risks,所需证据:evidenceNeeded,人工门禁:humanGates,...(platformMapping?{参考映射:platformMapping}:{})}));
    return `<p class="q-version">资格 V${esc(row.version)} · ${esc(row.createdAt)} · ${esc(p.schemaVersion)}</p><p>${p.pilotEligible===true?'具备候选试点条件，仍需人工批准':'需要补充准备（needs_preparation）或尚未确认试点资格'}</p><dl class="q-dimensions">${(p.dimensions||[]).map(d=>`<div><dt>${esc(d.label||d.id)}</dt><dd><strong>${esc(word(d.value))}</strong><p>${esc(d.basis)}</p></dd></div>`).join('')}</dl>${[['依据',p.evidenceAssessment],['录入依据（待验证）',p.input],['缺口',p.gaps],['路线候选',routes],['风险与评测',p.riskAndEvaluation],['下一步',p.nextAction]].map(([label,v])=>`<details><summary>${label}</summary>${valueMarkup(v)}</details>`).join('')}<details><summary>行业与平台档案映射 · 仅参考</summary><p>reference_only · 未连接 · 未部署；不代表能力实证。</p>${valueMarkup(p.profiles||{industryProfile:p.industryPackage,platformProfile:p.platformProfileId||p.vendorReference})}</details>`;
  }
  function field(s,key){
    const value=s.input[key]??'';
    if(ENUM[key]){const [label,...opts]=ENUM[key];return `<label>${label}<select name="${key}"><option value="">未知 / 待补充</option>${opts.map(v=>`<option value="${v}" ${String(value)===v?'selected':''}>${esc(word(v))}</option>`).join('')}</select></label>`;}
    return `<label>${esc(TEXT[key]||NUM[key]||key)}${NUM[key]?`<input type="number" step="any" name="${key}" value="${esc(value)}">`:`<textarea rows="2" maxlength="4000" name="${key}">${esc(value)}</textarea>`}</label>`;
  }
  function editor(s){
    const evaluation=['evaluationOwner','evaluationWindow','successMetric','holdoutPlan','groundingRequirements','toolSuccessCriteria','refusalCriteria','knowledgeOwner','monitoringOwner','rollbackPlan'];
    const business=[...Object.keys(TEXT).filter(k=>!evaluation.includes(k)),...Object.keys(NUM),...Object.keys(ENUM)];
    return `<form data-q-form><p>缺项可保存为待准备。责任人请填岗位或角色；不要填写个人隐私或凭据。旧 v1 重编辑时需补齐新字段。</p><details><summary>业务与测量依据</summary><div class="q-fields">${business.map(k=>field(s,k)).join('')}</div></details><details><summary>评测与运行责任</summary><div class="q-fields">${evaluation.map(k=>field(s,k)).join('')}</div><div data-q-cases>${(s.input.evaluationCases?.length?s.input.evaluationCases:[{input:'',expectedResult:''}]).map((c,i)=>caseMarkup(c,i)).join('')}</div><button type="button" data-q-add-case>添加评测样例</button></details><details><summary>8 项风险评估</summary>${Object.entries(RISK).map(([id,label])=>{const r=s.input.riskAssessments?.find(x=>x.id===id)||{};return `<fieldset data-q-risk="${id}"><legend>${label}</legend><label>风险等级<select data-risk-level>${['unknown','low','medium','high'].map(v=>`<option value="${v}" ${(r.level||'unknown')===v?'selected':''}>${esc(word(v))}</option>`).join('')}</select></label><label>依据<textarea rows="2" data-risk-evidence>${esc(r.evidence)}</textarea></label><label>控制措施<textarea rows="2" data-risk-control>${esc(r.control)}</textarea></label></fieldset>`;}).join('')}</details><details><summary>参考档案映射</summary><p>reference_only · 未连接 · 未部署；不作为能力实证。</p><label>行业档案<select name="industryProfileId">${Object.entries(PROFILES).map(([id,label])=>`<option value="${id}" ${s.industryProfileId===id?'selected':''}>${label}</option>`).join('')}</select></label><label>平台档案<select name="platformProfileId"><option value="none">无平台</option><option value="tencent-adp" ${s.platformProfileId==='tencent-adp'?'selected':''}>腾讯 ADP · 仅参考映射</option></select></label></details><div class="q-actions"><button type="submit">保存资格新版本</button><button type="button" data-q-cancel>取消编辑并清除草稿</button></div></form>`;
  }
  function caseMarkup(c,i){return `<fieldset data-q-case><legend>评测样例 ${i+1}</legend><label>案例分类<select data-case-category><option value="">待补充分类</option>${Object.entries(CASE_CATEGORIES).map(([id,label])=>`<option value="${id}" ${c.category===id?'selected':''}>${label}</option>`).join('')}</select></label><label>输入<textarea rows="2" data-case-input>${esc(c.input)}</textarea></label><label>预期结果<textarea rows="2" data-case-expected>${esc(c.expectedResult)}</textarea></label></fieldset>`;}
  function collect(s){
    const form=s.node.querySelector('[data-q-form]');if(!form)return;
    const data=new FormData(form),input={};
    for(const key of [...Object.keys(TEXT),...Object.keys(NUM),...Object.keys(ENUM)]){const v=String(data.get(key)??'');if(v!=='')input[key]=NUM[key]?Number(v):['humanJudgment','writeAllowed'].includes(key)?v==='true':v;}
    input.evaluationCases=[...form.querySelectorAll('[data-q-case]')].map(n=>({...(n.querySelector('[data-case-category]').value?{category:n.querySelector('[data-case-category]').value}:{}),input:n.querySelector('[data-case-input]').value,expectedResult:n.querySelector('[data-case-expected]').value})).filter(c=>c.category||c.input||c.expectedResult);
    input.riskAssessments=[...form.querySelectorAll('[data-q-risk]')].map(n=>({id:n.dataset.qRisk,level:n.querySelector('[data-risk-level]').value,evidence:n.querySelector('[data-risk-evidence]').value,control:n.querySelector('[data-risk-control]').value}));
    s.input=input;s.industryProfileId=data.get('industryProfileId');s.platformProfileId=data.get('platformProfileId');s.dirty=true;draftStore(s);
  }
  function render(s){
    s.node.innerHTML=`<header><div><h3>机会资格</h3><p>五维判断 → 补齐依据 → 选择验证路线</p></div>${editable()&&!s.report&&!s.editing?'<button type="button" data-q-edit>编辑资格</button>':''}</header>${s.editing&&!s.report&&editable()?editor(s):result(s.latest)}<p data-q-feedback role="status" aria-live="polite">${s.restored?'已恢复本企业草稿；保存前将校验原版本。':''}</p><div data-q-conflict></div><details data-q-history><summary>资格历史（${esc(s.history.length)}）</summary>${s.history.map(row=>`<details><summary>V${esc(row.version)} · ${esc(row.createdAt)} · 只读</summary>${result(row,true)}</details>`).join('')||'<p>暂无历史版本。</p>'}</details>`;
    s.node.querySelector('[data-q-edit]')?.addEventListener('click',()=>{s.input=structuredClone(s.latest?.payload?.input||{});s.expectedVersion=s.latest?.version||0;s.industryProfileId=Object.hasOwn(PROFILES,s.latest?.payload?.industryPackage)?s.latest.payload.industryPackage:'generic';s.platformProfileId=s.latest?.payload?.platformProfileId||'none';s.editing=true;render(s);s.node.querySelector('form details summary')?.focus();});
    s.node.querySelector('[data-q-cancel]')?.addEventListener('click',()=>{if(s.saving)return;s.editing=false;s.dirty=false;s.restored=false;s.conflict=false;delete s.pending;try{sessionStorage.removeItem(storageKey(s));}catch{}render(s);s.node.querySelector('[data-q-edit]')?.focus();});
    const form=s.node.querySelector('form');if(!form)return;
    form.addEventListener('input',()=>collect(s));form.addEventListener('change',()=>collect(s));
    s.node.querySelector('[data-q-add-case]').onclick=()=>{const list=s.node.querySelector('[data-q-cases]');list.insertAdjacentHTML('beforeend',caseMarkup({},list.children.length));collect(s);list.lastElementChild.querySelector('textarea').focus();};
    form.onsubmit=async event=>{
      event.preventDefault();if(s.saving||s.conflict)return;collect(s);s.saving=true;const button=form.querySelector('[type=submit]');button.disabled=true;feedback(s,'正在保存资格版本…');
      try{
        const submitted=structuredClone(snapshot(s));s.pending={expectedVersion:s.expectedVersion,snapshot:submitted};draftStore(s);
        const row=await api(s,false,{...submitted,expectedVersion:s.expectedVersion});
        if(row.reused){
          const [latest,history]=await Promise.all([api(s),api(s,true)]);
          s.history=history;s.latest=latest;
        }else if(!s.latest||row.version>=s.latest.version){s.latest=row;s.history=[row,...s.history.filter(r=>r.version!==row.version)];}
        s.expectedVersion=Math.max(s.expectedVersion,s.latest?.version||0,row.version);
        delete s.pending;
        if(canonical(snapshot(s))!==canonical(submitted)){draftStore(s);feedback(s,'已保存提交时版本；提交后的编辑仍作为草稿保留。');return;}
        s.dirty=false;s.editing=false;s.restored=false;try{sessionStorage.removeItem(storageKey(s));}catch{}render(s);feedback(s,row.reused?'已核对原提交 V'+row.version+'；当前版本 V'+s.latest.version+'。':'资格 V'+row.version+' 已保存；缺项仍需补充。');s.node.querySelector('[data-q-edit]')?.focus();
      }catch(error){
        feedback(s,error.status===409?'版本冲突：草稿已保留。请读取并核对最新版本后再保存。':'保存未确认，草稿已保留：'+error.message);
        if(error.status===409){s.conflict=true;const area=s.node.querySelector('[data-q-conflict]');area.innerHTML='<button type="button">读取最新版本，保留草稿</button>';area.querySelector('button').onclick=async()=>{try{const latest=await api(s);s.latest=latest;area.innerHTML=`<details open><summary>请核对服务端最新版本</summary>${result(latest)}</details><button type="button">已核对，以当前草稿提交下一版</button>`;area.querySelector('button').onclick=()=>{s.expectedVersion=latest?.version||0;s.conflict=false;draftStore(s);area.replaceChildren();feedback(s,'已更新版本基线，草稿未变；请主动保存。');};}catch(e){feedback(s,'最新版本读取失败：'+e.message);}};}
      }finally{s.saving=false;button.disabled=false;}
    };
  }
  host.onRenderProject(mount);host.onRenderEnterprise(mount);host.onRenderReports?.(mount);
  // Older hosts omit the reports hook. Observe only structural changes; never redraw drafts.
  const observer=new MutationObserver(()=>mount());observer.observe(document.body,{childList:true,subtree:true});
  mount();
}
