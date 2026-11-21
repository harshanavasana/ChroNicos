'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { forPrompt, normalizeResumeData, parseResumeText, selectForPrompt } = require('../resume-data.js');

test('extracts structured resume sections and excludes contact information', () => {
  const resume = parseResumeText(`person@example.com
555-123-4567
Summary
AI researcher with experience in language models.
Skills
Python, NLP, Machine Learning
Experience
Research Engineer at Example Labs
Built language-model evaluation tools.
Projects
Document assistant using retrieval augmented generation
Education
BS Computer Science
Contact
123 Main Street, Somewhere`);

  assert.deepEqual(resume, {
    summary: 'AI researcher with experience in language models.',
    skills: ['Python', 'NLP', 'Machine Learning'],
    experience: ['Research Engineer at Example Labs', 'Built language-model evaluation tools.'],
    projects: ['Document assistant using retrieval augmented generation'],
    education: ['BS Computer Science'],
    certifications: []
  });
});

test('prompt data is allow-listed, bounded, and omits phone, email, and address lines', () => {
  const promptResume = forPrompt({
    summary: 'ML engineer\njane@example.com\n123 Main Street',
    skills: ['Python', 'NLP', '555 123 4567'],
    experience: ['Built an NLP assistant', 'Contact: jane@example.com'],
    rawPdf: 'this must never be included'
  });

  assert.deepEqual(promptResume, {
    summary: 'ML engineer',
    skills: ['Python', 'NLP'],
    experience: ['Built an NLP assistant'],
    projects: [],
    education: [],
    certifications: []
  });
});

test('normalizes missing resume sections to empty values', () => {
  assert.deepEqual(normalizeResumeData(null), {
    summary: '',
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: []
  });
});

test('parses a section heading and content on the same line', () => {
  const resume = parseResumeText('Skills: Python, NLP');
  assert.deepEqual(resume.skills, ['Python', 'NLP']);
});

test('only includes resume facts the user selected for the prompt', () => {
  const resume = {
    skills: ['Python', 'NLP'],
    projects: ['NLP assistant'],
    education: ['BSc Computer Science']
  };
  const selected = selectForPrompt(resume, {
    skills: [1],
    projects: [],
    education: [0]
  });

  assert.deepEqual(selected, {
    summary: '',
    skills: ['NLP'],
    experience: [],
    projects: [],
    education: ['BSc Computer Science'],
    certifications: []
  });
  assert.equal(selectForPrompt(resume).skills.length, 0);
});
