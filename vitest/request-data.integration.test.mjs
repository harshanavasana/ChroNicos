import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.ProfileData = require('../profile.js');
globalThis.ResumeData = require('../resume-data.js');
globalThis.ResearchData = require('../research-data.js');
const RequestData = require('../request-data.js');

describe('approved request-data integration', () => {
  it('builds a bounded Quick Mode request without LinkedIn URL or private resume contacts', () => {
    const profile = {
      name: 'Jordan Lee',
      headline: 'Machine Learning Engineer',
      company: 'Example AI',
      location: 'Private location',
      profileUrl: 'https://www.linkedin.com/in/jordan/',
      skills: ['Python', 'NLP']
    };
    const resume = ResumeData.forPrompt({
      projects: ['Built a local NLP prototype.', 'Email: jordan@example.com']
    });
    const request = RequestData.quickMessage(
      profile,
      resume,
      'Ask about AI internships',
      {},
      'Networking',
      'Neutral'
    );

    expect(request.recipient.name).toBe('Jordan Lee');
    expect(request.recipient.profileUrl).toBeUndefined();
    expect(request.recipient.location).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('jordan@example.com');
    expect(request.resume.projects).toContain('Built a local NLP prototype.');
  });

  it('limits Deep Mode search input to the approved professional fields', () => {
    const request = RequestData.deepResearchApproval({
      name: 'Jordan Lee',
      headline: 'Research Engineer',
      company: 'Example AI',
      profileUrl: 'https://www.linkedin.com/in/jordan/',
      about: 'Private recipient details',
      skills: ['NLP']
    }, null, 'Network');

    expect(request.webSearchRecipient).toEqual({
      name: 'Jordan Lee',
      role: 'Research Engineer',
      company: 'Example AI',
      headline: 'Research Engineer',
      skills: ['NLP']
    });
    expect(JSON.stringify(request)).not.toContain('linkedin.com');
    expect(JSON.stringify(request)).not.toContain('Private recipient details');
  });
});
