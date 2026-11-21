'use strict';

(function (root) {
  const CONFIDENCE = new Set(['high', 'medium', 'low']);
  const SOURCE_TYPES = new Set([
    'official_company',
    'research_publication',
    'professional_site',
    'public_technical_contribution',
    'reputable_media',
    'other'
  ]);
  const sanitizePrivateText = root.ResumeData && root.ResumeData.sanitizeText
    ? root.ResumeData.sanitizeText
    : typeof require === 'function'
      ? require('./resume-data.js').sanitizeText
      : null;

  function cleanText(value, limit = 500) {
    if (typeof value !== 'string') return '';
    const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
    const safeText = sanitizePrivateText ? sanitizePrivateText(text) : text;
    return safeText.replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || /(^|\.)linkedin\.com$/i.test(url.hostname)) return '';
      url.hash = '';
      return url.href;
    } catch {
      return '';
    }
  }

  function urlKey(value) {
    const url = safeUrl(value);
    return url ? url.replace(/\/$/, '') : '';
  }

  function normalizeReport(raw, citations, resumeData) {
    if (!raw || typeof raw !== 'object') throw new Error('Research returned an invalid report.');

    const sourceByUrl = new Map();
    const sources = [];
    const assessments = new Map();
    (Array.isArray(raw.source_assessments) ? raw.source_assessments : []).forEach(assessment => {
      const key = urlKey(assessment?.url);
      if (key) assessments.set(key, assessment);
    });
    (Array.isArray(citations) ? citations : []).forEach(citation => {
      const url = safeUrl(citation?.url);
      const key = urlKey(url);
      if (!key || sourceByUrl.has(key)) return;
      const source = {
        id: `S${sources.length + 1}`,
        title: cleanText(citation.title, 180) || url,
        url,
        ...normalizeSourceAssessment(assessments.get(key))
      };
      sourceByUrl.set(key, source);
      sources.push(source);
    });

    const sourceIds = urls => {
      if (!Array.isArray(urls)) return [];
      return [...new Set(urls.map(url => sourceByUrl.get(urlKey(url))?.id).filter(Boolean))];
    };
    const hasCredibleSource = ids => ids.some(id => {
      const source = sources.find(item => item.id === id);
      return source && source.credibility !== 'low' && source.relevance !== 'low';
    });
    const normalizeFinding = finding => {
      const requestedConfidence = cleanText(finding?.confidence, 12).toLowerCase();
      const ids = sourceIds(finding?.source_urls || finding?.sourceUrls);
      const claim = cleanText(finding?.claim);
      const confidence = hasCredibleSource(ids) ? requestedConfidence : 'low';
      return claim && CONFIDENCE.has(requestedConfidence) && ids.length
        ? { claim, confidence, sourceIds: ids }
        : null;
    };
    const findings = items => (Array.isArray(items) ? items : [])
      .map(normalizeFinding)
      .filter(Boolean)
      .slice(0, 10);
    const identity = raw.identity && typeof raw.identity === 'object' ? raw.identity : {};
    const requestedIdentityConfidence = cleanText(identity.confidence, 12).toLowerCase();
    const identitySourceIds = sourceIds(identity.source_urls || identity.sourceUrls);
    const identityConfidence = CONFIDENCE.has(requestedIdentityConfidence) &&
      hasCredibleSource(identitySourceIds)
      ? requestedIdentityConfidence
      : 'low';
    const personFindings = identityConfidence === 'low'
      ? []
      : findings(raw.person_findings || raw.personFindings);
    const personSourceIds = new Set(personFindings.flatMap(item => item.sourceIds));
    const resumeFacts = flattenResume(resumeData).map(fact => ({
      fact,
      normalized: fact.toLowerCase().replace(/\s+/g, ' ').trim()
    }));
    const connections = (Array.isArray(raw.connections) ? raw.connections : [])
      .map(connection => {
        const cited = sourceIds(connection?.source_urls || connection?.sourceUrls);
        const suppliedFact = cleanText(connection?.user_experience).toLowerCase().replace(/\s+/g, ' ').trim();
        const matchedFact = resumeFacts.find(item => item.normalized === suppliedFact);
        const relevance = cleanText(connection?.relevance, 12).toLowerCase();
        const recipientInterest = cleanText(connection?.recipient_interest);
        const explanation = cleanText(connection?.explanation);
        const supportsPersonEvidence = cited.some(id => personSourceIds.has(id));
        return identityConfidence !== 'low' && matchedFact && supportsPersonEvidence &&
          cited.length && recipientInterest && CONFIDENCE.has(relevance)
          ? {
            recipientInterest,
            userExperience: matchedFact.fact,
            relevance,
            explanation,
            sourceIds: cited
          }
          : null;
      })
      .filter(Boolean)
      .slice(0, 8);

    return {
      identityConfidence,
      identityRationale: cleanText(identity.rationale),
      identitySourceIds,
      personFindings,
      companyFindings: findings(raw.company_findings || raw.companyFindings),
      connections,
      sources,
      limitations: (Array.isArray(raw.limitations) ? raw.limitations : [])
        .map(item => cleanText(item, 300))
        .filter(Boolean)
        .slice(0, 6)
    };
  }

  function evidenceForVerification(raw, citations) {
    const citedUrls = new Map((Array.isArray(citations) ? citations : [])
      .map(citation => [urlKey(citation?.url), safeUrl(citation?.url)])
      .filter(([key, url]) => key && url));
    const normalizeEvidence = items => (Array.isArray(items) ? items : [])
      .map(item => {
        const claim = cleanText(item?.claim);
        const sourceUrls = Array.isArray(item?.source_urls)
          ? [...new Set(item.source_urls.map(url => citedUrls.get(urlKey(url))).filter(Boolean))]
          : [];
        return claim && sourceUrls.length ? { claim, source_urls: sourceUrls } : null;
      })
      .filter(Boolean)
      .slice(0, 10);
    return {
      person_evidence: normalizeEvidence(raw?.person_evidence),
      company_evidence: normalizeEvidence(raw?.company_evidence),
      notes: (Array.isArray(raw?.notes) ? raw.notes : [])
        .map(item => cleanText(item, 300))
        .filter(Boolean)
        .slice(0, 6)
    };
  }

  function flattenResume(resumeData) {
    if (!resumeData || typeof resumeData !== 'object') return [];
    return Object.values(resumeData)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => cleanText(value, 800))
      .filter(Boolean);
  }

  function forMessage(report, resumeData) {
    if (!report || typeof report !== 'object') throw new Error('Review the research report before generating a message.');
    const sourceById = new Map((Array.isArray(report.sources) ? report.sources : [])
      .filter(source => safeUrl(source?.url))
      .map(source => [source.id, source]));
    const supportedIds = ids => Array.isArray(ids)
      ? [...new Set(ids.filter(id => {
        const source = sourceById.get(id);
        return source && source.credibility !== 'low' && source.relevance !== 'low';
      }))]
      : [];
    const normalizeItem = item => {
      const sourceIds = supportedIds(item?.sourceIds);
      const confidence = cleanText(item?.confidence, 12).toLowerCase();
      const claim = cleanText(item?.claim);
      return claim && confidence !== 'low' && CONFIDENCE.has(confidence) && sourceIds.length
        ? { claim, confidence, sourceIds }
        : null;
    };
    const identityConfidence = CONFIDENCE.has(report.identityConfidence) ? report.identityConfidence : 'low';
    const verifiedIdentity = identityConfidence !== 'low' &&
      supportedIds(report.identitySourceIds).length > 0;
    const personFindings = !verifiedIdentity
      ? []
      : (Array.isArray(report.personFindings) ? report.personFindings : [])
        .map(normalizeItem)
        .filter(Boolean);
    const actualResumeFacts = flattenResume(resumeData).map(fact => ({
      fact,
      normalized: fact.toLowerCase().replace(/\s+/g, ' ').trim()
    }));
    const personSourceIds = new Set(personFindings.flatMap(item => item.sourceIds));
    const connections = !verifiedIdentity
      ? []
      : (Array.isArray(report.connections) ? report.connections : [])
        .map(connection => {
          const sourceIds = supportedIds(connection?.sourceIds);
          const requestedFact = cleanText(connection?.userExperience).toLowerCase().replace(/\s+/g, ' ').trim();
          const matchedFact = actualResumeFacts.find(item => item.normalized === requestedFact);
          const relevance = cleanText(connection?.relevance, 12).toLowerCase();
          const recipientInterest = cleanText(connection?.recipientInterest);
          const explanation = cleanText(connection?.explanation);
          const supportsPersonEvidence = sourceIds.some(id => personSourceIds.has(id));
          return matchedFact && supportsPersonEvidence && sourceIds.length && recipientInterest && explanation &&
            relevance !== 'low' && CONFIDENCE.has(relevance)
            ? { recipientInterest, userExperience: matchedFact.fact, relevance, explanation, sourceIds }
            : null;
        })
        .filter(Boolean);
    return {
      identityConfidence: verifiedIdentity ? identityConfidence : 'low',
      personFindings,
      companyFindings: (Array.isArray(report.companyFindings) ? report.companyFindings : [])
        .map(normalizeItem)
        .filter(Boolean),
      connections
    };
  }

  function normalizeSourceAssessment(assessment) {
    const sourceType = cleanText(assessment?.source_type, 40);
    const publicationDate = cleanText(assessment?.publication_date, 40);
    const validDate = /^(?:\d{4}(?:-\d{2}(?:-\d{2})?)?|[A-Z][a-z]+ \d{4})$/.test(publicationDate)
      ? publicationDate
      : '';
    return {
      sourceType: SOURCE_TYPES.has(sourceType) ? sourceType : 'other',
      credibility: CONFIDENCE.has(assessment?.credibility) ? assessment.credibility : 'low',
      relevance: CONFIDENCE.has(assessment?.relevance) ? assessment.relevance : 'low',
      publicationDate: validDate
    };
  }

  root.ResearchData = { normalizeReport, evidenceForVerification, forMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ResearchData;
})(globalThis);
