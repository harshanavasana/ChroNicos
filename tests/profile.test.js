'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeProfile, validateProfile, isLinkedInProfileUrl } = require('../profile.js');

test('normalizes the profile into the standard shape without filling missing facts', () => {
  const profile = normalizeProfile({
    name: '  Rahul Sharma  ',
    company: ' Example Technologies ',
    experience: [{ title: 'Engineer', company: 'Example', duration: '2021–2023', extra: 'ignored' }],
    education: [{ institution: 'College', degree: 'BSc', fieldOfStudy: 'Physics' }],
    skills: ['JavaScript', ' JavaScript ', '']
  });

  assert.deepEqual(profile, {
    name: 'Rahul Sharma',
    headline: '',
    company: 'Example Technologies',
    location: '',
    about: '',
    profileUrl: '',
    experience: [{ title: 'Engineer', company: 'Example', duration: '2021–2023', description: '' }],
    education: [{ institution: 'College', degree: 'BSc', fieldOfStudy: 'Physics' }],
    skills: ['JavaScript']
  });
  assert.equal(validateProfile(profile), '');
});

test('rejects a profile with no user-provided details', () => {
  assert.equal(validateProfile(normalizeProfile({ profileUrl: 'https://www.linkedin.com/in/rahul' })),
    'Enter at least one profile detail before continuing.');
});

test('rejects a non-profile URL without rejecting profiles that have no URL', () => {
  assert.equal(validateProfile(normalizeProfile({
    name: 'Rahul',
    profileUrl: 'https://www.linkedin.com/company/example/'
  })), 'Enter a valid LinkedIn profile URL or clear that field.');
  assert.equal(validateProfile(normalizeProfile({ name: 'Rahul' })), '');
});

test('detects profile URLs without accepting other LinkedIn pages or domains', () => {
  assert.equal(isLinkedInProfileUrl('https://www.linkedin.com/in/rahul-sharma/'), true);
  assert.equal(isLinkedInProfileUrl('https://uk.linkedin.com/in/rahul-sharma/details/experience/'), true);
  assert.equal(isLinkedInProfileUrl('https://www.linkedin.com/company/example/'), false);
  assert.equal(isLinkedInProfileUrl('https://linkedin.com.attacker.example/in/rahul'), false);
});
