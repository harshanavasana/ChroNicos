'use strict';

(function (root) {
  const EXPERIENCE_FIELDS = ['title', 'company', 'duration', 'description'];
  const EDUCATION_FIELDS = ['institution', 'degree', 'fieldOfStudy'];

  function cleanText(value) {
    return typeof value === 'string'
      ? value.replace(/\r\n?/g, '\n').replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      : '';
  }

  function normalizeEntries(entries, fields) {
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => Object.fromEntries(fields.map(field => [field, cleanText(entry[field])])))
      .filter(entry => Object.values(entry).some(Boolean));
  }

  function normalizeProfile(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    const skills = Array.isArray(raw.skills)
      ? raw.skills.map(cleanText).filter(Boolean)
      : typeof raw.skills === 'string'
        ? raw.skills.split(',').map(cleanText).filter(Boolean)
        : [];

    return {
      name: cleanText(raw.name),
      headline: cleanText(raw.headline),
      company: cleanText(raw.company),
      location: cleanText(raw.location),
      about: cleanText(raw.about),
      profileUrl: cleanText(raw.profileUrl),
      experience: normalizeEntries(raw.experience, EXPERIENCE_FIELDS),
      education: normalizeEntries(raw.education, EDUCATION_FIELDS),
      skills: [...new Set(skills)]
    };
  }

  function validateProfile(profile) {
    if (profile.profileUrl && !isLinkedInProfileUrl(profile.profileUrl)) {
      return 'Enter a valid LinkedIn profile URL or clear that field.';
    }
    const hasDetails = Boolean(
      profile.name ||
      profile.headline ||
      profile.location ||
      profile.about ||
      profile.experience.length ||
      profile.education.length ||
      profile.skills.length
    );
    return hasDetails ? '' : 'Enter at least one profile detail before continuing.';
  }

  function isLinkedInProfileUrl(value) {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') &&
        (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
        /^\/in\/[^/]+(?:\/|$)/.test(url.pathname);
    } catch {
      return false;
    }
  }

  const api = { normalizeProfile, validateProfile, isLinkedInProfileUrl };
  root.ProfileData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
