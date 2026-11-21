'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ProfileData = require('../profile.js');
const ResumeData = require('../resume-data.js');
const ResearchData = require('../research-data.js');
global.ProfileData = ProfileData;
global.ResumeData = ResumeData;
global.ResearchData = ResearchData;
const RequestData = require('../request-data.js');

test('AI request previews contain bounded approved data and omit URL, location, and API key', () => {
  const profile = {
    name: 'Jordan Lee',
    headline: 'Machine Learning Engineer',
    company: 'Example AI',
    location: 'Private location',
    profileUrl: 'https://www.linkedin.com/in/jordan/',
    about: 'Builds NLP products',
    skills: ['Python', 'NLP']
  };
  const resume = { projects: ['Built a local NLP prototype.'] };
  const settings = { userName: 'Alex', userBio: 'Early-career developer', userApiKey: 'secret-key' };

  const quick = RequestData.quickMessage(profile, resume, 'Ask about ML internships', settings, 'Job', 'Neutral');
  const deep = RequestData.deepResearchApproval(profile, resume, 'Ask about ML internships');

  assert.equal(quick.recipient.profileUrl, undefined);
  assert.equal(quick.recipient.location, undefined);
  assert.equal(quick.sender.userApiKey, undefined);
  assert.deepEqual(quick.resume.projects, ['Built a local NLP prototype.']);
  assert.deepEqual(deep.webSearchRecipient, {
    name: 'Jordan Lee',
    role: 'Machine Learning Engineer',
    company: 'Example AI',
    headline: 'Machine Learning Engineer',
    skills: ['Python', 'NLP']
  });
  assert.equal(deep.verificationAndMatching.selectedResume.projects[0], 'Built a local NLP prototype.');
});
