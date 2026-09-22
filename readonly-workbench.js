export function installReadonlyWorkbench(host) {
  const e=host.esc;
  const requests=new WeakMap();
  host.onRenderProject(()=>{if(host.getActiveProjectSection()==='connectors')mount('project');});
  host.onRenderEnterprise(()=>mount('enterprise'));
  const labels={draft:'待企业授权',authorized:'已授权，待配置连接',connected:'配置就绪，需读取验证',paused:'已暂停',revoked:'授权已撤销'};
  function mount(view) {
    if(host.getConnectorRole()==='admin')return;
    const id=host.getSelected()?.enterpriseId;
    const parent=document.querySelector(view==='project'?'#project-stage-panel .connector-shell':'#enterprise .enterprise-card');
    if(!id||!parent)return;
    let panel=parent.querySelector(':scope > .readonly-panel');
    if(!panel){panel=document.createElement('section');panel.className='readiness-panel readonly-panel';panel.setAttribute('aria-label','只读系统试点');parent.append(panel);}
    const role=view==='enterprise'||host.getConnectorRole()==='enterprise'?'enterprise':'fde';
    void load(panel,id,role);
  }
  async function request(id,role,path='',body) {
    const response=await host.request('/api/enterprises/'+encodeURIComponent(id)+'/readonly-connectors'+path,{method:body===undefined?'GET':'POST',headers:{'x-enterprise-id':id,'x-actor-id':role==='fde'?'fde-demo':'owner-'+id,'x-role':role==='fde'?'fde':'enterprise_owner',...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||'操作未完成');return payload;
  }
  async function load(panel,id,role,notice='') {
    if(!panel.isConnected||host.getSelected()?.enterpriseId!==id)return;
    const revision=(requests.get(panel)||0)+1;requests.set(panel,revision);
    panel.innerHTML='<p role="status">正在读取只读试点配置…</p>';
    try {
      const payload=await request(id,role);
      if(!panel.isConnected||host.getSelected()?.enterpriseId!==id||requests.get(panel)!==revision)return;
      panel.innerHTML='<header class="readiness-head"><div><span class="eyebrow">真实连接器试点 · 部署后可用</span><h4>企业采购系统</h4><p>只取够判断的订单样本，不执行新增、修改、审批或付款。</p></div><button type="button" data-live-refresh>刷新连接状态</button></header>'+
       (notice?'<p role="status">'+e(notice)+'</p>':'')+
       '<div class="readonly-sources">'+payload.sources.map(source=>'<article><header><strong>'+e(payload.catalog.find(c=>c.id===source.adapter)?.label||source.adapter)+'</strong><span>'+e(labels[source.status]||source.status)+'</span></header><p>'+(source.scope?.fields?e(source.scope.from+' 至 '+source.scope.to+' · 最多 '+source.scope.maxRecords+' 条 · '+source.scope.fields.map(f=>payload.dataset.labels[f]||f).join('、')):'尚未授权任何字段；创建来源不会访问企业系统。')+'</p><div class="readonly-actions">'+(role==='enterprise'?'<button type="button" data-live-scope="'+e(source.id)+'">审阅只读范围</button>'+(source.status!=='draft'&&source.status!=='revoked'?'<button type="button" data-live-action="revoke" data-source="'+e(source.id)+'">撤销授权</button>':''):(['authorized','paused'].includes(source.status)?'<button type="button" data-live-action="connect" data-source="'+e(source.id)+'">检查部署绑定</button>':'')+(source.status==='connected'?'<button type="button" data-live-action="read-runs" data-source="'+e(source.id)+'">读取授权样本</button>':'<span>需企业授权及服务端只读绑定后才能取样</span>'))+
       (source.status==='connected'?'<button type="button" data-live-action="pause" data-source="'+e(source.id)+'">暂停读取</button>':'')+'<button type="button" data-live-history="'+e(source.id)+'">读取记录</button></div></article>').join('')+'</div>'+
       (!payload.sources.length?'<p>尚无只读来源。'+(role==='enterprise'?'请服务方先建立试点来源。':'选择已实现的适配器建立来源，再由企业授权。')+'</p>':'')+
       (role==='fde'?payload.catalog.filter(c=>!payload.sources.some(s=>s.adapter===c.id)).map(c=>'<button type="button" data-live-create="'+e(c.id)+'">建立 '+e(c.label)+' 来源</button>').join(''):'')+
       '<p class="readiness-boundary">没有绑定真实企业环境时，连接会明确停在待配置，不会自动换用演示数据。</p>';
      const children=[...panel.childNodes],disclosure=document.createElement('details'),summary=document.createElement('summary');
      disclosure.className='technical-pilot-disclosure';disclosure.open=payload.sources.length>0;summary.innerHTML='<strong>真实系统试点</strong><span>'+(payload.sources.length?payload.sources.length+' 个来源已建立':'当前未配置，不影响合成闭环演示')+'</span>';disclosure.append(summary,...children);panel.replaceChildren(disclosure);
      panel.querySelector('[data-live-refresh]').onclick=()=>load(panel,id,role);
      panel.querySelectorAll('[data-live-create]').forEach(b=>b.onclick=()=>run(b,()=>request(id,role,'',{adapter:b.dataset.liveCreate}),()=>load(panel,id,role,'来源已建立，等待企业审阅。')));
      panel.querySelectorAll('[data-live-action]').forEach(b=>b.onclick=()=>{
        if(b.dataset.liveAction==='revoke'&&!window.confirm('撤销后停止读取，既有记录不再用于当前初筛。历史审计保留。'))return;
        run(b,()=>request(id,role,'/'+b.dataset.source+'/'+b.dataset.liveAction,{}),result=>load(panel,id,role,result.notice||(result.status==='accepted'?'取样已完成。请到诊断项目更新初筛结果。':'状态已更新。')));
      });
      panel.querySelectorAll('[data-live-scope]').forEach(b=>b.onclick=()=>scopeDialog(panel,id,role,payload.sources.find(s=>s.id===b.dataset.liveScope),payload.dataset));
      panel.querySelectorAll('[data-live-history]').forEach(b=>b.onclick=()=>run(b,()=>request(id,role,'/'+b.dataset.liveHistory+'/runs'),result=>{
        const dialog=openDialog('读取记录');
        dialog.querySelector('[data-dialog-content]').innerHTML=result.runs.length?'<ol>'+result.runs.map(r=>'<li>'+e(r.created_at+' · '+({accepted:'样本已接受',failed:'读取失败',running:'读取中'}[r.status]||r.status)+' · '+r.record_count+' 条 · '+r.reason)+'</li>').join('')+'</ol>':'<p>还没有发起读取。连接配置就绪不等于已经读取成功。</p>';
      }));
    }catch(error){if(panel.isConnected&&requests.get(panel)===revision){panel.innerHTML='<p role="alert">'+e(error.message)+'</p><button type="button">重新读取</button>';panel.querySelector('button').onclick=()=>load(panel,id,role);}}
  }
  async function run(button,fn,done) {
    if(button.disabled)return;button.disabled=true;
    try{done(await fn());}catch(error){host.showNotice(error.message,'error');}finally{button.disabled=false;}
  }
  function openDialog(title) {
    const focus=document.activeElement,dialog=document.createElement('dialog');dialog.className='readonly-dialog readiness-panel';
    dialog.innerHTML='<header class="readiness-head"><h4>'+e(title)+'</h4><button type="button" data-close>关闭</button></header><div data-dialog-content></div><p data-dialog-status role="status"></p>';
    document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();focus?.focus();},{once:true});dialog.showModal();return dialog;
  }
  function scopeDialog(panel,id,role,source,dataset) {
    const dialog=openDialog('审阅采购订单只读范围'),content=dialog.querySelector('[data-dialog-content]');
    content.innerHTML='<form><fieldset><legend>保留字段</legend><div class="readonly-fields">'+dataset.fields.map(f=>'<label><input type="checkbox" name="field" value="'+e(f)+'" '+(dataset.required.includes(f)?'checked disabled':source.scope?.fields?.includes(f)?'checked':'')+'>'+e(dataset.labels[f])+'</label>').join('')+'</div></fieldset><div class="readonly-form-grid"><label>订单日期范围<select name="days"><option value="30">最近30天</option><option value="7">最近7天</option><option value="90">最近90天</option></select></label><label>最大样本数<select name="limit"><option>10</option><option>20</option><option>50</option><option>100</option></select></label><label>使用目的<select name="purpose"><option value="data_readiness">数据基础初筛</option><option value="procurement_review">采购流程证据复核</option></select></label><label>授权有效期<select name="expiry"><option value="7">7天</option><option value="30">30天</option></select></label></div><p>上游API不支持按字段裁剪，响应可能包含人员和备注等整单字段；本系统仅保留所选字段，不记录其他字段。若企业不允许整单响应进入服务端内存，请勿授权，应改用企业侧裁剪网关。</p><label class="readonly-ack"><input type="checkbox" name="ack" required>已了解上述接收范围与保留范围的区别，并确认企业允许此取样方式</label><button type="submit">预览本次范围</button></form><div data-scope-preview></div>';
    const form=content.querySelector('form'),status=dialog.querySelector('[data-dialog-status]');let preview=null;
    form.onchange=()=>{preview=null;content.querySelector('[data-scope-preview]').innerHTML='';status.textContent='范围已变化，请重新预览。';};
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;status.textContent='正在生成范围预览（不会读取企业系统）…';
      const today=new Date(),end=today.toISOString().slice(0,10),days=Number(form.elements.days.value);
      const scope={dataset:'purchase_orders',fields:[...form.querySelectorAll('[name="field"]:checked')].map(x=>x.value),from:new Date(today.getTime()-(days-1)*86400000).toISOString().slice(0,10),to:end,maxRecords:Number(form.elements.limit.value),purpose:form.elements.purpose.value,expiresAt:new Date(today.getTime()+Number(form.elements.expiry.value)*86400000).toISOString(),upstreamResponseAcknowledged:form.elements.ack.checked};
      try {
        preview=await request(id,role,'/'+source.id+'/scope-preview',scope);
        status.textContent='预览已生成，请核对后授权。';
        content.querySelector('[data-scope-preview]').innerHTML='<p>'+e(preview.scope.from+' 至 '+preview.scope.to+' · 最多 '+preview.scope.maxRecords+' 条 · '+preview.scope.fields.map(f=>dataset.labels[f]).join('、'))+'</p><button type="button" data-approve-scope>确认此范围并授权</button>';
        content.querySelector('[data-approve-scope]').onclick=async event=>{
          if(!preview)return;event.target.disabled=true;
          try{await request(id,role,'/'+source.id+'/authorize',{previewId:preview.previewId});dialog.close();void load(panel,id,role,'已授权所审阅范围，尚未读取数据。');}catch(error){status.textContent=error.message;event.target.disabled=false;}
        };
      }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    };
  }
}
