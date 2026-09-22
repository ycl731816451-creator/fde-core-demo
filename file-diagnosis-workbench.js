const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(name,label,value='')=>`<label>${label}<textarea name="${name}" required minlength="4" maxlength="4000" rows="3">${esc(value)}</textarea></label>`;
function findingFields(files,n=0){
 return `<fieldset data-file-finding><legend>证据发现 ${n+1}</legend>${field('title','问题或已核实事实')}${field('fact','具体事实（写明文件页码、行号或记录编号）')}${field('impact','业务影响（无法量化时明确说明）')}${field('suggestion','下一步建议')}<label>已复核的不同业务实例编号（可选，每行一个；交企业确认）<textarea name="businessInstances" maxlength="4000" rows="2"></textarea></label><label>引用已复核文件<select name="evidenceId" required>${files.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label><details><summary>补充引用其他业务实例的证据</summary><p>仅在确认不同业务实例时补充引用；多个文件不自动证明业务高频。</p>${files.map(f=>`<label><input type="checkbox" name="additionalEvidence" value="${f.id}">${esc(f.name)}</label>`).join('')}</details></fieldset>`;
}
function assessmentMarkup(a){
 if(!a)return '';
 const p=a.payload;
 return `<article><h4>文件评审 #${a.id} · ${esc(a.createdAt)}</h4><p>${esc(p.summary)}</p>${p.findings.map((f,i)=>`<section><h4>${i+1}. ${esc(f.title)}</h4><p>事实：${esc(f.fact)}</p><p>需核对的业务实例：${esc(f.businessInstances?.join('、')||'未声明重复实例，不能直接进入自动化候选')}</p><p>影响：${esc(f.impact)}</p><p>建议：${esc(f.suggestion)}</p><small>证据：${f.evidenceIds.map(id=>esc(p.basis.files.find(f=>f.id===id)?.name||id)).join('、')}</small></section>`).join('')}<p>判断边界：${esc(p.limitations)}</p><small>企业信息 V${p.basis.admissionVersion} · 资料 V${p.basis.materialsVersion}</small></article>`;
}
function reportMarkup(report){
 const p=report.payload;
 return `<article data-file-report><h3>远程初筛报告 #${report.id}</h3><p>发布时间：${esc(report.createdAt)} · 人工证据评审</p>${assessmentMarkup(p.assessment)}<h4>FDE决策：${esc(p.decision)}</h4><p>依据：${esc(p.rationale)}</p><p>下一步：${esc(p.nextAction)}</p><p>企业确认：${esc(p.confirmation.payload.note)}</p><p>${esc(p.boundary)}</p></article>`;
}
export function mountFileDiagnosis(container,w,role,submit,{reportsOnly=false}={}){
 if(!container)return;
 let panel=container.querySelector(':scope > [data-file-workspace]');
 if(!w){panel?.remove();return;}
 const signature=JSON.stringify([w,role,reportsOnly]);
 if(panel?.__signature===signature){panel.hidden=false;return;}
 const previousDraft=panel?.querySelector('form');
 // Do not erase an in-progress editor when new server facts arrive.
 if(previousDraft?.dataset.dirty==='true'&&panel.__signature!==signature){
  panel.querySelector('[data-file-feedback]').textContent='项目资料已变化。当前输入已保留，提交时会检查版本；请先保存所填文字再刷新本页。';
  return;
 }
 panel?.remove();panel=document.createElement('section');panel.dataset.fileWorkspace='';panel.className='enterprise-history';panel.__signature=signature;
 const fde=role==='fde';
 const files=w.basis.files.filter(f=>f.status==='verified');
 const reports=w.history.filter(e=>e.kind==='report');
 let action='';
 if(!reportsOnly&&fde&&w.ready)action=`<details ${!w.assessment||w.confirmation?.payload.accepted===false?'open':''}><summary>填写 / 重新提交文件评审</summary><form data-file-operation="assessment">${field('summary','评审摘要')}${findingFields(files)}<button type="button" class="quiet-button" data-add-finding>增加一项发现</button>${field('limitations','证据缺口与判断边界')}<button type="submit" class="primary-button">提交评审，交企业核对</button></form></details>`;
 if(!reportsOnly&&!fde&&w.assessment&&!w.confirmation&&w.ready)action=`<form data-file-operation="confirmation"><label>事实核对结果<select name="accepted"><option value="true">确认事实</option><option value="false">存在异议，退回FDE重新评审</option></select></label>${field('note','确认或异议说明')}<button type="submit" class="primary-button">提交本版核对结果</button></form>`;
 if(!reportsOnly&&fde&&w.confirmation?.payload.accepted&&!w.report)action+=`<form data-file-operation="report"><label>FDE决策<select name="decision">${['继续远程补证','远程试点','条件性驻场','不建议驻场'].map(x=>`<option>${x}</option>`).join('')}</select></label>${field('rationale','决策依据')}${field('nextAction','下一步、负责人和完成条件')}<button type="submit" class="primary-button">发布本版初筛报告</button></form>`;
 panel.innerHTML=`<h3>文件证据诊断</h3><p>${esc(w.boundary)}</p>${!w.ready?'<p>请先提交企业信息及材料，等待FDE完成文件复核。</p>':''}${w.report?reportMarkup(w.report):assessmentMarkup(w.assessment)}${w.confirmation?`<p>企业核对：${w.confirmation.payload.accepted?'已确认':'存在异议'} · ${esc(w.confirmation.payload.note)}</p>`:''}${action}<p data-file-feedback role="status" aria-live="polite"></p><details><summary>历史报告（${reports.length}）</summary>${reports.map(report=>`<details><summary>报告 #${report.id} · ${esc(report.createdAt)} · ${w.report?.id===report.id?'当前有效':'历史版本，不代表当前资料'}</summary>${reportMarkup(report)}</details>`).join('')||'<p>尚无已发布报告。</p>'}</details>${reports.length?'<button class="quiet-button" type="button" data-export-file-report>导出报告与证据引用（JSON）</button>':''}`;
 container.append(panel);
 panel.querySelector('[data-add-finding]')?.addEventListener('click',event=>{const count=panel.querySelectorAll('[data-file-finding]').length;if(count<20)event.currentTarget.insertAdjacentHTML('beforebegin',findingFields(files,count));});
 panel.querySelectorAll('form').forEach(form=>{
  form.addEventListener('input',()=>{form.dataset.dirty='true';});
  form.addEventListener('submit',async event=>{
   event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
   const data=Object.fromEntries(new FormData(form));data.baseHash=w.baseHash;data.assessmentId=w.assessment?.id;
   if(form.dataset.fileOperation==='assessment')data.findings=[...form.querySelectorAll('[data-file-finding]')].map(group=>Object.fromEntries(['title','fact','impact','suggestion'].map(key=>[key,group.querySelector('[name="'+key+'"]').value]).concat([['evidenceIds',[...new Set([group.querySelector('[name=evidenceId]').value,...[...group.querySelectorAll('[name=additionalEvidence]:checked')].map(input=>input.value)])]]])));
   if(form.dataset.fileOperation==='assessment')data.findings.forEach((finding,index)=>{finding.businessInstances=[...new Set(panel.querySelectorAll('[data-file-finding]')[index].querySelector('[name=businessInstances]').value.split('\n').map(x=>x.trim()).filter(Boolean))];});
   if(form.dataset.fileOperation==='confirmation')data.accepted=data.accepted==='true';
   try{await submit(form.dataset.fileOperation,data);form.dataset.dirty='false';panel.remove();}
   catch(error){panel.querySelector('[data-file-feedback]').textContent=error.message;}
   finally{button.disabled=false;}
  });
 });
 panel.querySelector('[data-export-file-report]')?.addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(w.report||reports[0],null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fde-file-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
}
