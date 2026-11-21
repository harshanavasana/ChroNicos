'use strict';

let currentProfile = null;
let confirmedResumeData = null;
let profileDraft = null;
let objectiveDraft = '';
let savedResumeData = null;
let isGenerating = false;
let entryId = 0;
let generationMode = 'quick';
let deepResearchReport = null;
let currentRequestId = null;
let currentOperationFinished = false;

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  wireProfileEvents();
  wireSettingsEvents();
  wireRecentEvents();
  await checkCurrentPage();
  try {
    await loadSettings();
    await renderRecentContacts();
    await checkLicenseStatus();
    await restorePendingOperation();
  } catch (error) {
    showSettingsStatus(`Could not load extension data: ${error.message}`, 'error');
  }
});

async function checkLicenseStatus() {
  const settings = await loadStoredSettings();
  const status = document.getElementById('key-status');
  status.textContent = settings.userApiKey ? '● AI Mode' : '● Free Mode';
  status.className = 'key-status active';
}

function setResumeSelectionDisabled(disabled) {
  document.getElementById('include-resume').disabled = disabled;
  document.querySelectorAll('#resume-prompt-preview input[type="checkbox"]').forEach(input => {
    input.disabled = disabled || !document.getElementById('include-resume').checked;
  });
}

function releaseGenerationLock(button) {
  isGenerating = false;
  button.disabled = false;
  if (generationMode === 'quick' || (generationMode === 'deep' && !deepResearchReport)) {
    setResumeSelectionDisabled(false);
  }
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(button => button.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
  if (name === 'recent') renderRecentContacts().catch(error => showCurrentStatus(error.message, 'error'));
  if (name === 'current' && profileDraft) {
    document.getElementById('confirm-quick-ai').checked = false;
    document.getElementById('confirm-deep-research').checked = false;
    document.getElementById('confirm-deep-generation').checked = false;
    refreshConsentPreviews().catch(error => showCurrentStatus(error.message, 'error'));
  }
}

async function checkCurrentPage() {
  const banner = document.getElementById('page-warning');
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeUrl = tabs[0]?.url || '';
    if (ProfileData.isLinkedInProfileUrl(activeUrl)) {
      banner.textContent = 'LinkedIn profile detected. Only the URL is checked; enter profile details manually.';
      const profileUrlInput = document.getElementById('profile-url-input');
      if (!profileUrlInput.value) profileUrlInput.value = activeUrl.split(/[?#]/)[0];
    } else {
      banner.textContent = 'No LinkedIn profile page detected. You can still enter profile details manually.';
    }
  } catch (error) {
    banner.textContent = `Could not check the active tab: ${error.message}`;
  }
  banner.classList.remove('hidden');
}

function wireProfileEvents() {
  document.getElementById('add-experience-btn').addEventListener('click', () => {
    addProfileEntry('experience-list', [
      ['title', 'Job title', 'input'],
      ['company', 'Company', 'input'],
      ['duration', 'Duration', 'input'],
      ['description', 'Description', 'textarea']
    ]);
  });
  document.getElementById('add-education-btn').addEventListener('click', () => {
    addProfileEntry('education-list', [
      ['institution', 'Institution', 'input'],
      ['degree', 'Degree', 'input'],
      ['fieldOfStudy', 'Field of study', 'input']
    ]);
  });
  document.getElementById('review-profile-btn').addEventListener('click', () => {
    handleReviewProfile().catch(error => showCurrentStatus(error.message, 'error'));
  });
  document.getElementById('edit-profile-btn').addEventListener('click', handleEditProfile);
  document.getElementById('confirm-profile-btn').addEventListener('click', handleConfirmProfile);
  document.getElementById('cancel-operation-btn').addEventListener('click', cancelCurrentOperation);
  document.getElementById('include-resume').addEventListener('change', handleApprovedDataChange);
  document.getElementById('resume-prompt-preview').addEventListener('change', handleApprovedDataChange);
  document.getElementById('regenerate-btn').addEventListener('click', handleRegenerate);
  document.getElementById('copy-btn').addEventListener('click', handleCopy);
  document.getElementById('generated-message').addEventListener('input', updateCharCount);
}

function addProfileEntry(listId, fields) {
  const entry = document.createElement('div');
  entry.className = 'profile-entry';
  const entryNumber = ++entryId;

  fields.forEach(([field, label, elementName]) => {
    const group = document.createElement('div');
    group.className = 'field-group full';
    const inputId = `profile-entry-${entryNumber}-${field}`;
    const labelElement = document.createElement('label');
    labelElement.className = 'field-label';
    labelElement.htmlFor = inputId;
    labelElement.textContent = label;
    const input = document.createElement(elementName);
    input.id = inputId;
    input.dataset.field = field;
    input.className = elementName === 'textarea' ? 'field-textarea' : 'field-input';
    if (elementName === 'textarea') input.rows = 2;
    group.append(labelElement, input);
    entry.appendChild(group);
  });

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn-link profile-entry-remove';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => entry.remove());
  entry.appendChild(removeButton);
  document.getElementById(listId).appendChild(entry);
}

function collectProfile() {
  const collectEntries = listId => Array.from(
    document.querySelectorAll(`#${listId} .profile-entry`)
  ).map(entry => Object.fromEntries(
    Array.from(entry.querySelectorAll('[data-field]')).map(input => [input.dataset.field, input.value])
  ));

  return ProfileData.normalizeProfile({
    name: document.getElementById('profile-name-input').value,
    headline: document.getElementById('profile-headline-input').value,
    location: document.getElementById('profile-location-input').value,
    profileUrl: document.getElementById('profile-url-input').value,
    company: document.getElementById('profile-company-input').value,
    about: document.getElementById('profile-about-input').value,
    experience: collectEntries('experience-list'),
    education: collectEntries('education-list'),
    skills: document.getElementById('profile-skills-input').value
  });
}

async function handleReviewProfile() {
  const profile = collectProfile();
  const validationError = ProfileData.validateProfile(profile);
  if (validationError) {
    showCurrentStatus(validationError, 'error');
    return;
  }

  profileDraft = profile;
  generationMode = document.querySelector('input[name="generation-mode"]:checked').value;
  deepResearchReport = null;
  document.getElementById('confirm-deep-research').checked = false;
  document.getElementById('confirm-deep-generation').checked = false;
  document.getElementById('confirm-quick-ai').checked = false;
  document.getElementById('deep-consent').classList.toggle('hidden', generationMode !== 'deep');
  document.getElementById('quick-ai-consent').classList.add('hidden');
  document.getElementById('research-preview').classList.add('hidden');
  document.getElementById('confirm-profile-btn').textContent =
    generationMode === 'deep' ? 'Research recipient' : 'Confirm & Generate';
  if (generationMode === 'deep') {
    const company = profile.company;
    const role = profile.headline;
    if (!profile.name || !company || !role) {
      showCurrentStatus('Deep Mode needs the recipient’s name, current company, and role. Add those details before continuing.', 'error');
      return;
    }
  }
  objectiveDraft = ResumeData.sanitizeText(document.getElementById('message-objective').value).slice(0, 300);
  renderProfileReview(profileDraft);
  setResumeSelectionDisabled(false);
  await refreshConsentPreviews();
  const objectiveReview = document.getElementById('objective-review');
  objectiveReview.replaceChildren();
  if (objectiveDraft) addReviewField(objectiveReview, 'Message objective', objectiveDraft);
  document.getElementById('profile-editor').classList.add('hidden');
  document.getElementById('profile-review').classList.remove('hidden');
  clearCurrentStatus();
}

function renderProfileReview(profile) {
  const container = document.getElementById('profile-review-content');
  container.replaceChildren();
  addReviewField(container, 'Name', profile.name);
  addReviewField(container, 'Headline', profile.headline);
  addReviewField(container, 'Current company', profile.company);
  addReviewField(container, 'Location', profile.location);
  addReviewField(container, 'Profile URL', profile.profileUrl);
  addReviewField(container, 'About', profile.about);

  if (profile.experience.length) {
    const section = addReviewSection(container, 'Experience');
    profile.experience.forEach(item => {
      const lines = [
        [item.title, item.company].filter(Boolean).join(' at '),
        item.duration,
        item.description
      ].filter(Boolean);
      addReviewItem(section, lines);
    });
  }

  if (profile.education.length) {
    const section = addReviewSection(container, 'Education');
    profile.education.forEach(item => {
      addReviewItem(section, [item.institution, item.degree, item.fieldOfStudy].filter(Boolean));
    });
  }

  if (profile.skills.length) addReviewField(container, 'Skills', profile.skills.join(', '));

  const resumeInclusion = document.getElementById('resume-inclusion');
  if (savedResumeData && ResumeData.hasResumeDetails(savedResumeData)) {
    const promptResume = ResumeData.forPrompt(savedResumeData);
    document.getElementById('include-resume').checked = false;
    renderResumePromptOptions(promptResume);
    resumeInclusion.classList.remove('hidden');
  } else {
    resumeInclusion.classList.add('hidden');
  }
  updateResumeOptions();
}

function renderResumePromptOptions(resume) {
  const container = document.getElementById('resume-prompt-preview');
  container.replaceChildren();
  Object.entries(resume).forEach(([section, value]) => {
    const items = Array.isArray(value) ? value : value ? [value] : [];
    if (!items.length) return;

    const heading = document.createElement('h4');
    heading.className = 'field-label';
    heading.textContent = section[0].toUpperCase() + section.slice(1);
    container.appendChild(heading);
    items.forEach((item, index) => {
      const label = document.createElement('label');
      label.className = 'resume-fact-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.resumeSection = section;
      checkbox.dataset.resumeIndex = String(index);
      const text = document.createElement('span');
      text.textContent = item;
      label.append(checkbox, text);
      container.appendChild(label);
    });
  });
}

function updateResumeOptions() {
  const enabled = document.getElementById('include-resume').checked;
  document.querySelectorAll('#resume-prompt-preview input[type="checkbox"]').forEach(input => {
    input.disabled = !enabled;
  });
}

function handleApprovedDataChange() {
  updateResumeOptions();
  document.getElementById('confirm-quick-ai').checked = false;
  document.getElementById('confirm-deep-research').checked = false;
  document.getElementById('confirm-deep-generation').checked = false;
  refreshConsentPreviews().catch(error => showCurrentStatus(error.message, 'error'));
}

async function refreshConsentPreviews() {
  if (!profileDraft) return;
  const settings = await loadStoredSettings();
  const resumeData = getSelectedResumeData();
  const quickConsent = document.getElementById('quick-ai-consent');
  const deepConsent = document.getElementById('deep-consent');
  quickConsent.classList.toggle('hidden', generationMode !== 'quick' || !settings.userApiKey);
  deepConsent.classList.toggle('hidden', generationMode !== 'deep');

  if (generationMode === 'quick' && settings.userApiKey) {
    renderPrivacyPreview('quick-ai-request-preview', RequestData.quickMessage(
      profileDraft,
      resumeData,
      objectiveDraft,
      settings,
      document.getElementById('message-type').value,
      document.getElementById('tone').value
    ));
  }
  if (generationMode === 'deep') {
    renderPrivacyPreview('deep-research-request-preview', RequestData.deepResearchApproval(
      profileDraft,
      resumeData,
      objectiveDraft
    ));
    if (deepResearchReport) {
      renderPrivacyPreview('deep-generation-request-preview', RequestData.deepMessage(
        profileDraft,
        resumeData,
        objectiveDraft,
        settings,
        document.getElementById('message-type').value,
        document.getElementById('tone').value,
        deepResearchReport
      ));
    }
  }
}

function renderPrivacyPreview(elementId, payload) {
  document.getElementById(elementId).textContent = JSON.stringify(payload, null, 2);
}

function getSelectedResumeData() {
  if (!savedResumeData || !document.getElementById('include-resume').checked) return null;
  const selection = {};
  document.querySelectorAll('#resume-prompt-preview input[type="checkbox"]:checked').forEach(input => {
    const section = input.dataset.resumeSection;
    if (section === 'summary') {
      selection.summary = true;
      return;
    }
    if (!selection[section]) selection[section] = [];
    selection[section].push(Number(input.dataset.resumeIndex));
  });
  const selected = ResumeData.selectForPrompt(savedResumeData, selection);
  return ResumeData.hasResumeDetails(selected) ? selected : null;
}

function addReviewField(container, label, value) {
  if (!value) return;
  const section = addReviewSection(container, label);
  addReviewItem(section, [value]);
}

function addReviewSection(container, title) {
  const section = document.createElement('section');
  section.className = 'profile-review-section';
  const heading = document.createElement('h3');
  heading.className = 'field-label';
  heading.textContent = title;
  section.appendChild(heading);
  container.appendChild(section);
  return section;
}

function addReviewItem(section, lines) {
  const item = document.createElement('div');
  item.className = 'profile-review-item';
  lines.forEach(line => {
    const text = document.createElement('p');
    text.textContent = line;
    item.appendChild(text);
  });
  section.appendChild(item);
}

function handleEditProfile() {
  if (isGenerating) {
    showCurrentStatus('Wait for the active request to finish before changing recipient details.', 'warning');
    return;
  }
  currentProfile = null;
  confirmedResumeData = null;
  deepResearchReport = null;
  document.getElementById('research-preview').classList.add('hidden');
  document.getElementById('research-preview-content').replaceChildren();
  clearSensitivePreviews();
  setResumeSelectionDisabled(false);
  document.getElementById('profile-review').classList.add('hidden');
  document.getElementById('profile-editor').classList.remove('hidden');
  clearCurrentStatus();
}

async function handleConfirmProfile() {
  const button = document.getElementById('confirm-profile-btn');
  if (isGenerating || button.disabled || !profileDraft) return;
  const resumeData = getSelectedResumeData();
  if (document.getElementById('include-resume').checked && savedResumeData && !resumeData) {
    showCurrentStatus('Select at least one resume detail, or uncheck resume personalization.', 'error');
    return;
  }
  button.disabled = true;
  isGenerating = true;
  setResumeSelectionDisabled(true);
  let settings;
  try {
    settings = await loadStoredSettings();
  } catch (error) {
    releaseGenerationLock(button);
    showCurrentStatus(error.message, 'error');
    return;
  }
  const researchStage = generationMode === 'deep' && !deepResearchReport;
  if (generationMode === 'deep' && !settings.userApiKey) {
    releaseGenerationLock(button);
    showCurrentStatus('Deep Mode requires an Anthropic API key. Add one in Settings.', 'error');
    return;
  }
  if (researchStage && !document.getElementById('confirm-deep-research').checked) {
    releaseGenerationLock(button);
    showCurrentStatus('Approve the Deep Mode research request before starting.', 'error');
    return;
  }
  if (generationMode === 'deep' && deepResearchReport &&
      !document.getElementById('confirm-deep-generation').checked) {
    releaseGenerationLock(button);
    showCurrentStatus('Approve this message-generation request before continuing.', 'error');
    return;
  }
  if (generationMode === 'quick' && settings.userApiKey &&
      !document.getElementById('confirm-quick-ai').checked) {
    releaseGenerationLock(button);
    showCurrentStatus('Review and approve this Quick Mode AI request before continuing.', 'error');
    return;
  }
  currentProfile = ProfileData.normalizeProfile(profileDraft);
  confirmedResumeData = resumeData;
  button.textContent = generationMode === 'deep' && !deepResearchReport ? 'Researching…' : 'Generating…';
  clearCurrentStatus();

  try {
    if (researchStage) {
      deepResearchReport = await callDeepResearch(currentProfile, confirmedResumeData, objectiveDraft);
      renderResearchReport(deepResearchReport);
      setResumeSelectionDisabled(true);
      document.getElementById('research-preview').classList.remove('hidden');
      document.getElementById('confirm-deep-generation').checked = false;
      await refreshConsentPreviews();
      button.textContent = 'Generate from reviewed research';
      showCurrentStatus('Research complete. Review the identity assessment, findings, and source links before generating.', 'success');
      return;
    }
    const message = generationMode === 'deep'
      ? await callDeepGenerate(currentProfile, confirmedResumeData, objectiveDraft, deepResearchReport)
      : await callQuickGenerate(currentProfile, confirmedResumeData, objectiveDraft);
    renderMessage(message);
    await saveRecentContactSafely(currentProfile, message);
    if (!document.getElementById('status-message').classList.contains('status-warning')) {
      showCurrentStatus('Message ready. Review it before sending.', 'success');
    }
  } catch (error) {
    showCurrentStatus(error.message, 'error');
  } finally {
    await acknowledgeCurrentOperation();
    isGenerating = false;
    button.disabled = false;
    document.getElementById('cancel-operation-btn').classList.toggle(
      'hidden',
      !currentRequestId || currentOperationFinished
    );
    if (generationMode === 'quick' || (generationMode === 'deep' && !deepResearchReport)) {
      setResumeSelectionDisabled(false);
    }
    if (researchStage) document.getElementById('confirm-deep-research').checked = false;
    if (generationMode === 'deep' && !researchStage) {
      document.getElementById('confirm-deep-generation').checked = false;
    }
    if (generationMode === 'quick' && settings?.userApiKey) {
      document.getElementById('confirm-quick-ai').checked = false;
    }
    button.textContent = generationMode === 'deep'
      ? (deepResearchReport ? 'Generate from reviewed research' : 'Research recipient')
      : 'Confirm & Generate';
  }
}

async function handleRegenerate() {
  const button = document.getElementById('regenerate-btn');
  if (isGenerating || button.disabled || !currentProfile) return;
  confirmedResumeData = getSelectedResumeData();
  if (document.getElementById('include-resume').checked && savedResumeData && !confirmedResumeData) {
    showCurrentStatus('Select at least one resume detail, or uncheck resume personalization.', 'error');
    return;
  }
  button.disabled = true;
  isGenerating = true;
  setResumeSelectionDisabled(true);
  let settings;
  try {
    settings = await loadStoredSettings();
  } catch (error) {
    releaseGenerationLock(button);
    showCurrentStatus(error.message, 'error');
    return;
  }
  if (generationMode === 'deep' && !settings.userApiKey) {
    releaseGenerationLock(button);
    showCurrentStatus('Deep Mode requires an Anthropic API key. Add one in Settings.', 'error');
    return;
  }
  if (generationMode === 'deep' && !document.getElementById('confirm-deep-generation').checked) {
    releaseGenerationLock(button);
    showCurrentStatus('Review and approve this Deep Mode message request before regenerating.', 'error');
    return;
  }
  if (generationMode === 'quick' && settings.userApiKey &&
      !document.getElementById('confirm-quick-ai').checked) {
    releaseGenerationLock(button);
    showCurrentStatus('Review and approve this Quick Mode AI request before regenerating.', 'error');
    return;
  }
  clearCurrentStatus();
  try {
    const message = generationMode === 'deep'
      ? await callDeepGenerate(currentProfile, confirmedResumeData, objectiveDraft, deepResearchReport)
      : await callQuickGenerate(currentProfile, confirmedResumeData, objectiveDraft);
    renderMessage(message);
    await saveRecentContactSafely(currentProfile, message);
    if (!document.getElementById('status-message').classList.contains('status-warning')) {
      showCurrentStatus('Message regenerated. Review it before sending.', 'success');
    }
  } catch (error) {
    showCurrentStatus(error.message, 'error');
  } finally {
    await acknowledgeCurrentOperation();
    isGenerating = false;
    button.disabled = false;
    document.getElementById('cancel-operation-btn').classList.toggle(
      'hidden',
      !currentRequestId || currentOperationFinished
    );
    if (generationMode === 'quick') setResumeSelectionDisabled(false);
    if (generationMode === 'deep') document.getElementById('confirm-deep-generation').checked = false;
    if (generationMode === 'quick' && settings.userApiKey) {
      document.getElementById('confirm-quick-ai').checked = false;
    }
  }
}

async function callQuickGenerate(profile, resumeData = null, objective = '') {
  const settings = await loadStoredSettings();
  const messageType = document.getElementById('message-type').value;
  const tone = document.getElementById('tone').value;
  const response = await sendTrackedOperation({
    action: 'generateMessage',
    data: {
      profileData: profile,
      resumeData,
      objective,
      settings: { userName: settings.userName, userBio: settings.userBio },
      messageType,
      tone,
      aiConsent: Boolean(settings.userApiKey)
    }
  });
  if (response.generatedMessage === undefined) throw new Error('Message generation returned no message.');
  return response.generatedMessage;
}

async function callDeepResearch(profile, resumeData, objective) {
  const response = await sendTrackedOperation({
    action: 'researchRecipient',
    data: { profileData: profile, resumeData, objective, researchConsent: true }
  });
  if (!response.researchReport) throw new Error('Research returned no report.');
  return response.researchReport;
}

async function callDeepGenerate(profile, resumeData, objective, researchReport) {
  const settings = await loadStoredSettings();
  const response = await sendTrackedOperation({
    action: 'generateDeepMessage',
    data: {
      profileData: profile,
      resumeData,
      objective,
      settings: { userName: settings.userName, userBio: settings.userBio },
      messageType: document.getElementById('message-type').value,
      tone: document.getElementById('tone').value,
      researchReport,
      aiConsent: true
    }
  });
  if (response.generatedMessage === undefined) throw new Error('Message generation returned no message.');
  return response.generatedMessage;
}

function renderResearchReport(report) {
  const container = document.getElementById('research-preview-content');
  container.replaceChildren();
  const sourceById = new Map((report.sources || []).map(source => [source.id, source]));

  const identity = addReviewSection(container, 'Identity assessment');
  addReviewItem(identity, [
    `Match confidence: ${report.identityConfidence || 'low'}`,
    report.identityRationale || 'No reliable person-to-company match was established.',
    ...((report.identitySourceIds || []).map(id => `Supporting source: ${id}`))
  ]);

  const addFindings = (title, items) => {
    const section = addReviewSection(container, title);
    if (!items.length) {
      addReviewItem(section, ['No cited findings available.']);
      return;
    }
    items.forEach(item => {
      addReviewItem(section, [
        item.claim,
        `Confidence: ${item.confidence}${item.confidence === 'low' ? ' — not used in the message' : ''}`,
        `Sources: ${item.sourceIds.map(id => sourceById.get(id)?.title ? `${id} (${sourceById.get(id).title})` : id).join('; ')}`
      ]);
    });
  };
  addFindings('Person findings', report.personFindings || []);
  addFindings('Company findings', report.companyFindings || []);

  const connections = addReviewSection(container, 'Possible professional connections');
  if (!report.connections?.length) {
    addReviewItem(connections, ['No resume connection was supported by both a cited finding and a selected resume fact.']);
  } else {
    report.connections.forEach(connection => {
      addReviewItem(connections, [
        `Recipient interest: ${connection.recipientInterest}`,
        `Your selected resume fact: ${connection.userExperience}`,
        `Potential relevance: ${connection.relevance}${connection.relevance === 'low' ? ' — not used in the message' : ''}`,
        connection.explanation,
        `Sources: ${connection.sourceIds.join(', ')}`
      ].filter(Boolean));
    });
  }

  const sources = addReviewSection(container, 'Cited sources');
  if (!report.sources?.length) {
    addReviewItem(sources, ['No sources were cited. No research claim will be used.']);
  } else {
    report.sources.forEach(source => {
      const item = document.createElement('div');
      item.className = 'research-source';
      const label = document.createElement('span');
      const metadata = [
        `Type: ${source.sourceType?.replace(/_/g, ' ') || 'other'}`,
        `credibility: ${source.credibility || 'low'}`,
        `relevance: ${source.relevance || 'low'}`,
        source.publicationDate ? `published: ${source.publicationDate}` : 'publication date not established'
      ].join(' · ');
      label.textContent = `${source.id}: ${source.title} — ${metadata} `;
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.url;
      item.append(label, link);
      sources.appendChild(item);
    });
  }
  if (report.limitations?.length) {
    const limitations = addReviewSection(container, 'Research limitations');
    report.limitations.forEach(text => addReviewItem(limitations, [text]));
  }
}

async function saveRecentContact(profile, message) {
  await Cache.addContact({
    name: profile.name || 'Unknown',
    headline: profile.headline,
    company: profile.company,
    message,
    timestamp: Date.now()
  });
}

async function saveRecentContactSafely(profile, message) {
  try {
    await saveRecentContact(profile, message);
    showCurrentStatus('Message ready. Review it before sending.', 'success');
  } catch (error) {
    showCurrentStatus(`Message generated, but recent history could not be saved: ${error.message}`, 'warning');
  }
}

async function sendTrackedOperation(operation) {
  if (currentRequestId && !currentOperationFinished) {
    const pending = await sendToBackground({
      action: 'getOperationStatus',
      requestId: currentRequestId
    });
    if (pending.operation?.status === 'running') {
      throw new Error('The previous request is still running. Wait, cancel it, or reopen the popup to reconnect.');
    }
    if (pending.operation?.status === 'completed') {
      currentOperationFinished = true;
      showRecoveredOperation(pending.operation);
      await acknowledgeCurrentOperation();
      if (pending.operation.result) return pending.operation.result;
      throw new Error('The previous request completed, but its result was unavailable. Your saved data is unchanged; retry if needed.');
    }
    currentOperationFinished = true;
    await acknowledgeCurrentOperation();
  }
  const requestId = createRequestId();
  currentRequestId = requestId;
  currentOperationFinished = false;
  await setInSessionStorage({ activeOperationRequestId: requestId });
  document.getElementById('cancel-operation-btn').classList.remove('hidden');
  return sendToBackground({ ...operation, requestId });
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

async function cancelCurrentOperation() {
  if (!currentRequestId) return;
  try {
    const response = await sendToBackground({
      action: 'cancelOperation',
      requestId: currentRequestId
    });
    showCurrentStatus(
      response.cancelled ? 'Cancellation requested. Waiting for the active request to stop…' : 'This request is no longer running.',
      response.cancelled ? 'warning' : ''
    );
  } catch (error) {
    showCurrentStatus(`Could not cancel the request: ${error.message}`, 'error');
  }
}

async function acknowledgeCurrentOperation() {
  if (!currentRequestId || !currentOperationFinished) return;
  const requestId = currentRequestId;
  try {
    await sendToBackground({ action: 'acknowledgeOperation', requestId });
    await removeFromSessionStorage(['activeOperationRequestId']);
    currentRequestId = null;
    currentOperationFinished = false;
  } catch {
    // The operation result remains available until its short session expiry.
  }
}

async function restorePendingOperation() {
  const saved = await getFromStorage(chrome.storage.session, ['activeOperationRequestId']);
  const requestId = saved.activeOperationRequestId;
  if (!requestId) return;
  currentRequestId = requestId;
  currentOperationFinished = false;
  let operation;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await sendToBackground({ action: 'getOperationStatus', requestId });
    operation = response.operation;
    if (!operation || operation.status !== 'running') break;
    document.getElementById('cancel-operation-btn').classList.remove('hidden');
    showCurrentStatus('Reconnected to an operation still running in the background…', 'warning');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!operation) {
    await removeFromSessionStorage(['activeOperationRequestId']);
    currentRequestId = null;
    showCurrentStatus('No recovery record was found for the previous request. Your form was not stored; re-enter the details and retry.', 'warning');
    return;
  }
  if (operation.status === 'running') {
    showCurrentStatus('The request is still running. You can cancel it or reopen the popup later to check its status.', 'warning');
    return;
  }
  currentOperationFinished = true;
  if (operation.status === 'completed') {
    showRecoveredOperation(operation);
  } else {
    showCurrentStatus(operation.error || 'The previous request did not complete. Your saved resume and recent messages are unchanged; you can retry.', operation.status === 'cancelled' ? 'warning' : 'error');
  }
  await acknowledgeCurrentOperation();
}

function showRecoveredOperation(operation) {
  if (operation.result?.generatedMessage) {
    renderMessage(operation.result.generatedMessage);
    showCurrentStatus('Recovered the completed message from this browser session. Review it before using it.', 'success');
  } else if (operation.result?.researchReport) {
    renderResearchReport(operation.result.researchReport);
    document.getElementById('research-preview').classList.remove('hidden');
    showCurrentStatus('Research completed while the popup was closed. Re-enter the recipient details to continue.', 'success');
  } else {
    showCurrentStatus('The request completed, but its result was not available for recovery. Your saved data is unchanged; retry if needed.', 'warning');
  }
}

function wireSettingsEvents() {
  document.getElementById('save-settings-btn').addEventListener('click', handleSaveSettings);
  document.getElementById('validate-btn').addEventListener('click', handleValidateKey);
  document.getElementById('api-key').addEventListener('keydown', event => {
    if (event.key === 'Enter') handleValidateKey();
  });

  const dropArea = document.getElementById('file-upload-area');
  dropArea.addEventListener('click', () => document.getElementById('resume-upload').click());
  dropArea.addEventListener('dragover', event => {
    event.preventDefault();
    dropArea.classList.add('drag-over');
  });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
  dropArea.addEventListener('drop', event => {
    event.preventDefault();
    dropArea.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (file) processResumeFile(file);
  });
  document.getElementById('resume-upload').addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) processResumeFile(file);
  });
  document.getElementById('delete-resume-btn').addEventListener('click', handleDeleteResume);
  document.getElementById('edit-resume-details-btn').addEventListener('click', showResumeEditForm);
  document.getElementById('cancel-resume-edit-btn').addEventListener('click', hideResumeEditForm);
  document.getElementById('save-resume-edit-btn').addEventListener('click', handleSaveResumeEdits);
  document.getElementById('remove-api-key-btn').addEventListener('click', handleRemoveApiKey);
  document.getElementById('clear-recipient-btn').addEventListener('click', handleClearRecipientData);
  document.getElementById('clear-all-data-btn').addEventListener('click', handleClearAllData);
}

function wireRecentEvents() {
  document.getElementById('clear-recent-btn').addEventListener('click', async () => {
    if (isGenerating) {
      showCurrentStatus('Wait for the active request to finish before clearing recent messages.', 'warning');
      return;
    }
    try {
      await Cache.clearContacts();
      await renderRecentContacts();
    } catch (error) {
      showCurrentStatus(`Could not clear recent messages: ${error.message}`, 'error');
    }
  });
}

async function loadSettings() {
  const settings = await loadStoredSettings();
  const resumeSettings = await loadStoredResume();
  const cleanupStatus = await getFromStorage(chrome.storage.session, ['retentionCleanupError']);
  if (cleanupStatus.retentionCleanupError) {
    showSettingsStatus(cleanupStatus.retentionCleanupError, 'error');
    await removeFromSessionStorage(['retentionCleanupError']);
  }
  if (settings.userApiKey) document.getElementById('api-key').value = settings.userApiKey;
  if (settings.userName) document.getElementById('user-name').value = settings.userName;
  if (settings.userBio) document.getElementById('user-bio').value = settings.userBio;
  document.getElementById('message-retention').value = String(settings.messageRetentionDays || 7);
  const oldPdfBytes = await getStorageBytesInUse('resumeBase64');
  if (oldPdfBytes) {
    await removeFromStorage(['resumeBase64']);
    if (!resumeSettings.resumeData) {
      await removeFromStorage(['resumeFileName']);
      showResumeStatus('A previously saved PDF was removed. Upload it again to extract resume details.', 'warning');
    }
  }
  if (resumeSettings.resumeData && ResumeData.hasResumeDetails(resumeSettings.resumeData)) {
    savedResumeData = ResumeData.normalizeResumeData(resumeSettings.resumeData);
    renderSavedResume(resumeSettings.resumeFileName || '');
  }
}

async function handleSaveSettings() {
  if (isGenerating) {
    showSettingsStatus('Wait for the active AI request to finish before changing settings.', 'warning');
    return;
  }
  const apiKey = document.getElementById('api-key').value.trim();
  const savePayload = {
    userName: document.getElementById('user-name').value.trim(),
    userBio: document.getElementById('user-bio').value.trim(),
    messageRetentionDays: Number(document.getElementById('message-retention').value)
  };
  try {
    await setInStorage(savePayload);
    if (apiKey) await setInSessionStorage({ userApiKey: apiKey });
    else await removeFromSessionStorage(['userApiKey']);
    await removeFromStorage(['userApiKey']);
    await Cache.getContacts();
    showSettingsStatus('Settings saved. Recent messages now follow the selected retention period.', 'success');
    await checkLicenseStatus();
  } catch (error) {
    showSettingsStatus(`Could not save settings: ${error.message}`, 'error');
  }
}

async function handleValidateKey() {
  if (isGenerating) {
    showSettingsStatus('Wait for the active AI request to finish before validating an API key.', 'warning');
    return;
  }
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) return;
  const button = document.getElementById('validate-btn');
  button.textContent = '…';
  button.disabled = true;
  const status = document.getElementById('key-validation-status');
  try {
    const result = await sendToBackground({
      type: 'TEST_API_KEY',
      payload: { apiKey }
    }).catch(error => ({ valid: false, reason: error.message }));
    status.classList.remove('hidden');
    if (result && result.valid) {
      await setInSessionStorage({ userApiKey: apiKey });
      await removeFromStorage(['userApiKey']);
      document.getElementById('api-key').value = apiKey;
      status.textContent = '✓ Key works — saved for this Chrome session';
      status.className = 'key-validation-status valid';
      await checkLicenseStatus();
    } else {
      status.textContent = `✗ ${result?.reason || 'Key did not work'}`;
      status.className = 'key-validation-status invalid';
    }
  } catch (error) {
    status.textContent = `Could not save API key: ${error.message}`;
    status.className = 'key-validation-status invalid';
    status.classList.remove('hidden');
  } finally {
    button.textContent = 'Test';
    button.disabled = false;
  }
}

async function handleRemoveApiKey() {
  if (isGenerating) {
    showSettingsStatus('Wait for the current AI request to finish before removing its active key.', 'warning');
    return;
  }
  try {
    await removeFromSessionStorage(['userApiKey']);
    await removeFromStorage(['userApiKey']);
    document.getElementById('api-key').value = '';
    document.getElementById('key-validation-status').classList.add('hidden');
    showSettingsStatus('API key removed from extension storage.', 'success');
    await checkLicenseStatus();
  } catch (error) {
    showSettingsStatus(`Could not remove API key: ${error.message}`, 'error');
  }
}

async function handleClearRecipientData() {
  if (isGenerating) {
    showSettingsStatus('Wait for the active request to finish. Data already submitted to Anthropic cannot be recalled.', 'warning');
    return;
  }
  if (!window.confirm('Clear the current recipient details, generated message, and temporary research result?')) return;
  clearRecipientData();
  showSettingsStatus('Recipient and research data cleared from this popup.', 'success');
}

async function handleClearAllData() {
  if (isGenerating) {
    showSettingsStatus('Wait for the active request to finish. Data already submitted to Anthropic cannot be recalled.', 'warning');
    return;
  }
  if (!window.confirm('Clear all saved resume details, recent messages, preferences, and the session API key? This cannot be undone.')) return;
  try {
    await clearStorageArea(chrome.storage.local);
    await clearStorageArea(chrome.storage.session);
    savedResumeData = null;
    clearRecipientData();
    document.getElementById('api-key').value = '';
    document.getElementById('user-name').value = '';
    document.getElementById('user-bio').value = '';
    document.getElementById('message-retention').value = '7';
    document.getElementById('resume-preview').classList.add('hidden');
    clearSavedResumePreview();
    hideResumeEditForm();
    document.getElementById('file-upload-area').classList.remove('has-file');
    document.getElementById('file-label').textContent = 'Choose or drop a PDF to add or replace your resume';
    await renderRecentContacts();
    await checkLicenseStatus();
    showSettingsStatus('All extension data cleared.', 'success');
  } catch (error) {
    showSettingsStatus(`Could not clear all extension data: ${error.message}`, 'error');
  }
}

function clearRecipientData() {
  [
    'profile-name-input',
    'profile-headline-input',
    'profile-company-input',
    'profile-location-input',
    'profile-url-input',
    'profile-about-input',
    'profile-skills-input',
    'message-objective'
  ].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('experience-list').replaceChildren();
  document.getElementById('education-list').replaceChildren();
  document.getElementById('profile-editor').classList.remove('hidden');
  document.getElementById('profile-review').classList.add('hidden');
  document.getElementById('research-preview').classList.add('hidden');
  document.getElementById('profile-review-content').replaceChildren();
  document.getElementById('objective-review').replaceChildren();
  clearSensitivePreviews();
  document.getElementById('deep-consent').classList.add('hidden');
  document.getElementById('quick-ai-consent').classList.add('hidden');
  document.getElementById('include-resume').checked = false;
  document.getElementById('confirm-deep-research').checked = false;
  document.getElementById('confirm-deep-generation').checked = false;
  document.getElementById('confirm-quick-ai').checked = false;
  document.querySelector('input[name="generation-mode"][value="quick"]').checked = true;
  document.getElementById('message-type').value = 'Networking';
  document.getElementById('tone').value = 'Neutral';
  document.getElementById('generated-message').value = '';
  document.getElementById('char-count').textContent = '0 chars';
  currentProfile = null;
  confirmedResumeData = null;
  profileDraft = null;
  objectiveDraft = '';
  deepResearchReport = null;
  generationMode = 'quick';
  hideMessage();
  clearCurrentStatus();
}

function renderMessage(text) {
  document.getElementById('generated-message').value = text;
  document.getElementById('message-section').classList.remove('hidden');
  updateCharCount();
}

function hideMessage() {
  document.getElementById('message-section').classList.add('hidden');
}

function updateCharCount() {
  document.getElementById('char-count').textContent =
    `${document.getElementById('generated-message').value.length} chars`;
}

async function handleCopy() {
  const text = document.getElementById('generated-message').value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.getElementById('generated-message');
    textarea.select();
    document.execCommand('copy');
  }
  const button = document.getElementById('copy-btn');
  button.textContent = '✓ Copied!';
  button.classList.add('btn-secondary');
  button.classList.remove('btn-primary');
  setTimeout(() => {
    button.textContent = 'Copy';
    button.classList.remove('btn-secondary');
    button.classList.add('btn-primary');
  }, 2200);
}

function showCurrentStatus(message, type = '') {
  const status = document.getElementById('status-message');
  status.textContent = message;
  status.className = `status-bar${type ? ` status-${type}` : ''}`;
  status.classList.remove('hidden');
}

function clearCurrentStatus() {
  const status = document.getElementById('status-message');
  status.classList.add('hidden');
  status.textContent = '';
}

function showSettingsStatus(message, type = '') {
  const status = document.getElementById('settings-status');
  status.textContent = message;
  status.className = `status-bar${type ? ` status-${type}` : ''}`;
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 2500);
}

async function renderRecentContacts() {
  const list = document.getElementById('recent-list');
  const empty = document.getElementById('no-recent');
  const actions = document.getElementById('recent-actions');
  list.replaceChildren();
  let contacts;
  try {
    contacts = await Cache.getContacts();
  } catch (error) {
    empty.classList.remove('hidden');
    actions.classList.add('hidden');
    showCurrentStatus(`Could not load recent messages: ${error.message}`, 'error');
    return;
  }
  if (!contacts.length) {
    empty.classList.remove('hidden');
    actions.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  actions.classList.remove('hidden');
  contacts.forEach(contact => list.appendChild(buildContactCard(contact)));
}

function buildContactCard(contact) {
  const card = document.createElement('div');
  card.className = 'contact-card';
  const date = new Date(contact.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const message = contact.message || '';
  const preview = message.substring(0, 110) + (message.length > 110 ? '…' : '');
  const header = document.createElement('div');
  header.className = 'contact-header';
  const info = document.createElement('div');
  info.className = 'contact-info';
  const name = document.createElement('div');
  name.className = 'contact-name';
  name.textContent = contact.name || 'Unknown';
  const meta = document.createElement('div');
  meta.className = 'contact-meta';
  meta.textContent = contact.headline || contact.company || '';
  info.append(name, meta);
  const dateElement = document.createElement('div');
  dateElement.className = 'contact-date';
  dateElement.textContent = date;
  header.append(info, dateElement);

  const previewElement = document.createElement('div');
  previewElement.className = 'contact-message-preview';
  previewElement.textContent = preview;
  const fullElement = document.createElement('div');
  fullElement.className = 'contact-message-full hidden';
  fullElement.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'contact-actions';
  const expandButton = document.createElement('button');
  expandButton.className = 'btn-link';
  expandButton.type = 'button';
  expandButton.textContent = 'Show full message';
  const copyButton = document.createElement('button');
  copyButton.className = 'btn btn-sm btn-primary';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy';
  actions.append(expandButton, copyButton);
  card.append(header, previewElement, fullElement, actions);

  expandButton.addEventListener('click', () => {
    const isHidden = fullElement.classList.contains('hidden');
    previewElement.classList.toggle('hidden', isHidden);
    fullElement.classList.toggle('hidden', !isHidden);
    expandButton.textContent = isHidden ? 'Show less' : 'Show full message';
  });
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message);
      copyButton.textContent = 'Copied!';
    } catch (error) {
      showCurrentStatus(`Could not copy message: ${error.message}`, 'error');
    }
  });
  return card;
}

function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background.'));
        return;
      }
      if (['generateMessage', 'researchRecipient', 'generateDeepMessage'].includes(message.action) &&
          message.requestId === currentRequestId) {
        currentOperationFinished = true;
      }
      if (response.valid !== undefined) {
        resolve(response);
        return;
      }
      if (!response.success) {
        reject(new Error(response.error || 'Background returned an error.'));
        return;
      }
      resolve(response);
    });
  });
}

async function processResumeFile(file) {
  const fileInput = document.getElementById('resume-upload');
  if (isGenerating) {
    showResumeStatus('Wait for the active AI request to finish before replacing resume details.', 'warning');
    fileInput.value = '';
    return;
  }
  try {
    ResumeParser.validateResumeFile(file);
  } catch (error) {
    showResumeStatus(error.message, 'error');
    fileInput.value = '';
    return;
  }

  fileInput.disabled = true;
  showResumeStatus('Extracting text locally…', 'pending');
  try {
    const resumeData = await ResumeParser.parseResumePdf(file);
    await setInStorage({ resumeData, resumeFileName: file.name });
    await removeFromStorage(['resumeBase64']);
    savedResumeData = resumeData;
    invalidateProfileConfirmation();
    renderSavedResume(file.name);
    showResumeStatus('Resume details saved locally. The original PDF was discarded.', 'success');
  } catch (error) {
    showResumeStatus(error.message, 'error');
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
}

function renderSavedResume(fileName) {
  const preview = document.getElementById('resume-preview');
  const content = document.getElementById('resume-preview-content');
  const fileLabel = document.getElementById('file-label');
  const dropArea = document.getElementById('file-upload-area');
  fileLabel.textContent = fileName ? `Saved: ${fileName} — choose a PDF to replace` : 'Choose or drop a PDF to add or replace your resume';
  dropArea.classList.toggle('has-file', Boolean(fileName));
  content.replaceChildren();

  const data = ResumeData.forPrompt(savedResumeData);
  Object.entries(data).forEach(([section, value]) => {
    const items = Array.isArray(value) ? value : value ? [value] : [];
    if (!items.length) return;
    const heading = document.createElement('h4');
    heading.className = 'field-label';
    heading.textContent = section[0].toUpperCase() + section.slice(1);
    const details = document.createElement('p');
    details.className = 'resume-preview-text';
    details.textContent = items.join('\n');
    content.append(heading, details);
  });
  preview.classList.remove('hidden');
  hideResumeEditForm();
}

function clearSavedResumePreview() {
  document.getElementById('resume-preview-content').replaceChildren();
  document.getElementById('resume-edit-form').replaceChildren();
}

function showResumeEditForm() {
  const form = document.getElementById('resume-edit-form');
  form.replaceChildren();
  const resume = ResumeData.normalizeResumeData(savedResumeData);
  const sections = [
    ['summary', 'Professional summary'],
    ['skills', 'Skills'],
    ['experience', 'Experience'],
    ['projects', 'Projects'],
    ['education', 'Education'],
    ['certifications', 'Certifications']
  ];
  sections.forEach(([key, title]) => {
    const group = document.createElement('div');
    group.className = 'field-group full';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = `resume-edit-${key}`;
    label.textContent = `${title} (one item per line)`;
    const textarea = document.createElement('textarea');
    textarea.id = `resume-edit-${key}`;
    textarea.dataset.resumeSection = key;
    textarea.className = 'field-textarea';
    textarea.rows = key === 'summary' ? 4 : 3;
    textarea.maxLength = key === 'summary' ? 1800 : 6000;
    textarea.value = Array.isArray(resume[key]) ? resume[key].join('\n') : resume[key];
    group.append(label, textarea);
    form.appendChild(group);
  });
  form.classList.remove('hidden');
  document.getElementById('resume-edit-actions').classList.remove('hidden');
  document.getElementById('edit-resume-details-btn').classList.add('hidden');
}

function hideResumeEditForm() {
  document.getElementById('resume-edit-form').classList.add('hidden');
  document.getElementById('resume-edit-actions').classList.add('hidden');
  document.getElementById('edit-resume-details-btn').classList.remove('hidden');
}

async function handleSaveResumeEdits() {
  if (isGenerating) {
    showResumeStatus('Wait for the active AI request to finish before editing resume details.', 'warning');
    return;
  }
  const data = {};
  document.querySelectorAll('#resume-edit-form [data-resume-section]').forEach(input => {
    const section = input.dataset.resumeSection;
    data[section] = section === 'summary'
      ? input.value
      : input.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  });
  const editedResume = ResumeData.normalizeResumeData(data);
  if (!ResumeData.hasResumeDetails(editedResume)) {
    showResumeStatus('No resume details remain. Use Delete saved resume to remove it.', 'error');
    return;
  }
  try {
    await setInStorage({ resumeData: editedResume });
    savedResumeData = editedResume;
    invalidateProfileConfirmation();
    renderSavedResume((await loadStoredResume()).resumeFileName || '');
    showResumeStatus('Edited resume details saved locally.', 'success');
  } catch (error) {
    showResumeStatus(`Could not save edited resume details: ${error.message}`, 'error');
  }
}

async function handleDeleteResume() {
  if (isGenerating) {
    showResumeStatus('Wait for the active AI request to finish before deleting resume details.', 'warning');
    return;
  }
  try {
    await removeFromStorage(['resumeData', 'resumeFileName', 'resumeBase64']);
    savedResumeData = null;
    invalidateProfileConfirmation();
    document.getElementById('resume-preview').classList.add('hidden');
    clearSavedResumePreview();
    hideResumeEditForm();
    document.getElementById('file-upload-area').classList.remove('has-file');
    document.getElementById('file-label').textContent = 'Choose or drop a PDF to add or replace your resume';
    showResumeStatus('Saved resume details deleted.', 'success');
    document.getElementById('resume-inclusion').classList.add('hidden');
  } catch (error) {
    showResumeStatus(`Could not delete saved resume: ${error.message}`, 'error');
  }
}

function invalidateProfileConfirmation() {
  currentProfile = null;
  confirmedResumeData = null;
  profileDraft = null;
  deepResearchReport = null;
  document.getElementById('profile-review').classList.add('hidden');
  document.getElementById('research-preview').classList.add('hidden');
  clearSensitivePreviews();
  document.getElementById('profile-editor').classList.remove('hidden');
  hideMessage();
  clearCurrentStatus();
}

function clearSensitivePreviews() {
  [
    'research-preview-content',
    'quick-ai-request-preview',
    'deep-research-request-preview',
    'deep-generation-request-preview'
  ].forEach(id => {
    const element = document.getElementById(id);
    if (element.tagName === 'PRE') element.textContent = '';
    else element.replaceChildren();
  });
}

function showResumeStatus(message, type) {
  const status = document.getElementById('resume-status');
  status.textContent = message;
  status.className = `resume-status ${type}`;
  status.classList.remove('hidden');
}

function setInStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function removeFromStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function setInSessionStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set(values, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function removeFromSessionStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(keys, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function clearStorageArea(area) {
  return new Promise((resolve, reject) => {
    area.clear(() => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function getStorageBytesInUse(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.getBytesInUse(keys, bytes => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(bytes);
    });
  });
}

function loadStoredSettings() {
  return Promise.all([
    getFromStorage(chrome.storage.local, ['userApiKey', 'userName', 'userBio', 'messageRetentionDays']),
    getFromStorage(chrome.storage.session, ['userApiKey'])
  ]).then(async ([local, session]) => {
    let userApiKey = session.userApiKey || '';
    if (local.userApiKey) {
      if (!userApiKey) {
        userApiKey = local.userApiKey;
        await setInSessionStorage({ userApiKey });
      }
      await removeFromStorage(['userApiKey']);
    }
    return {
      userApiKey,
      userName: local.userName || '',
      userBio: local.userBio || '',
      messageRetentionDays: [1, 7, 30].includes(Number(local.messageRetentionDays))
        ? Number(local.messageRetentionDays)
        : 7
    };
  });
}

function loadStoredResume() {
  return getFromStorage(chrome.storage.local, ['resumeData', 'resumeFileName']);
}

function getFromStorage(area, keys) {
  return new Promise((resolve, reject) => {
    area.get(keys, result => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}
