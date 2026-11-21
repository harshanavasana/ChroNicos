'use strict';

(function (root) {
  const SECTION_ALIASES = new Map([
    ['summary', 'summary'],
    ['professional summary', 'summary'],
    ['career summary', 'summary'],
    ['profile', 'summary'],
    ['objective', 'summary'],
    ['career objective', 'summary'],
    ['skills', 'skills'],
    ['technical skills', 'skills'],
    ['core skills', 'skills'],
    ['core competencies', 'skills'],
    ['technologies', 'skills'],
    ['technology stack', 'skills'],
    ['experience', 'experience'],
    ['work experience', 'experience'],
    ['professional experience', 'experience'],
    ['employment history', 'experience'],
    ['work history', 'experience'],
    ['education', 'education'],
    ['education history', 'education'],
    ['academic background', 'education'],
    ['academic qualifications', 'education'],
    ['projects', 'projects'],
    ['selected projects', 'projects'],
    ['personal projects', 'projects'],
    ['certifications', 'certifications'],
    ['certificates', 'certifications'],
    ['licenses and certifications', 'certifications']
  ]);
  const IGNORED_HEADINGS = new Set([
    'contact',
    'contact information',
    'personal information',
    'personal details',
    'references',
    'languages',
    'interests'
  ]);
  const MAX_ITEMS = 12;
  const MAX_ITEM_LENGTH = 500;
  const MAX_SUMMARY_LENGTH = 1800;

  function isPrivateContactLine(value) {
    const phoneCandidates = value.match(/\+?\d[\d\s().-]{7,}\d/g) || [];
    const hasPhone = /\b(?:phone|mobile|telephone|tel)\s*[:#]/i.test(value) ||
      phoneCandidates.some(candidate => (candidate.match(/\d/g) || []).length >= 9);
    return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
      hasPhone ||
      /\b(?:address|home address|residential address)\s*:/i.test(value) ||
      /^\s*(?:address|home address|residential address)\b/i.test(value) ||
      /\b(?:home address|residential address|po\s*\.?\s*box)\b/i.test(value) ||
      /^\s*\d{1,6}\s+.+\b(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|boulevard|blvd)\b/i.test(value);
  }

  function cleanLine(value) {
    if (typeof value !== 'string') return '';
    const line = value
      .replace(/\u00a0/g, ' ')
      .replace(/^[\s•●▪‣*-]+/, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
    return line && !isPrivateContactLine(line) ? line : '';
  }

  function cleanLines(value) {
    if (typeof value !== 'string') return '';
    return value.split(/\r?\n/).map(cleanLine).filter(Boolean).join('\n').slice(0, MAX_SUMMARY_LENGTH);
  }

  function sanitizeText(value) {
    return cleanLines(typeof value === 'string' ? value : String(value || ''));
  }

  function cleanList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
      .map(cleanLine)
      .filter(Boolean)
      .map(item => item.slice(0, MAX_ITEM_LENGTH)))]
      .slice(0, MAX_ITEMS);
  }

  function normalizeResumeData(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    return {
      summary: cleanLines(raw.summary),
      skills: cleanList(raw.skills),
      experience: cleanList(raw.experience),
      projects: cleanList(raw.projects),
      education: cleanList(raw.education),
      certifications: cleanList(raw.certifications)
    };
  }

  function parseResumeText(text) {
    const sections = {
      summary: [],
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: []
    };
    let activeSection = null;

    String(text || '').split(/\r?\n/).forEach(rawLine => {
      let line = rawLine.replace(/^[\s•●▪‣*-]+/, '').trim();
      if (!line) return;

      const heading = line.replace(/[:\s-]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (SECTION_ALIASES.has(heading)) {
        activeSection = SECTION_ALIASES.get(heading);
        return;
      }
      if (IGNORED_HEADINGS.has(heading)) {
        activeSection = null;
        return;
      }
      const inlineHeading = line.match(/^([^:]{2,45}):\s*(.+)$/);
      if (inlineHeading) {
        const sectionName = inlineHeading[1].replace(/\s+/g, ' ').trim().toLowerCase();
        if (IGNORED_HEADINGS.has(sectionName)) {
          activeSection = null;
          return;
        }
        if (SECTION_ALIASES.has(sectionName)) {
          activeSection = SECTION_ALIASES.get(sectionName);
          line = inlineHeading[2].trim();
        }
      }
      if (!activeSection) return;

      if (activeSection === 'skills') {
        line.split(/[,;|•]/).map(cleanLine).filter(Boolean).forEach(skill => sections.skills.push(skill));
      } else {
        const cleaned = cleanLine(line);
        if (cleaned) sections[activeSection].push(cleaned);
      }
    });

    return normalizeResumeData({
      summary: sections.summary.join('\n'),
      skills: sections.skills,
      experience: sections.experience,
      projects: sections.projects,
      education: sections.education,
      certifications: sections.certifications
    });
  }

  function hasResumeDetails(data) {
    const resume = normalizeResumeData(data);
    return Boolean(
      resume.summary ||
      resume.skills.length ||
      resume.experience.length ||
      resume.projects.length ||
      resume.education.length ||
      resume.certifications.length
    );
  }

  function forPrompt(data) {
    const resume = normalizeResumeData(data);
    return {
      summary: resume.summary.slice(0, 800),
      skills: resume.skills.slice(0, 12),
      experience: resume.experience.slice(0, 4),
      projects: resume.projects.slice(0, 4),
      education: resume.education.slice(0, 3),
      certifications: resume.certifications.slice(0, 3)
    };
  }

  function selectForPrompt(data, selection = {}) {
    const promptData = forPrompt(data);
    return Object.fromEntries(Object.entries(promptData).map(([section, value]) => {
      if (Array.isArray(value)) {
        const selectedIndexes = Array.isArray(selection[section]) ? selection[section] : [];
        return [section, value.filter((_, index) => selectedIndexes.includes(index))];
      }
      return [section, selection[section] === true ? value : ''];
    }));
  }

  const api = { normalizeResumeData, parseResumeText, hasResumeDetails, forPrompt, selectForPrompt, sanitizeText };
  root.ResumeData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
