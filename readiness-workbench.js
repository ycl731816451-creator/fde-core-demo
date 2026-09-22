export function installReadinessWorkbench(host) {
  const cache = new Map();
  host.onRenderProject(() => mount('project'));
  host.onRenderEnterprise(() => mount('enterprise'));
  function mount(view) {
    if (host.getConnectorRole() === 'admin') return;
    const id = host.getSelected()?.enterpriseId;
    if (!id || (view === 'project' && host.getActiveProjectSection()!=='overview')) return;
    const parent = document.querySelector(view === 'project' ? '#project-stage-panel .connector-shell' : '#enterprise .enterprise-card');
    if (!parent) return;
    let panel = parent.querySelector('.screening-readiness-panel');
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'readiness-panel screening-readiness-panel'; panel.setAttribute('aria-label','数据初筛解释');
      const before = view === 'project' ? parent.querySelector(':scope > .connector-overview,:scope > .connector-section,:scope > .connector-empty-state,:scope > .readiness-details') : parent.querySelector('#enterprise-checklist');
      if(view==='project'){const detail=document.createElement('details');detail.className='readiness-summary';const summary=document.createElement('summary');summary.textContent='数据准备度检查（不等于业务诊断结论）';detail.append(summary,panel);parent.append(detail);}else parent.insertBefore(panel,before || null);
    }
    const role = view === 'enterprise' || host.getConnectorRole() === 'enterprise' ? 'enterprise' : 'fde';
    const cached = cache.get(id+':'+role);
    render(panel,cached?.value,'',false,role); bind(panel,id,role);
    if (!cached || Date.now()-cached.stamp>10000) void refresh(panel,id,role);
  }
  async function refresh(panel,id,role,save=false) {
    if (panel.dataset.busy==='true') return;
    const key=id+':'+role, prior=cache.get(key)?.value;
    panel.dataset.busy='true'; render(panel,prior,'',true,role);
    try {
      const response=await host.request('/api/enterprises/'+encodeURIComponent(id)+'/screening-assessment',{method:save?'POST':'GET',headers:{'x-enterprise-id':id,'x-actor-id':role==='fde'?'fde-demo':'owner-'+id,'x-role':role==='fde'?'fde':'enterprise_owner',...(save?{'content-type':'application/json'}:{})},...(save?{body:'{}'}:{})});
      const value=await response.json(); if(!response.ok) throw new Error(value.message||value.error||'初筛读取失败');
      cache.set(key,{value,stamp:Date.now()});
      if(panel.isConnected&&host.getSelected()?.enterpriseId===id) render(panel,value,save?'已保存计算快照；相同输入不会重复生成。':'',false,role);
    } catch(error) { if(panel.isConnected&&host.getSelected()?.enterpriseId===id) render(panel,prior,error.message,false,role,true); }
    finally { panel.dataset.busy='false'; if(panel.isConnected) bind(panel,id,role); }
  }
  function render(panel,result,notice,busy,role,error=false) {
    const e=host.esc,internal=role==='fde'&&Array.isArray(result?.dimensions),selected=host.getSelected(),decisionRecorded=Boolean(selected?.connectorDiagnosis?.latestDecision||selected?.consultantDecision);
    panel.setAttribute('aria-busy',String(busy));
    panel.innerHTML='<header class="readiness-head"><div><span class="eyebrow">系统初筛依据 · 样本级判断</span><h4>'+e(result?.label||'正在读取初筛依据…')+'</h4><p>'+e(result?.summary||'按已授权记录核对可读取性，不依赖演示公司的预设分数。')+'</p></div><button type="button" data-readiness-refresh '+(busy?'disabled':'')+'>更新结果</button></header>'+
      (busy?'<p role="status">正在计算授权范围内的样本…</p>':'')+
      (decisionRecorded?'<p class="readiness-notice" role="status">顾问最终决策：'+e(selected.statusLabel)+'。系统初筛只是决策依据，以已冻结的顾问决策为当前项目状态。</p>':'')+
      (notice?'<p class="readiness-notice '+(error?'error':'')+'" role="'+(error?'alert':'status')+'">'+e(notice)+'</p>':'')+
      (result?'<div class="readiness-boundary">'+e(result.provenance?.includes('synthetic')||result.provenance?.includes('contract_test')?'合成 / 接口测试数据，不代表真实企业结论':result.provenance?.includes('live')?'来自已授权只读取样；企业事实仍需复核':'尚无可计算记录')+'</div>'+
      '<details class="readiness-details"><summary>需要补充什么 <span>'+result.gaps.length+' 项</span></summary><ol>'+result.gaps.map(g=>'<li><strong>'+e(g.title)+'</strong><p>'+e(g.detail)+'</p><p class="readiness-action">'+e(g.nextAction)+'</p></li>').join('')+(result.gaps.length?'':'<li>样本字段检查通过。下一步验证业务问题，不能据此直接安排驻场。</li>')+'</ol></details>'+
      (internal?'<details class="readiness-details"><summary>五个判断面与证据依据 <span>'+e(result.ruleVersion)+'</span></summary><p>系统仅展示分项准备度与证据依据，不合成总分，也不自动形成驻场结论 · '+result.evidence.count+' 条样本</p><div class="readiness-dimensions">'+result.dimensions.map(d=>'<article><div><strong>'+e(d.label)+'</strong><span>'+(d.value===null?'无法计算':d.value+'%')+'</span></div><p>'+e(d.basis)+'</p><small>权重 '+d.weight+'% · 样本基数 '+d.denominator+'</small></article>').join('')+'</div><p>'+e(result.evidenceStrength.reason)+'</p><p>'+e(result.onsiteNecessity.reason)+'</p><details><summary>来源引用（最多100条）</summary><ul>'+result.evidence.refs.map(ref=>'<li>'+e(ref.ref+' · 批次 '+ref.batch+' · '+ref.system+'/'+ref.dataset)+'</li>').join('')+'</ul></details></details><footer class="readiness-footer"><span>'+(result.latest?'快照 #'+result.latest.id+(result.latest.stale?' · 输入已变化，请重算保存':' · 当前输入一致'):'尚未保存计算快照')+'</span><button type="button" data-readiness-save '+(busy?'disabled':'')+'>计算并保存快照</button></footer>':''):'');
  }
  function bind(panel,id,role) {
    panel.querySelector('[data-readiness-refresh]')?.addEventListener('click',()=>refresh(panel,id,role));
    panel.querySelector('[data-readiness-save]')?.addEventListener('click',()=>refresh(panel,id,role,true));
  }
}
