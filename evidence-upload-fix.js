(() => {
  const labels = ['准入自述', '流程证据', '异常升级'];
  const mergeEnterpriseSteps = () => {
    const checklist = document.querySelector('#enterprise-checklist');
    const actions = document.querySelector('#enterprise-actions');
    const steps = [...document.querySelectorAll('#enterprise-checklist .tier-flow-step')];
    if (!checklist || !actions || steps.length !== 3) return;

    const buttons = new Map(
      [...actions.querySelectorAll('[data-tier-action]')].map(button => [button.dataset.tierAction, button]),
    );
    steps.forEach((step, index) => {
      const action = buttons.get(`tier${index}`);
      if (!action || step.dataset.merged === 'true') return;
      step.dataset.merged = 'true';
      step.tabIndex = 0;
      step.setAttribute('role', 'button');
      step.setAttribute('aria-label', `进入${labels[index]}`);
      const activate = event => {
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        action.click();
      };
      step.addEventListener('click', activate);
      step.addEventListener('keydown', activate);
    });
    actions.hidden = true;
    actions.setAttribute('aria-hidden', 'true');
  };

  (window.__fdeEnterpriseEnhancers ||= []).push(mergeEnterpriseSteps);
  mergeEnterpriseSteps();
})();

(() => {
  const syncConnectionSurface = () => {
    const enterprise = document.querySelector('#enterprise');
    const status = document.querySelector('#status');
    const pill = document.querySelector('.connection-pill');
    const enterpriseActive = Boolean(enterprise && !enterprise.hidden);
    if (status && status.hidden !== enterpriseActive) status.hidden = enterpriseActive;
    if (!pill) return;
    pill.dataset.originalLabel ||= pill.textContent.trim();
    const nextLabel = enterpriseActive ? '已连接' : pill.dataset.originalLabel;
    if (pill.textContent.trim() !== nextLabel) pill.innerHTML = `<span class="status-dot"></span>${nextLabel}`;
  };
  (window.__fdeEnterpriseEnhancers ||= []).push(syncConnectionSurface);
  syncConnectionSurface();
})();

(() => {
  const systemGroups = [
    ['财务 / ERP / 进销存', ['用友', '金蝶', '浪潮', 'SAP', 'Oracle', '鼎捷', '管家婆', '速达', '其他 ERP / 财务系统']],
    ['OA / 协同办公', ['钉钉', '飞书', '企业微信', '泛微 e-cology', '致远互联', '蓝凌 EKP', '其他 OA / 协同系统']],
    ['CRM / 客服 / 营销', ['纷享销客', '销售易', '神州云动', '八百客', '有赞', '微盟', '企微 SCRM', '其他 CRM / 客服系统']],
    ['制造 / 供应链 / 仓储', ['用友 U8 / U9', '金蝶云·星空', '鼎捷 T100', '浪潮 GS', '赛意 MES', '宝信 MES', '富勒 WMS', '科箭 TMS', '其他 MES / WMS / SCM']],
    ['项目 / 工单 / 研发', ['禅道', 'PingCode', 'Teambition', 'Jira', 'ServiceNow', '简道云', '明道云', '其他项目 / 工单系统']],
    ['表格 / 数据 / 自建', ['Excel', 'WPS 表格', '企业自建系统', 'MySQL / PostgreSQL', '数据仓库 / BI', 'API / 开放平台', '纸质单据 / 手工记录', '微信 / 邮件 / 聊天记录']],
  ];
  const painOptions = ['审批等待 / 无人值守', '跨部门转派', '重复录入 / 返工', '异常没有闭环', '数据口径不一致', '报表 / 数据提取耗时', '库存 / 订单协同', '客户响应 / 工单积压'];
  const noteOptions = {
    process: ['流程步骤和入口', '交接责任人或部门', '返工 / 退回节点', '异常分支和处理结果'],
    timing: ['开始和结束时间', '等待时长和积压量', '高峰时段', '无人值守时段'],
    data: ['字段完整性', '记录唯一性', '状态和时间字段', '脱敏范围'],
    system: ['系统名称和业务模块', '导出 / API 方式', '只读权限限制', '数据更新频率'],
    pain: ['错误 / 退回次数', '超时 / 积压数量', '受影响部门', '最近发生时间'],
  };
  const uploadHints = {
    process: '可上传审批流截图、录屏或流程导出，用于核对步骤、交接和返工节点。',
    timing: '可上传带时间戳的操作日志、流转记录或报表，用于核对等待、积压和无人值守。',
    data: '可上传脱敏样例表和字段说明，用于判断数据是否结构化、可追踪。',
    system: '可上传只读接口文档、导出样本或系统截图，用于判断数据能否接入。',
    pain: '可上传近 30 天错误、退回、超时或积压记录，用于量化问题规模。',
  };
  const kindLabels = {process: '流程证据', timing: '时效证据', data: '数据证据', system: '系统证据', pain: '痛点证据'};
  const reviewFocusToKind = new Map(Object.entries(noteOptions).flatMap(([kind, items]) => items.map(item => [item, kind])));
  const reviewFocusGroups = Object.entries(noteOptions).map(([kind, items]) => ({group: kindLabels[kind], items}));
  let modalRoot;
  let modalOpener = null;
  const tier0ChoiceDrafts = new Map();
  const tier0DraftKey = fieldName => `${window.__fdeAuth?.user?.enterpriseId || 'enterprise'}:tier0:${fieldName}`;
  const readTier0Draft = key => {
    if (tier0ChoiceDrafts.has(key)) return tier0ChoiceDrafts.get(key);
    try {
      const value = JSON.parse(sessionStorage.getItem(`fde-choice-draft:${key}`) || 'null');
      if (value) tier0ChoiceDrafts.set(key, value);
      return value;
    } catch {
      return null;
    }
  };
  const writeTier0Draft = (key, value) => {
    tier0ChoiceDrafts.set(key, value);
    try { sessionStorage.setItem(`fde-choice-draft:${key}`, JSON.stringify(value)); } catch {}
  };

  const closeChoiceModal = () => {
    if (!modalRoot) return;
    modalRoot.hidden = true;
    modalRoot.querySelector('.choice-modal-confirm').onclick = null;
    const opener = modalOpener;
    modalOpener = null;
    opener?.focus();
  };

  const ensureModal = () => {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement('div');
    modalRoot.className = 'choice-modal-root';
    modalRoot.hidden = true;
    modalRoot.setAttribute('role', 'dialog');
    modalRoot.setAttribute('aria-modal', 'true');
    modalRoot.setAttribute('aria-labelledby', 'choice-modal-title');
    modalRoot.innerHTML = '<div class="choice-modal" role="document"><div class="choice-modal-head"><div><span class="eyebrow">快速选择</span><h3 id="choice-modal-title" class="choice-modal-title"></h3></div><button type="button" class="choice-modal-close workbench-modal-close" aria-label="关闭选择窗口">×</button></div><div class="choice-modal-options"></div><label class="choice-modal-extra-label">补充说明（可选）<textarea class="choice-modal-extra" rows="3" placeholder="补充系统名称、业务背景或其他情况"></textarea></label><div class="choice-modal-foot"><button type="button" class="quiet-button choice-modal-cancel">取消</button><button type="button" class="primary-button choice-modal-confirm">确认选择</button></div></div>';
    document.body.append(modalRoot);
    modalRoot.querySelector('.choice-modal-close').addEventListener('click', closeChoiceModal);
    modalRoot.querySelector('.choice-modal-cancel').addEventListener('click', closeChoiceModal);
    modalRoot.addEventListener('click', event => { if (event.target === modalRoot) closeChoiceModal(); });
    document.addEventListener('keydown', event => { if (!modalRoot.hidden && event.key === 'Escape') closeChoiceModal(); });
    return modalRoot;
  };

  const openChoiceModal = ({title, options, selected = [], multiple = true, maxSelected = null, extra = '', extraLabel = '补充说明（可选）', onConfirm, opener = null}) => {
    const root = ensureModal();
    modalOpener = opener;
    const selectedSet = new Set(selected);
    root.querySelector('.choice-modal-title').textContent = title;
    const optionBox = root.querySelector('.choice-modal-options');
    optionBox.innerHTML = '';
    const groups = options.length && typeof options[0] === 'object' && !Array.isArray(options[0]) ? options : [{group: '', items: options}];
    groups.forEach(({group, items}) => {
      const section = document.createElement('section');
      section.className = 'choice-modal-group';
      if (group) { const heading = document.createElement('b'); heading.textContent = group; section.append(heading); }
      items.forEach(value => {
        const label = document.createElement('label');
        label.className = 'choice-modal-option';
        const input = document.createElement('input');
        input.type = multiple ? 'checkbox' : 'radio';
        input.name = 'choice-modal-option';
        input.value = value;
        input.checked = selectedSet.has(value);
        label.append(input, document.createTextNode(value));
        section.append(label);
      });
      optionBox.append(section);
    });
    const choiceInputs = [...root.querySelectorAll('input[name="choice-modal-option"]')];
    const syncChoiceLimit = () => {
      if (!maxSelected) return;
      const selectedCount = choiceInputs.filter(input => input.checked).length;
      choiceInputs.forEach(input => { input.disabled = !input.checked && selectedCount >= maxSelected; });
    };
    choiceInputs.forEach(input => input.addEventListener('change', syncChoiceLimit));
    syncChoiceLimit();
    const extraLabelNode = root.querySelector('.choice-modal-extra-label');
    extraLabelNode.firstChild.textContent = extraLabel;
    root.querySelector('.choice-modal-extra').value = extra || '';
    const confirm = root.querySelector('.choice-modal-confirm');
    const handler = () => {
      const values = [...root.querySelectorAll('input[name="choice-modal-option"]:checked')].map(input => input.value).slice(0, maxSelected || undefined);
      const supplement = root.querySelector('.choice-modal-extra').value.trim();
      onConfirm(values, supplement);
      closeChoiceModal();
    };
    confirm.onclick = handler;
    root.hidden = false;
    root.querySelector('.choice-modal-option input')?.focus();
  };

  const summaryText = (values, extra) => {
    const result = [...values];
    if (extra) result.push(`补充：${extra}`);
    return result.join('、');
  };

  const mountChoice = ({field, title, options, multiple = true, extra = '', extraLabel, initialSelected = [], onValueChange, draftKey = ''}) => {
    if (!field || field.dataset.modalEnhanced === 'true') return;
    const label = field.closest('label');
    if (!label) return;
    const restoredDraft = draftKey ? readTier0Draft(draftKey) : null;
    if (restoredDraft) {
      initialSelected = [...restoredDraft.values];
      extra = restoredDraft.extra;
    }
    field.dataset.modalEnhanced = 'true';
    field.required = false;
    field.hidden = true;
    field.setAttribute('aria-hidden', 'true');
    const wrapper = document.createElement('div');
    wrapper.className = 'choice-field';
    const caption = document.createElement('span');
    caption.className = 'choice-field-label';
    caption.textContent = label.firstChild?.textContent?.trim() || title;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'choice-trigger';
    trigger.textContent = '打开选择';
    trigger.setAttribute('aria-haspopup', 'dialog');
    const summary = document.createElement('small');
    summary.className = 'choice-summary';
    const setValue = (values, supplement, {notify = true} = {}) => {
      const value = summaryText(values, supplement);
      if (field instanceof HTMLSelectElement && value && ![...field.options].some(option => option.value === value)) {
        const option = new Option(value, value, true, true);
        option.dataset.modalValue = 'true';
        field.append(option);
      }
      field.value = value;
      summary.textContent = value;
      trigger.textContent = value ? `已选：${value}` : '打开选择';
      trigger.title = value || '打开选择';
      if (draftKey) writeTier0Draft(draftKey, {values: [...values], extra: supplement});
      if (notify) {
        field.dispatchEvent(new Event('input', {bubbles: true}));
        onValueChange?.(values, supplement);
      }
    };
    setValue(initialSelected, extra, {notify: false});
    trigger.addEventListener('click', () => openChoiceModal({title, options, selected: initialSelected, multiple, extra, extraLabel, opener: trigger, onConfirm: (values, supplement) => { initialSelected = values; extra = supplement; setValue(values, supplement); }}));
    wrapper.append(caption, trigger, summary, field);
    label.replaceWith(wrapper);
  };

  const roleGroups = [
    {group: '决策角色', items: ['企业老板 / 总经理', '分管副总 / 决策人']},
    {group: '业务角色', items: ['业务负责人', '运营负责人', '流程负责人', '部门负责人']},
    {group: '数据与系统角色', items: ['信息化 / IT 负责人', '数据负责人', '系统管理员']},
    {group: '配合角色', items: ['财务负责人', '客服 / 销售负责人', '采购 / 仓储负责人', '流程实际操作人']},
    {group: '其他', items: ['其他协作角色']},
  ];
  const enhanceRolePicker = form => {
    const fieldset = form.querySelector('.role-choice-fieldset');
    if (!fieldset || fieldset.dataset.modalEnhanced === 'true') return;
    const oldInputs = [...fieldset.querySelectorAll('[name="decisionMakerRole"]')];
    if (!oldInputs.length) return;
    fieldset.dataset.modalEnhanced = 'true';
    const draftKey = tier0DraftKey('decisionMakerRole');
    const restoredDraft = readTier0Draft(draftKey);
    const oldSelected = new Set(restoredDraft?.values || oldInputs.filter(input => input.checked).map(input => input.value));
    let roleExtra = restoredDraft?.extra || '';
    const values = roleGroups.flatMap(({items}) => items);
    const inputs = values.map(value => { const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'decisionMakerRole'; input.value = value; input.checked = oldSelected.has(value); return input; });
    const selected = () => inputs.filter(input => input.checked).map(input => input.value);
    const legend = fieldset.querySelector('legend');
    const hint = fieldset.querySelector('.field-hint');
    if (legend) legend.textContent = '企业协作角色（最多选择 3 项）';
    fieldset.innerHTML = '';
    if (legend) fieldset.append(legend);
    if (hint) { hint.textContent = '建议选择决策、业务和数据 / 系统配合角色，最多选择 3 项。'; fieldset.append(hint); }
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'choice-trigger';
    trigger.textContent = '选择协作角色（最多 3 项）';
    trigger.setAttribute('aria-haspopup', 'dialog');
    const summary = document.createElement('small');
    summary.className = 'choice-summary';
    const refresh = () => { const chosen = selected(); const value = summaryText(chosen, roleExtra); summary.textContent = value; trigger.textContent = value ? `已选：${value}` : '选择协作角色（最多 3 项）'; trigger.title = value || '选择协作角色（最多 3 项）'; };
    inputs.forEach(input => { input.hidden = true; input.disabled = false; fieldset.append(input); });
    refresh();
    trigger.addEventListener('click', () => openChoiceModal({title: '企业协作角色', options: roleGroups, selected: selected(), multiple: true, maxSelected: 3, extra: roleExtra, extraLabel: '角色补充说明（可选）', opener: trigger, onConfirm: (chosen, supplement) => { roleExtra = supplement; writeTier0Draft(draftKey, {values: [...chosen], extra: roleExtra}); inputs.forEach(input => { input.checked = chosen.includes(input.value); input.disabled = false; }); refresh(); }}));
    fieldset.insertBefore(trigger, inputs[0]);
    fieldset.insertBefore(summary, inputs[0]);
  };

  const enhanceTier0 = form => {
    if (!form || !form.closest('#enterprise-detail') || !form.querySelector('[name="painPoints"]')) return;
    enhanceRolePicker(form);
    mountChoice({field: form.querySelector('[name="painPoints"]'), title: '选择要优先解决的诉求', options: painOptions, extraLabel: '补充诉求（可选）', draftKey: tier0DraftKey('painPoints')});
    mountChoice({field: form.querySelector('[name="systemLedger"]'), title: '选择现有工具 / 系统', options: systemGroups.map(([group, items]) => ({group, items})), extraLabel: '补充工具和用途（可选）', draftKey: tier0DraftKey('systemLedger')});
    if (form.dataset.choiceValidation !== 'true') {
      form.dataset.choiceValidation = 'true';
      form.addEventListener('submit', event => {
        const missing = ['painPoints', 'systemLedger'].filter(name => !form.querySelector(`[name="${name}"]`)?.value.trim());
        const roles = [...form.querySelectorAll('[name="decisionMakerRole"]:checked')].map(input => input.value);
        if (missing.length || !roles.length) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const result = form.querySelector('.upload-result');
          if (result) {
            result.className = 'upload-result error';
            result.textContent = missing.length
              ? '请在弹框中至少选择一项，或填写补充说明后再提交。'
              : '请至少选择 1 个企业协作角色后再提交。';
          }
          return;
        }
        let decisionMaker = form.querySelector('[name="decisionMaker"][type="hidden"]');
        if (!decisionMaker) {
          decisionMaker = document.createElement('input');
          decisionMaker.type = 'hidden';
          decisionMaker.name = 'decisionMaker';
          form.append(decisionMaker);
        }
        decisionMaker.value = roles.join('、');
      }, {capture: true});
    }
  };

  const enhanceTier1 = form => {
    if (!form || !form.matches('.tier1-form')) return;
    form.querySelectorAll('.evidence-disclosure').forEach(card => {
      const kind = card.querySelector('input[type="file"]')?.name.replace(/^file-/, '') || card.dataset.kind;
      if (!kind) return;
      const kindLabel = kindLabels[kind] || kind;
      const file = card.querySelector('input[type="file"]');
      if (file) {
        file.multiple = true;
        file.setAttribute('aria-label', `${kindLabel}，可批量选择文件`);
        const label = file.closest('label');
        if (label && !label.querySelector('.file-scope-hint')) {
          const text = label.firstChild;
          if (text && text.nodeType === Node.TEXT_NODE) text.textContent = '上传材料（可批量选择）';
          const hint = document.createElement('small');
          hint.className = 'file-scope-hint';
          hint.textContent = uploadHints[kind] || '请上传与当前证据类别直接相关的脱敏材料。';
          label.insertBefore(hint, file.closest('.file-picker-row') || file);
        }
        const artifact = card.querySelector(`[name="artifact-${kind}"]`);
        const row = file.closest('.file-picker-row');
        if (row) {
          let fileList = row.parentElement.querySelector('.file-list');
          if (!fileList) {
            fileList = document.createElement('div');
            fileList.className = 'file-list';
            row.insertAdjacentElement('afterend', fileList);
          }
          file._selectedFiles = file._selectedFiles || [...file.files];
          const fileKey = item => `${item.name}:${item.size}:${item.lastModified}`;
          const syncFiles = () => {
            const files = file._selectedFiles || [];
            fileList.innerHTML = '';
            files.forEach((item, index) => {
              const entry = document.createElement('div');
              entry.className = 'file-entry';
              const name = document.createElement('span');
              name.textContent = `${item.name}（${Math.ceil(item.size / 1024)} KB）`;
              const remove = document.createElement('button');
              remove.type = 'button';
              remove.className = 'file-remove';
              remove.textContent = '移除';
              remove.setAttribute('aria-label', `移除${item.name}`);
              remove.addEventListener('click', () => { file._selectedFiles.splice(index, 1); syncFiles(); });
              entry.append(name, remove);
              fileList.append(entry);
            });
            if (artifact) artifact.value = files.map(item => item.name).join('、');
            try {
              const transfer = new DataTransfer();
              files.forEach(item => transfer.items.add(item));
              file.files = transfer.files;
            } catch {}
          };
          file._syncFiles = syncFiles;
          const isNewFileControl = file.dataset.batchEnhanced !== 'true';
          if (isNewFileControl) {
            file.dataset.batchEnhanced = 'true';
            file.addEventListener('change', () => {
              const existing = file._selectedFiles || [];
              const known = new Set(existing.map(fileKey));
              [...file.files].forEach(item => { if (!known.has(fileKey(item))) existing.push(item); });
              file._selectedFiles = existing;
              syncFiles();
            });
          }
          if (isNewFileControl) syncFiles();
        }
      }
      const sourceField = card.querySelector(`select[name="source-${kind}"]`);
      if (sourceField) {
        const sourceHidden = document.createElement('input');
        sourceHidden.type = 'hidden';
        sourceHidden.name = sourceField.name;
        sourceField.replaceWith(sourceHidden);
        mountChoice({field: sourceHidden, title: `${kindLabel}：选择来源系统`, options: systemGroups.map(([group, items]) => ({group, items})), extraLabel: '补充来源系统或模块（可选）'});
      }
      const note = card.querySelector('textarea[name^="note-"]');
      if (!note || note.dataset.modalEnhanced === 'true') return;
      const label = note.closest('label');
      if (!label) return;
      const original = note.value.trim();
      note.dataset.modalEnhanced = 'true';
      note.hidden = true;
      const caption = document.createElement('span');
      caption.className = 'choice-field-label';
      caption.textContent = '可复核说明';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'choice-trigger';
      trigger.textContent = '选择复核重点';
      trigger.setAttribute('aria-haspopup', 'dialog');
      const summary = document.createElement('small');
      summary.className = 'choice-summary';
      let selected = [];
      let extra = original;
      const refresh = () => { note.value = summaryText(selected, extra); summary.textContent = note.value; trigger.textContent = note.value ? `已选：${note.value}` : '选择复核重点'; trigger.title = note.value || '选择复核重点'; };
      refresh();
      trigger.addEventListener('click', () => openChoiceModal({title: `${kindLabel}：选择复核重点`, options: noteOptions[kind] || [], selected, extra, extraLabel: '复核补充说明（可选）', opener: trigger, onConfirm: (values, supplement) => { selected = values; extra = supplement; refresh(); }}));
      const wrapper = document.createElement('div');
      wrapper.className = 'choice-field evidence-note-choice';
      wrapper.append(caption, trigger, summary, note);
      label.replaceWith(wrapper);
    });
  };

  const enhancePrinciples = () => {
    const checklist = document.querySelector('#enterprise-checklist');
    const guardrails = checklist?.querySelector('.enterprise-guardrails');
    if (!checklist || !guardrails || guardrails.dataset.principlesMerged === 'true') return;
    guardrails.dataset.principlesMerged = 'true';
    const details = document.createElement('details');
    details.className = 'enterprise-principles';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span><b>资料提交原则</b><small>只交够判断的材料；异常时再升级</small></span><em>查看 4 条规则</em>';
    details.append(summary, guardrails);
    const rule = checklist.querySelector('.tier-flow-rule');
    if (rule) rule.replaceWith(details);
    else checklist.prepend(details);
  };

  const enhanceEvidencePackage = form => {
    if (!form || !form.matches('.tier1-form')) return;
    const grid = form.querySelector('.evidence-grid');
    const cards = [...form.querySelectorAll('.evidence-grid > .evidence-disclosure')];
    if (!grid || cards.length !== 5 || grid.dataset.packageEnhanced === 'true') return;
    grid.dataset.packageEnhanced = 'true';
    const packageBox = document.createElement('section');
    packageBox.className = 'evidence-package';
    packageBox.dataset.packageEnhanced = 'true';
    const heading = document.createElement('div');
    heading.className = 'evidence-package-head';
    heading.innerHTML = '<div><span class="eyebrow">统一证据包</span><h3>一次收集，按复核重点归类</h3><p>同一份材料可以同时服务多个验证目标；先选复核重点，再批量添加材料。</p></div>';
    const categoryBox = document.createElement('div');
    categoryBox.className = 'evidence-package-categories';
    categoryBox.setAttribute('aria-label', '选择材料要验证的问题');
    categoryBox.hidden = true;
    categoryBox.setAttribute('aria-hidden', 'true');
    cards.forEach(card => {
      const checkbox = card.querySelector('[name="evidence-kind"]');
      const kind = checkbox?.value;
      if (!checkbox || !kind) return;
      const chip = document.createElement('label');
      chip.className = 'evidence-category-chip';
      chip.append(checkbox, document.createTextNode(kindLabels[kind] || kind));
      categoryBox.append(chip);
    });
    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'evidence-package-uploader';
    uploadLabel.innerHTML = '<span class="choice-field-label">批量添加材料</span><small>支持 CSV、JSON、XLSX、PDF、PNG、JPEG；单文件 2 MB、单次 8 MB、最多 20 个。重复添加会合并，提交后形成不可变版本。</small>';
    const packageInput = document.createElement('input');
    packageInput.type = 'file';
    packageInput.multiple = true;
    packageInput.accept = '.csv,.json,.xlsx,.pdf,.png,.jpg,.jpeg';
    packageInput.setAttribute('aria-label', '批量添加证据材料');
    uploadLabel.append(packageInput);
    const packageFilesList = document.createElement('div');
    packageFilesList.className = 'file-list evidence-package-file-list';
    packageFilesList.setAttribute('aria-label', '已添加材料');
    uploadLabel.append(packageFilesList);
    const commonBox = document.createElement('section');
    commonBox.className = 'evidence-package-common';
    commonBox.innerHTML = '<b>材料说明</b><small>上传材料只填写时间范围和复核重点；来源固定记录为“企业补充材料”，系统直连来源由连接器自动留痕。</small>';
    const commonSource = cards[0]?.querySelector('.choice-field');
    const commonPeriod = cards[0]?.querySelector('select[name^="period-"]')?.closest('label');
    const sourceInputs = cards.map(card => card.querySelector('input[name^="source-"]')).filter(Boolean);
    const periodInputs = cards.map(card => card.querySelector('select[name^="period-"]')).filter(Boolean);
    const artifactLabels = cards.map(card => card.querySelector('input[name^="artifact-"]')?.closest('label')).filter(Boolean);
    if (commonSource) commonSource.hidden = true;
    if (commonPeriod) commonBox.append(commonPeriod);
    const reviewLabel = document.createElement('label');
    reviewLabel.textContent = '复核重点';
    const reviewField = document.createElement('textarea');
    reviewField.name = 'verificationNote';
    reviewField.rows = 2;
    reviewLabel.append(reviewField);
    commonBox.append(reviewLabel);
    const noteInputs = cards.map(card => card.querySelector('textarea[name^="note-"]')).filter(Boolean);
    const evidenceInputs = cards.map(card => card.querySelector('input[name="evidence-kind"]')).filter(Boolean);
    const syncReviewNotes = () => noteInputs.forEach(note => { note.value = reviewField.value || ''; });
    const syncReviewKinds = values => {
      const selectedKinds = new Set(values.map(value => reviewFocusToKind.get(value)).filter(Boolean));
      evidenceInputs.forEach(input => { input.checked = selectedKinds.has(input.value); });
    };
    mountChoice({field: reviewField, title: '选择复核重点', options: reviewFocusGroups, initialSelected: ['流程步骤和入口', '开始和结束时间', '字段完整性'], extraLabel: '复核补充说明（可选）', onValueChange: values => { syncReviewKinds(values); syncReviewNotes(); }});
    reviewField.addEventListener('input', syncReviewNotes);
    syncReviewNotes();
    artifactLabels.forEach(label => label.classList.add('evidence-shared-duplicate'));
    cards.forEach(card => {
      const source = card.querySelector('.choice-field');
      if (source && source !== commonSource) source.classList.add('evidence-shared-duplicate');
      card.querySelector('.evidence-note-choice')?.classList.add('evidence-shared-duplicate');
      const period = card.querySelector('select[name^="period-"]')?.closest('label');
      if (period && period !== commonPeriod) {
        period.classList.add('evidence-shared-duplicate');
        period.querySelector('select')?.removeAttribute('required');
      }
    });
    const supplementalSource = '企业补充材料';
    sourceInputs.forEach(input => { input.value = supplementalSource; });
    const commonPeriodInput = commonPeriod?.querySelector('select');
    const syncCommonPeriod = () => periodInputs.forEach(input => { if (input !== commonPeriodInput) input.value = commonPeriodInput?.value || ''; });
    commonPeriodInput?.addEventListener('change', syncCommonPeriod);
    const syncCommonFieldsBeforeSubmit = () => {
      sourceInputs.forEach(input => { input.value = supplementalSource; });
      const periodValue = commonPeriodInput?.value || '';
      periodInputs.forEach(input => { input.value = periodValue; });
      const reviewValue = reviewField.closest('.choice-field')?.querySelector('.choice-trigger')?.title || reviewField.value || '';
      noteInputs.forEach(note => { note.value = reviewValue; });
    };
    form.addEventListener('submit', syncCommonFieldsBeforeSubmit, {capture: true});
    const selectedKinds = () => [...categoryBox.querySelectorAll('input[name="evidence-kind"]:checked')].map(input => input.value);
    let packageFiles = [];
    const fileKey = item => `${item.name}:${item.size}:${item.lastModified}`;
    const syncSelectedKinds = () => selectedKinds().forEach(kind => {
      const target = form.querySelector(`input[name="file-${kind}"]`);
      if (!target) return;
      target._selectedFiles = [...packageFiles];
      target._syncFiles?.();
    });
    const renderPackageFiles = () => {
      packageInput._selectedFiles = [...packageFiles];
      packageFilesList.innerHTML = '';
      packageFiles.forEach((item, index) => {
        const entry = document.createElement('div');
        entry.className = 'file-entry';
        const name = document.createElement('span');
        name.textContent = `${item.name}（${Math.ceil(item.size / 1024)} KB）`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'file-remove';
        remove.textContent = '移除';
        remove.setAttribute('aria-label', `移除${item.name}`);
        remove.addEventListener('click', () => { packageFiles.splice(index, 1); renderPackageFiles(); syncSelectedKinds(); });
        entry.append(name, remove);
        packageFilesList.append(entry);
      });
    };
    categoryBox.addEventListener('change', () => { syncSelectedKinds(); });
    const status = document.createElement('p');
    status.className = 'evidence-package-status';
    status.setAttribute('aria-live', 'polite');
    packageInput.addEventListener('change', () => {
      const files = [...packageInput.files];
      const kinds = selectedKinds();
      if (!files.length) return;
      if (!kinds.length) {
        status.textContent = '请先选择至少一个复核重点，再添加材料。';
        packageInput.value = '';
        return;
      }
      const known = new Set(packageFiles.map(fileKey));
      files.forEach(item => { if (!known.has(fileKey(item))) packageFiles.push(item); });
      renderPackageFiles();
      syncSelectedKinds();
      status.textContent = `已将 ${files.length} 份材料归入：${kinds.map(kind => kindLabels[kind] || kind).join('、')}`;
      packageInput.value = '';
    });
    grid.classList.add('evidence-package-cards');
    grid.replaceWith(packageBox);
    packageBox.append(heading, categoryBox, uploadLabel, commonBox, status, grid);
  };

  const enhanceForms = () => {
    enhancePrinciples();
    const form = document.querySelector('#enterprise-detail form.tier-form');
    if (!form) return;
    enhanceTier0(form);
    enhanceTier1(form);
    enhanceEvidencePackage(form);
  };
  (window.__fdeEnterpriseEnhancers ||= []).push(enhanceForms);
  enhanceForms();
})();

window.fdeEnhanceEnterprise = () => {
  for (const enhance of window.__fdeEnterpriseEnhancers || []) enhance();
};
window.fdeEnhanceEnterprise();
