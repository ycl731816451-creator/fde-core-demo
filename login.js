const params=new URLSearchParams(location.search),inviteToken=params.get('invite'),form=document.querySelector('#login-form'),status=document.querySelector('#form-status'),demoSection=document.querySelector('[data-demo-accounts]'),isStaticDemoHost=location.hostname.endsWith('.github.io');

if(location.protocol==='file:')location.replace('http://127.0.0.1:4174/login.html');
else if(inviteToken)setupInvitation(inviteToken);
else setupDemoMode();

form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;status.className='form-status';status.textContent=inviteToken?'正在激活受邀身份…':'正在验证身份…';
 try{
  const payload=inviteToken?{}:Object.fromEntries(new FormData(form));
  const endpoint=inviteToken?`/api/auth/invitations/${encodeURIComponent(inviteToken)}/accept`:'/api/auth/login';
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
  if(!response.ok)throw new Error(result.message||'操作失败');
  status.className='form-status success';status.textContent='身份验证成功，正在进入…';
  const next=safeNext(params.get('next'))||result.landing||'/';location.replace(next);
 }catch(error){status.className='form-status error';status.textContent=error.message;button.disabled=false;}
});
form.dataset.loginReady='true';window.__fdeLoginReady=true;
form.querySelector('button[type="submit"]').disabled=false;

const invitationRoleLabels={enterprise_owner:'企业授权方（兼容）',enterprise_admin:'企业管理员',enterprise_authorizer:'系统授权人',enterprise_process_owner:'业务流程负责人',enterprise_result_reviewer:'结果验收人'};

async function setupInvitation(token){
 document.querySelector('[data-demo-accounts]').hidden=true;document.querySelector('[data-page-title]').textContent='确认并进入企业端';document.querySelector('[data-page-note]').textContent='身份已由服务方绑定。确认后将一次性激活，不需要重新创建账号。';document.querySelectorAll('[data-credential-field]').forEach(field=>field.hidden=true);form.elements.username.required=false;form.elements.password.required=false;form.querySelector('button[type="submit"] span:first-child').textContent='确认身份并进入';
 try{const response=await fetch(`/api/auth/invitations/${encodeURIComponent(token)}`),payload=await response.json();if(!response.ok)throw new Error(payload.message||'邀请无效');const invite=payload.invitation,identity=document.querySelector('[data-invitation-identity]');identity.hidden=false;identity.querySelector('[data-invitation-enterprise]').textContent=invite.enterpriseName;identity.querySelector('[data-invitation-member]').textContent=invite.member.displayName;identity.querySelector('[data-invitation-account]').textContent=invite.member.accountId;identity.querySelector('[data-invitation-role]').textContent=invitationRoleLabels[invite.role]||'企业成员';document.querySelector('[data-page-note]').textContent=`请核对受邀身份。链接有效至 ${new Date(invite.expiresAt).toLocaleString('zh-CN')}，且只能使用一次。`;}catch(error){status.className='form-status error';status.textContent=error.message;form.querySelector('button[type="submit"]').disabled=true;}
}

async function setupDemoMode(){
 if(isStaticDemoHost){
  demoSection.hidden=false;
  demoSection.querySelectorAll('[data-demo-account]').forEach(button=>button.addEventListener('click',()=>enterDemo(button)));
  return;
 }
 try{
  const response=await fetch('/api/auth/demo-mode',{headers:{accept:'application/json'}}),payload=await response.json();
  if(!response.ok||!payload.enabled)return;
  demoSection.hidden=false;
  demoSection.querySelectorAll('[data-demo-account]').forEach(button=>button.addEventListener('click',()=>enterDemo(button)));
 }catch{}
}

async function enterDemo(button){
 const buttons=[...demoSection.querySelectorAll('button')];buttons.forEach(item=>item.disabled=true);status.className='form-status';status.textContent=`正在进入${button.querySelector('b').textContent}…`;
 if(isStaticDemoHost){location.replace(staticDemoLanding(button.dataset.demoAccount));return;}
 try{
  const response=await fetch('/api/auth/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({account:button.dataset.demoAccount})}),result=await response.json();
  if(!response.ok)throw new Error(result.message||'本地演示登录不可用');
  status.className='form-status success';status.textContent='身份验证成功，正在进入…';location.replace(safeNext(params.get('next'))||result.landing||'/');
 }catch(error){status.className='form-status error';status.textContent=error.message;buttons.forEach(item=>item.disabled=false);}
}

function staticDemoLanding(account){
 const base=location.pathname.replace(/login\.html$/,'');
 const section=account==='enterprise'?'enterprise':account==='admin'?'settings':'queue';
 const entry=account==='enterprise'?'&entry=enterprise_authorizer':'';
 return `${base}?demo=1&enterpriseId=qingshan${entry}#${section}`;
}

function safeNext(value){if(!value||!value.startsWith('/')||value.startsWith('//')||value.startsWith('/login'))return null;const url=new URL(value,location.origin),allowed=new Set(['projectSection','sourceType','prepSection','reportType','reportSection','settingsSection','enterpriseId']);for(const key of [...url.searchParams.keys()])if(!allowed.has(key))url.searchParams.delete(key);return `${url.pathname}${url.search}${url.hash}`;}
