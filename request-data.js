'use strict';

(function (root) {
  function text(value, limit) {
    return ResumeData.sanitizeText(value || '').slice(0, limit);
  }

  function deepRecipient(profileData) {
    const profile = ProfileData.normalizeProfile(profileData);
    return {
      name: text(profile.name, 120),
      role: text(profile.headline, 160),
      company: text(profile.company, 120),
      headline: text(profile.headline, 200),
      skills: profile.skills.map(skill => text(skill, 80)).filter(Boolean).slice(0, 8)
    };
  }

  function quickRecipient(profileData) {
    const profile = ProfileData.normalizeProfile(profileData);
    return {
      name: text(profile.name, 120),
      headline: text(profile.headline, 200),
      company: text(profile.company, 120),
      about: text(profile.about, 400),
      experience: profile.experience.slice(0, 4).map(item => ({
        title: text(item.title, 120),
        company: text(item.company, 120),
        duration: text(item.duration, 80),
        description: text(item.description, 300)
      })).filter(item => Object.values(item).some(Boolean)),
      education: profile.education.slice(0, 3).map(item => ({
        institution: text(item.institution, 160),
        degree: text(item.degree, 120),
        fieldOfStudy: text(item.fieldOfStudy, 120)
      })).filter(item => Object.values(item).some(Boolean)),
      skills: profile.skills.map(skill => text(skill, 80)).filter(Boolean).slice(0, 12)
    };
  }

  function selectedResume(resumeData) {
    return ResumeData.forPrompt(resumeData);
  }

  function objective(value) {
    return text(value, 300);
  }

  function sender(settings, bioLimit) {
    return {
      name: text(settings?.userName, 100),
      bio: text(settings?.userBio, bioLimit)
    };
  }

  function quickMessage(profileData, resumeData, objectiveText, settings, messageType, tone) {
    return {
      purpose: text(messageType, 40),
      tone: text(tone, 30),
      objective: objective(objectiveText),
      recipient: quickRecipient(profileData),
      resume: selectedResume(resumeData),
      sender: sender(settings, 300)
    };
  }

  function deepResearchApproval(profileData, resumeData, objectiveText) {
    const recipient = deepRecipient(profileData);
    return {
      webSearchRecipient: recipient,
      verificationAndMatching: {
        recipient,
        objective: objective(objectiveText),
        selectedResume: selectedResume(resumeData),
        citedSearchEvidence: '(Added from the cited search response)'
      }
    };
  }

  function deepVerification(profileData, resumeData, objectiveText, evidence, citedSources) {
    return {
      recipient: deepRecipient(profileData),
      objective: objective(objectiveText),
      selectedResume: selectedResume(resumeData),
      collectedEvidence: evidence,
      citedSourceExcerpts: citedSources
    };
  }

  function deepMessage(profileData, resumeData, objectiveText, settings, messageType, tone, report) {
    const resume = selectedResume(resumeData);
    return {
      purpose: text(messageType, 40),
      tone: text(tone, 30),
      objective: objective(objectiveText),
      recipient: deepRecipient(profileData),
      resume,
      reviewedResearch: ResearchData.forMessage(report, resume),
      sender: sender(settings, 300)
    };
  }

  const api = {
    deepMessage,
    deepRecipient,
    deepResearchApproval,
    deepVerification,
    quickMessage
  };
  root.RequestData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
