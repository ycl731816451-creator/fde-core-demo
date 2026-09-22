const session=await window.fdeSessionReady;
const roleLabel={admin:'平台管理员',fde:'FDE 顾问',enterprise_owner:'企业授权方（兼容）',enterprise_admin:'企业管理员',enterprise_authorizer:'系统授权人',enterprise_process_owner:'业务流程负责人',enterprise_result_reviewer:'结果验收人'};
const enterpriseRoles=new Set(['enterprise_owner','enterprise_admin','enterprise_authorizer','enterprise_process_owner','enterprise_result_reviewer']);
const summary=document.querySelector('#account-summary');
const label=roleLabel[session.user.role]||session.user.role;
summary.textContent=accountLabel(session.user.displayName,label);
if(session.user.mustSetPassword)installInitialPasswordGate();
if(enterpriseRoles.has(session.user.role)){
 const response=await fetch('/api/screenings');
 if(response.ok){await response.json();summary.textContent=label;}
}

document.querySelector('#logout-button')?.addEventListener('click',async()=>{
 const response=await fetch('/api/auth/logout',{method:'POST',body:'{}'});
 if(response.ok)location.replace('/login.html');
});

window.fdeInstallInvitationPanel=(container=document.querySelector('#settings-content'))=>installInvitationPanel(container);
if(['admin','fde'].includes(session.user.role))window.fdeInstallInvitationPanel();

async function installInvitationPanel(container){
 const mount=container?.querySelector('[data-invitation-mount]');
 if(!mount||mount.querySelector('[data-invitation-panel]')||mount.dataset.invitationLoading==='true')return;
 mount.dataset.invitationLoading='true';
 const response=await fetch('/api/screenings');
 if(!response.ok){delete mount.dataset.invitationLoading;return;}
 const payload=await response.json();
 // 项目工作区会在连接器和统一流程模块完成水合后重绘。
 // 请求期间旧挂载点若已离开 DOM，不能把邀请面板写回孤儿节点；
 // 应把安装动作交给当前工作区的同企业挂载点。
 if(!mount.isConnected){
  delete mount.dataset.invitationLoading;
  const enterpriseId=mount.dataset.enterpriseId||'';
  const liveMount=[...document.querySelectorAll('[data-invitation-mount]')].find(item=>!enterpriseId||item.dataset.enterpriseId===enterpriseId);
  if(liveMount&&liveMount!==mount)void installInvitationPanel(liveMount.parentElement);
  return;
 }
 const enterprises=[...new Map(payload.screenings.filter(item=>!item.archived&&!item.deleted).map(item=>[item.enterpriseId,{id:item.enterpriseId,name:item.name}])).values()];
 const fixedEnterpriseId=mount.dataset.enterpriseId||'';
 const visibleEnterprises=fixedEnterpriseId?enterprises.filter(item=>item.id===fixedEnterpriseId):enterprises;
 if(!visibleEnterprises.length){delete mount.dataset.invitationLoading;mount.innerHTML='<div class="access-error" role="alert">当前项目不可邀请成员：企业不存在、已归档或已移除。</div>';return;}
 const panel=document.createElement('section');
 panel.className='settings-card invitation-panel';
 panel.dataset.invitationPanel='true';
 panel.innerHTML=`<div class="settings-card-heading"><div><span class="eyebrow">ACCESS & INVITATIONS</span><h3>${fixedEnterpriseId?'为当前项目邀请成员':'企业成员与邀请'}</h3></div><span class="status-badge good">服务端受控</span></div><p>系统自动生成登录账号与一次性激活链接；受邀人首次进入时自行设置密码。</p><form class="invitation-form"><label class="invitation-enterprise-field">邀请企业<select name="enterpriseId" ${fixedEnterpriseId?'aria-readonly="true"':''}>${visibleEnterprises.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label><label>成员职责<select name="role"><option value="enterprise_process_owner">业务流程负责人</option><option value="enterprise_authorizer">系统授权人</option><option value="enterprise_result_reviewer">结果验收人</option><option value="enterprise_admin">企业管理员</option></select></label><label>有效期<select name="expiresInHours"><option value="24">24 小时</option><option value="72" selected>72 小时</option><option value="168">7 天</option></select></label><button class="primary-button" type="submit">一键生成成员账号</button></form><div class="invitation-result" hidden aria-live="polite"><strong>邀请已生成，请复制后发送给企业成员</strong><label>登录账号<input readonly data-invitation-account></label><label class="invitation-link-field">一次性激活链接<input readonly data-invitation-url></label><div class="invitation-result-actions"><button type="button" class="primary-button" data-copy-invitation>复制账号与链接</button><button type="button" class="quiet-button" data-revoke-current>撤销本次邀请</button></div><small data-invitation-expiry></small></div>`;
 mount.append(panel);
 panel.querySelector('[data-revoke-current]')?.insertAdjacentHTML('beforebegin','<button type="button" class="quiet-button" data-open-isolated>在隔离企业会话打开</button>');
 restoreLatestInvitation(panel,fixedEnterpriseId||visibleEnterprises[0].id);
 delete mount.dataset.invitationLoading;
 panel.querySelector('form').addEventListener('submit',event=>createInvite(event,panel));
 panel.querySelector('[data-copy-invitation]').addEventListener('click',async()=>{
  const account=panel.querySelector('[data-invitation-account]').value,url=panel.querySelector('[data-invitation-url]').value;await navigator.clipboard.writeText(`登录账号：${account}\n激活链接：${url}`);panel.querySelector('[data-copy-invitation]').textContent='已复制账号与链接';
 });
 panel.querySelector('[data-revoke-current]').addEventListener('click',async()=>{const saved=latestInvitation(panel);if(!saved)return;const response=await fetch(`/api/enterprises/${encodeURIComponent(saved.enterpriseId)}/invitations/${encodeURIComponent(saved.invitationId)}`,{method:'DELETE',body:'{}'});if(!response.ok)return;sessionStorage.removeItem(invitationStorageKey(saved.enterpriseId));panel.querySelector('.invitation-result').hidden=true;await installAccessLifecycle(panel,true);});
 panel.querySelector('[data-open-isolated]').addEventListener('click',()=>{const saved=latestInvitation(panel);if(!saved)return;const url=new URL(saved.url);url.hostname=url.hostname==='127.0.0.1'?'localhost':'127.0.0.1';window.open(url.href,'_blank','noopener');});
 void installAccessLifecycle(panel);
}

async function installAccessLifecycle(panel,force=false){
 let section=panel.querySelector('[data-access-lifecycle]');
 if(!section){panel.insertAdjacentHTML('beforeend','<section class="access-lifecycle" data-access-lifecycle><div class="access-lifecycle-head"><div><strong>邀请与成员状态</strong><span>可撤销未使用邀请；停用成员后其现有会话立即失效。</span></div><button type="button" class="quiet-button" data-refresh-access>刷新</button></div><div data-access-content role="status">正在读取…</div></section>');section=panel.querySelector('[data-access-lifecycle]');panel.querySelector('[data-refresh-access]').addEventListener('click',()=>installAccessLifecycle(panel,true));panel.querySelector('select[name="enterpriseId"]')?.addEventListener('change',event=>{restoreLatestInvitation(panel,event.currentTarget.value);void installAccessLifecycle(panel,true);});}
 if(section.dataset.loading==='true'&&!force)return;section.dataset.loading='true';const enterpriseId=panel.querySelector('select[name="enterpriseId"]')?.value,content=section.querySelector('[data-access-content]');content.textContent='正在读取邀请与成员…';
 try{const [invitationResponse,memberResponse]=await Promise.all([fetch(`/api/enterprises/${encodeURIComponent(enterpriseId)}/invitations`,{cache:'no-store'}),fetch(`/api/enterprises/${encodeURIComponent(enterpriseId)}/members`,{cache:'no-store'})]),invitations=await invitationResponse.json(),members=await memberResponse.json();if(!invitationResponse.ok||!memberResponse.ok)throw new Error(invitations.message||members.message||'读取失败');content.innerHTML=`<div class="access-lifecycle-grid"><div><h4>邀请记录</h4>${accessInvitationList(invitations.invitations||[])}</div><div><h4>企业成员</h4>${accessMemberList(members.members||[])}</div></div>`;content.querySelectorAll('[data-revoke-invitation]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const response=await fetch(`/api/enterprises/${encodeURIComponent(enterpriseId)}/invitations/${encodeURIComponent(button.dataset.revokeInvitation)}`,{method:'DELETE',body:'{}'});if(response.ok)await installAccessLifecycle(panel,true);else button.disabled=false;}));content.querySelectorAll('[data-member-status]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const response=await fetch(`/api/enterprises/${encodeURIComponent(enterpriseId)}/members/${encodeURIComponent(button.dataset.memberId)}`,{method:'PATCH',body:JSON.stringify({status:button.dataset.memberStatus})});if(response.ok)await installAccessLifecycle(panel,true);else button.disabled=false;}));}catch(error){content.innerHTML=`<div class="access-error" role="alert">${escapeHtml(error.message)} <button type="button" class="quiet-button" data-access-retry>重试</button></div>`;content.querySelector('[data-access-retry]')?.addEventListener('click',()=>installAccessLifecycle(panel,true));}finally{section.dataset.loading='false';}
}
function accessInvitationList(items){if(!items.length)return '<p class="access-empty">暂无邀请记录。</p>';return `<div class="access-list">${items.slice(0,8).map(item=>{const state=item.revokedAt?'已撤销':item.acceptedAt?'已激活':Date.parse(item.expiresAt)<=Date.now()?'已过期':'待激活';return `<article><div><strong>${escapeHtml(item.displayName||'企业成员')} · ${escapeHtml(state)}</strong><span>${escapeHtml(item.username||'')} · 有效至 ${new Date(item.expiresAt).toLocaleString('zh-CN',{hour12:false})}</span></div>${state==='待激活'?`<button type="button" class="quiet-button" data-revoke-invitation="${escapeHtml(item.id)}">撤销</button>`:''}</article>`;}).join('')}</div>`;}
function accessMemberList(items){if(!items.length)return '<p class="access-empty">暂无企业成员。</p>';return `<div class="access-list">${items.map(item=>{const state=item.status==='pending'?'待激活':item.status==='disabled'?'已停用':item.mustSetPassword?'待设置密码':'已启用',canToggle=item.status==='active'&&!item.mustSetPassword||item.status==='disabled'&&!item.mustSetPassword;return `<article><div><strong>${escapeHtml(item.displayName)}</strong><span>${escapeHtml(item.username)} · ${state}</span></div>${canToggle?`<button type="button" class="quiet-button" data-member-id="${escapeHtml(item.id)}" data-member-status="${item.status==='active'?'disabled':'active'}">${item.status==='active'?'停用':'启用'}</button>`:'<span class="member-guidance">通过邀请完成激活</span>'}</article>`;}).join('')}</div>`;}

async function createInvite(event,panel){
 event.preventDefault();const submit=event.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent='正在生成…';const form=new FormData(event.currentTarget),enterpriseId=form.get('enterpriseId'),box=panel.querySelector('.invitation-result');
 const role=form.get('role'),displayName=roleLabel[role]||'企业成员';
 try{const response=await fetch(`/api/enterprises/${encodeURIComponent(enterpriseId)}/invitations`,{method:'POST',body:JSON.stringify({role,displayName,expiresInHours:Number(form.get('expiresInHours'))})});
 const payload=await response.json();box.hidden=false;if(!response.ok){panel.querySelector('[data-invitation-expiry]').textContent=payload.message||'账号生成失败';return;}
 const url=new URL(payload.invitation.path,location.origin).href;box.querySelector('[data-invitation-account]').value=payload.invitation.member.accountId;box.querySelector('[data-invitation-url]').value=url;box.querySelector('[data-invitation-expiry]').textContent=`${payload.invitation.member.displayName} · 有效至 ${new Date(payload.invitation.expiresAt).toLocaleString('zh-CN')}`;panel.querySelector('[data-copy-invitation]').textContent='复制账号与链接';
 sessionStorage.setItem(invitationStorageKey(enterpriseId),JSON.stringify({enterpriseId,invitationId:payload.invitation.id,account:payload.invitation.member.accountId,url,expiry:`${payload.invitation.member.displayName} · 有效至 ${new Date(payload.invitation.expiresAt).toLocaleString('zh-CN')}`}));
 await installAccessLifecycle(panel,true);}finally{submit.disabled=false;submit.textContent='一键生成成员账号';}
 window.dispatchEvent(new CustomEvent('fde:project-facts-changed',{detail:{enterpriseId,view:'project'}}));
}

function invitationStorageKey(enterpriseId){return `fde.latestInvitation.${enterpriseId}`;}
function latestInvitation(panel){const enterpriseId=panel.querySelector('[name="enterpriseId"]')?.value||panel.closest('[data-enterprise-id]')?.dataset.enterpriseId||'';try{return JSON.parse(sessionStorage.getItem(invitationStorageKey(enterpriseId))||'null');}catch{return null;}}
function restoreLatestInvitation(panel,enterpriseId){const box=panel.querySelector('.invitation-result');box.hidden=true;try{const saved=JSON.parse(sessionStorage.getItem(invitationStorageKey(enterpriseId))||'null');if(!saved)return;box.hidden=false;box.querySelector('[data-invitation-account]').value=saved.account;box.querySelector('[data-invitation-url]').value=saved.url;box.querySelector('[data-invitation-expiry]').textContent=`${saved.expiry} · 本浏览器可继续复制`;panel.querySelector('[data-copy-invitation]').textContent='复制账号与链接';}catch{sessionStorage.removeItem(invitationStorageKey(enterpriseId));}}

function installInitialPasswordGate(){
 const dialog=document.createElement('dialog');dialog.className='account-activation-dialog';dialog.innerHTML=`<form method="dialog" class="account-activation-shell" data-password-setup><span class="eyebrow">FIRST SIGN-IN</span><h2>设置你的私密密码</h2><p>受邀身份已激活。请设置仅你本人掌握的长期密码，完成后即可使用企业端全部功能。</p><div class="activation-identity"><span>${escapeHtml(session.user.displayName)}</span><strong>${escapeHtml(session.user.username)}</strong></div><label>新密码<div class="password-control"><input name="password" type="password" autocomplete="new-password" minlength="10" required placeholder="至少 10 个字符"><button type="button" data-password-visibility>显示</button></div></label><label>再次输入<input name="confirmation" type="password" autocomplete="new-password" minlength="10" required placeholder="再次输入新密码"></label><p class="activation-status" data-activation-status aria-live="polite"></p><div class="activation-actions"><button type="button" class="quiet-button" data-activation-logout>安全退出</button><button type="submit" class="primary-button">保存密码并继续</button></div></form>`;document.body.append(dialog);dialog.addEventListener('cancel',event=>event.preventDefault());dialog.querySelector('[data-password-visibility]').addEventListener('click',event=>{const input=dialog.querySelector('[name=password]'),show=input.type==='password';input.type=show?'text':'password';event.currentTarget.textContent=show?'隐藏':'显示';});dialog.querySelector('[data-activation-logout]').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST',body:'{}'});location.replace('/login.html');});dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const password=event.currentTarget.elements.password.value,confirmation=event.currentTarget.elements.confirmation.value,status=dialog.querySelector('[data-activation-status]'),button=event.currentTarget.querySelector('[type=submit]');if(password.length<10){status.textContent='密码至少需要 10 个字符。';return;}if(password!==confirmation){status.textContent='两次输入的密码不一致。';return;}button.disabled=true;status.textContent='正在安全保存…';const response=await fetch('/api/auth/password',{method:'POST',body:JSON.stringify({password})}),payload=await response.json().catch(()=>({}));if(!response.ok){status.textContent=payload.message||'密码设置失败';button.disabled=false;return;}session.user.mustSetPassword=false;if(window.__fdeAuth?.user)window.__fdeAuth.user.mustSetPassword=false;location.reload();});dialog.showModal();setTimeout(()=>dialog.querySelector('[name=password]')?.focus(),0);
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function accountLabel(displayName,label){const name=String(displayName??'').trim(),role=String(label??'').trim(),parts=name.split(/\s*·\s*/).filter(Boolean),deduped=parts.filter((part,index)=>index===0||part!==parts[index-1]).join(' · ');return deduped===role||deduped.endsWith(`· ${role}`)?deduped:`${deduped} · ${role}`;}
