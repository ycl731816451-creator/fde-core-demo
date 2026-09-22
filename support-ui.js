const supportSession=await window.fdeSessionReady;
const supportLabels={access:'账号与权限',upload:'材料上传',connector:'系统连接',diagnosis:'诊断结果',report:'报告与导出',other:'其他问题'};
const severityLabels={low:'一般',medium:'较急',high:'严重',blocking:'阻断'};
const statusLabels={open:'待处理',triaged:'已分诊',in_progress:'处理中',resolved:'已解决',closed:'已关闭'};

const supportButton=document.querySelector('.account-support')||document.createElement('button');
supportButton.type='button';supportButton.className='quiet-button account-support';supportButton.textContent='帮助';
supportButton.addEventListener('click',openSupportDialog);
supportButton.dataset.supportReady='true';
if(!supportButton.isConnected)document.querySelector('#logout-button')?.before(supportButton);

window.fdeInstallSupportPanel=async()=>{
 const mount=document.querySelector('[data-support-mount]');
 if(!mount||mount.dataset.ready==='true')return;
 mount.dataset.ready='true';
 const tickets=await loadTickets();
 mount.innerHTML=`<section class="support-summary-card"><div><strong>当前支持队列</strong><span>${tickets.length} 个工单 · 所有变更均保留处理记录</span></div><button type="button" class="primary-button" data-open-support>打开支持中心</button></section>${ticketList(tickets,false)}`;
 mount.querySelector('[data-open-support]')?.addEventListener('click',openSupportDialog);
};

async function openSupportDialog(){
 document.querySelector('dialog.support-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.className='support-dialog';
 dialog.innerHTML='<div class="support-dialog-shell" role="document"><div class="support-dialog-head"><div><span class="eyebrow">SERVICE SUPPORT</span><h2>服务支持中心</h2><p>提交可复现的问题；企业只能看到本企业工单。</p></div><button type="button" class="quiet-button" data-close>关闭</button></div><div class="support-dialog-body" role="status">正在读取支持队列…</div></div>';
 document.body.append(dialog);dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 await renderSupportDialog(dialog);
}

async function renderSupportDialog(dialog){
 const body=dialog.querySelector('.support-dialog-body');
 try{
  const [tickets,screenings]=await Promise.all([loadTickets(),['fde','admin'].includes(supportSession.user.role)?fetch('/api/screenings').then(response=>response.json()).then(value=>value.screenings||[]):Promise.resolve([])]);
  const enterpriseField=['fde','admin'].includes(supportSession.user.role)?`<label>关联企业<select name="enterpriseId" required>${[...new Map(screenings.filter(item=>!item.archived&&!item.deleted).map(item=>[item.enterpriseId,item.name])).entries()].map(([id,name])=>`<option value="${escapeSupport(id)}">${escapeSupport(name)}</option>`).join('')}</select></label>`:'';
  body.innerHTML=`<form class="support-form">${enterpriseField}<label>问题分类<select name="category">${Object.entries(supportLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>影响程度<select name="severity"><option value="medium">较急</option><option value="low">一般</option><option value="high">严重</option><option value="blocking">阻断</option></select></label><label class="support-wide">问题标题<input name="subject" maxlength="80" required placeholder="例如：CSV 材料上传后无法继续"></label><label class="support-wide">复现说明<textarea name="description" maxlength="1000" required placeholder="发生在哪一步、看到了什么、期望结果是什么"></textarea></label><div class="support-wide support-form-actions"><span aria-live="polite" data-support-result></span><button type="submit" class="primary-button">提交工单</button></div></form><div class="support-ticket-section"><div class="support-ticket-heading"><h3>工单记录</h3><span>${tickets.length} 个</span></div>${ticketList(tickets,true)}</div>`;
  body.removeAttribute('role');
  body.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget),result=body.querySelector('[data-support-result]');result.textContent='正在提交…';const response=await fetch('/api/support-tickets',{method:'POST',body:JSON.stringify(Object.fromEntries(form))}),payload=await response.json();if(!response.ok){result.textContent=payload.message||'提交失败';return;}result.textContent='已提交';await renderSupportDialog(dialog);});
  body.querySelectorAll('[data-ticket-status]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const response=await fetch(`/api/support-tickets/${encodeURIComponent(button.dataset.ticketId)}`,{method:'PATCH',body:JSON.stringify({status:button.dataset.ticketStatus,note:button.dataset.ticketStatus==='resolved'?'已完成处理并等待企业复核。':'已接单并开始排查。'})});if(response.ok)await renderSupportDialog(dialog);else button.disabled=false;}));
 }catch(error){body.innerHTML=`<div class="support-error" role="alert"><strong>支持队列读取失败</strong><span>${escapeSupport(error.message)}</span><button type="button" class="quiet-button" data-retry>重试</button></div>`;body.querySelector('[data-retry]').addEventListener('click',()=>renderSupportDialog(dialog));}
}

async function loadTickets(){const response=await fetch('/api/support-tickets',{cache:'no-store'}),payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||'读取失败');return payload.tickets||[];}
function ticketList(tickets,actions){if(!tickets.length)return '<div class="support-empty">暂无工单。遇到阻断问题时可直接提交，不需要离开当前工作台。</div>';return `<div class="support-ticket-list">${tickets.map(ticket=>`<article class="support-ticket"><div class="support-ticket-main"><span>${escapeSupport(ticket.enterpriseName)} · ${escapeSupport(supportLabels[ticket.category]||ticket.category)}</span><strong>${escapeSupport(ticket.subject)}</strong><small>${escapeSupport(ticket.description)}</small></div><div class="support-ticket-state"><em class="severity-${ticket.severity}">${escapeSupport(severityLabels[ticket.severity]||ticket.severity)}</em><b>${escapeSupport(statusLabels[ticket.status]||ticket.status)}</b><small>${new Date(ticket.updatedAt).toLocaleString('zh-CN',{hour12:false})}</small>${actions&&['fde','admin'].includes(supportSession.user.role)&&!['resolved','closed'].includes(ticket.status)?`<button type="button" class="quiet-button" data-ticket-id="${escapeSupport(ticket.id)}" data-ticket-status="${ticket.status==='open'?'in_progress':'resolved'}">${ticket.status==='open'?'开始处理':'标记已解决'}</button>`:''}</div></article>`).join('')}</div>`;}
function escapeSupport(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
