const draftSession=await window.fdeSessionReady;
const draftObserver=new MutationObserver(()=>installDraftProtection());
draftObserver.observe(document.querySelector('#enterprise')||document.body,{childList:true,subtree:true});
installDraftProtection();

function installDraftProtection(){
 document.querySelectorAll('#enterprise form').forEach((form,index)=>{
  if(form.dataset.draftReady==='true')return;
  form.dataset.draftReady='true';
  const title=form.parentElement?.querySelector('h3')?.textContent?.trim()||form.className||`form-${index}`;
  const key=`fde-session-draft:${draftSession.user.enterpriseId||'unknown'}:${title}`;
  restoreDraft(form,key);
  const indicator=document.createElement('span');indicator.className='draft-indicator';indicator.textContent='未提交内容将在本标签页自动保存';form.append(indicator);
  let timer;
  const save=()=>{clearTimeout(timer);timer=setTimeout(()=>{sessionStorage.setItem(key,JSON.stringify(serializeDraft(form)));indicator.textContent='草稿已自动保存';},180);};
  form.addEventListener('input',save);form.addEventListener('change',save);
  form.addEventListener('submit',()=>setTimeout(()=>{if(!form.isConnected)sessionStorage.removeItem(key);},1200));
 });
}

function serializeDraft(form){const fields={};for(const element of form.elements){if(!element.name||element.type==='file'||element.type==='password'||element.type==='submit'||element.type==='button')continue;if(['checkbox','radio'].includes(element.type)){if(!fields[element.name])fields[element.name]=[];if(element.checked)fields[element.name].push(element.value);}else fields[element.name]=element.value;}return fields;}
function restoreDraft(form,key){let value;try{value=JSON.parse(sessionStorage.getItem(key)||'null');}catch{return;}if(!value)return;for(const [name,saved] of Object.entries(value)){const fields=form.elements.namedItem(name);if(!fields)continue;const group=fields instanceof RadioNodeList?[...fields]:[fields];for(const field of group){if(['checkbox','radio'].includes(field.type))field.checked=Array.isArray(saved)&&saved.includes(field.value);else field.value=String(saved??'');}}}
