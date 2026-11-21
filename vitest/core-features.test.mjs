import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ProfileData = require('../profile.js');
const ResumeData = require('../resume-data.js');
globalThis.ResumeData = ResumeData;
globalThis.ProfileData = ProfileData;
const ResearchData = require('../research-data.js');
globalThis.ResearchData = ResearchData;
const RequestData = require('../request-data.js');

const citations = [
  { title: 'Research publication', url: 'https://example.com/paper' },
  { title: 'Official news', url: 'https://example.org/news' }
];

describe('profile, resume, research, and prompt regression cases', () => {
  it('normalizes and validates recipient profile fields without inferring missing details', () => {
    const profile = ProfileData.normalizeProfile({
      name: ' Jordan Lee ',
      skills: 'Python, NLP, Python',
      experience: [{ title: 'Research Engineer', extra: 'discarded' }]
    });
    expect(profile.name).toBe('Jordan Lee');
    expect(profile.skills).toEqual(['Python', 'NLP']);
    expect(profile.experience[0].company).toBe('');
    expect(ProfileData.validateProfile(profile)).toBe('');
    expect(ProfileData.validateProfile(ProfileData.normalizeProfile({}))).toMatch(/at least one/);
    expect(ProfileData.isLinkedInProfileUrl('https://linkedin.com.attacker.test/in/person')).toBe(false);
  });

  it('parses resume sections and excludes private contacts and ignored sections', () => {
    const resume = ResumeData.parseResumeText(`Summary
AI engineer
Skills: Python, NLP
Experience
Built a local prototype
Contact
person@example.com
Education
BSc Computer Science`);
    expect(resume.summary).toBe('AI engineer');
    expect(resume.skills).toEqual(['Python', 'NLP']);
    expect(resume.experience).toEqual(['Built a local prototype']);
    expect(resume.education).toEqual(['BSc Computer Science']);
    expect(ResumeData.hasResumeDetails(resume)).toBe(true);
    expect(ResumeData.hasResumeDetails(null)).toBe(false);
  });

  it('accepts cited professional evidence and exact resume facts, rejecting unsupported material', () => {
    const report = ResearchData.normalizeReport({
      identity: {
        confidence: 'high',
        rationale: 'Company and role match.',
        source_urls: [citations[0].url]
      },
      person_findings: [
        { claim: 'Published NLP research.', confidence: 'high', source_urls: [citations[0].url] },
        { claim: 'Uncited claim.', confidence: 'high', source_urls: ['https://fake.example/'] }
      ],
      company_findings: [
        { claim: 'Announced a product.', confidence: 'medium', source_urls: [citations[1].url] }
      ],
      connections: [{
        recipient_interest: 'NLP',
        user_experience: 'Built an NLP assistant.',
        relevance: 'high',
        explanation: 'A possible conversation starter.',
        source_urls: [citations[0].url]
      }],
      source_assessments: [{
        url: citations[0].url,
        source_type: 'research_publication',
        credibility: 'high',
        relevance: 'high',
        publication_date: '2025-03'
      }]
    }, citations, { projects: ['Built an NLP assistant.'] });

    expect(report.personFindings).toHaveLength(1);
    expect(report.companyFindings).toHaveLength(1);
    expect(report.connections[0].userExperience).toBe('Built an NLP assistant.');
    expect(report.sources[0].publicationDate).toBe('2025-03');
    expect(ResearchData.forMessage(report, { projects: ['Built an NLP assistant.'] }).personFindings)
      .toHaveLength(1);
  });

  it('rejects person-specific findings when identity confidence is low and filters uncited evidence', () => {
    const evidence = ResearchData.evidenceForVerification({
      person_evidence: [
        { claim: 'Supported work.', source_urls: [citations[0].url] },
        { claim: 'Unsupported work.', source_urls: ['https://attacker.example/'] }
      ],
      company_evidence: []
    }, citations);
    expect(evidence.person_evidence).toHaveLength(1);

    const report = ResearchData.normalizeReport({
      identity: { confidence: 'low', rationale: 'Ambiguous match.', source_urls: [citations[0].url] },
      person_findings: [{ claim: 'Possible publication.', confidence: 'high', source_urls: [citations[0].url] }],
      company_findings: [],
      connections: [],
      source_assessments: [{
        url: citations[0].url,
        source_type: 'research_publication',
        credibility: 'high',
        relevance: 'high'
      }]
    }, citations, null);
    expect(report.identityConfidence).toBe('low');
    expect(report.personFindings).toHaveLength(0);
  });

  it('keeps recipient and resume request data within the approved privacy boundary', () => {
    const resume = ResumeData.forPrompt({
      skills: ['Python', 'person@example.com'],
      projects: ['Built an NLP assistant.']
    });
    const request = RequestData.quickMessage({
      name: 'Jordan Lee',
      headline: 'Research Engineer',
      company: 'Example AI',
      profileUrl: 'https://www.linkedin.com/in/jordan/',
      location: 'Private location'
    }, resume, 'Ask about opportunities', {}, 'Networking', 'Neutral');
    expect(request.recipient.profileUrl).toBeUndefined();
    expect(request.recipient.location).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('person@example.com');
  });
});
