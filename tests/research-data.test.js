'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
global.ResumeData = require('../resume-data.js');
const { evidenceForVerification, forMessage, normalizeReport } = require('../research-data.js');

const citations = [
  { title: 'Official research page', url: 'https://example.com/research' },
  { title: 'Company news', url: 'https://example.org/news' }
];

test('only accepts findings linked to actual HTTPS citations and exact selected resume facts', () => {
  const report = normalizeReport({
    identity: { confidence: 'high', rationale: 'Company and role match.', source_urls: citations.map(item => item.url) },
    person_findings: [
      { claim: 'Works on NLP.', confidence: 'high', source_urls: [citations[0].url] },
      { claim: 'Uncited claim.', confidence: 'high', source_urls: ['https://fake.example/claim'] },
      { claim: 'LinkedIn claim.', confidence: 'high', source_urls: ['https://linkedin.com/in/person'] }
    ],
    company_findings: [
      { claim: 'Published company news.', confidence: 'medium', source_urls: [citations[1].url] }
    ],
    connections: [
      {
        recipient_interest: 'NLP',
        user_experience: 'Built an NLP chatbot.',
        relevance: 'high',
        explanation: 'A conversation starter.',
        source_urls: [citations[0].url]
      },
      {
        recipient_interest: 'LLMs',
        user_experience: 'Worked professionally on LLMs.',
        relevance: 'high',
        source_urls: [citations[0].url]
      }
    ],
    source_assessments: [{
      url: citations[0].url,
      source_type: 'research_publication',
      credibility: 'high',
      relevance: 'high',
      publication_date: '2025-03'
    }]
  }, citations, { projects: ['Built an NLP chatbot.'] });

  assert.equal(report.personFindings.length, 1);
  assert.equal(report.companyFindings.length, 1);
  assert.equal(report.connections.length, 1);
  assert.equal(report.sources.length, 2);
  assert.equal(report.sources[0].sourceType, 'research_publication');
  assert.equal(report.sources[0].publicationDate, '2025-03');
  assert.deepEqual(report.connections[0].sourceIds, ['S1']);
});

test('excludes low-confidence findings and all person matches when identity confidence is low', () => {
  const report = normalizeReport({
    identity: { confidence: 'low', rationale: 'The name is ambiguous.' },
    person_findings: [{ claim: 'Possible publication.', confidence: 'high', source_urls: [citations[0].url] }],
    company_findings: [{ claim: 'Company product.', confidence: 'low', source_urls: [citations[1].url] }],
    connections: [{
      recipient_interest: 'NLP',
      user_experience: 'NLP project',
      relevance: 'high',
      source_urls: [citations[0].url]
    }]
  }, citations, { projects: ['NLP project'] });

  assert.deepEqual(report.personFindings, []);
  assert.deepEqual(report.connections, []);
  assert.deepEqual(forMessage(report), {
    identityConfidence: 'low',
    personFindings: [],
    companyFindings: [],
    connections: []
  });
});

test('verification stage receives only evidence backed by returned citations', () => {
  const evidence = evidenceForVerification({
    person_evidence: [
      { claim: 'Supported work.', source_urls: [citations[0].url] },
      { claim: 'Uncited work.', source_urls: ['https://fake.example/'] }
    ],
    company_evidence: []
  }, citations);

  assert.deepEqual(evidence.person_evidence, [
    { claim: 'Supported work.', source_urls: [citations[0].url] }
  ]);
});

test('removes private contact details from research claims before verification', () => {
  const evidence = evidenceForVerification({
    person_evidence: [
      { claim: 'Published NLP research. Email: rahul@example.com', source_urls: [citations[0].url] }
    ],
    company_evidence: []
  }, citations);

  assert.deepEqual(evidence.person_evidence, []);
});
