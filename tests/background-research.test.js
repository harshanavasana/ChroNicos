'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { URL } = require('node:url');

let nextRequestId = 0;

function createBackground(apiKey, responses, options = {}) {
  let onMessage;
  const requests = [];
  const sessionData = options.sessionData || { userApiKey: apiKey };
  const runtime = {
    lastError: null,
    onMessage: { addListener: listener => { onMessage = listener; } }
  };
  const session = {
    get(keys, callback) {
      if (options.sessionError) {
        runtime.lastError = { message: options.sessionError };
        callback({});
        runtime.lastError = null;
        return;
      }
      const requested = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(requested.filter(key => key in sessionData).map(key => [key, sessionData[key]])));
    },
    set(values, callback) {
      if (options.sessionError) {
        runtime.lastError = { message: options.sessionError };
        callback();
        runtime.lastError = null;
        return;
      }
      Object.assign(sessionData, values);
      callback();
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach(key => delete sessionData[key]);
      callback();
    }
  };
  let fetchImpl = options.fetch || (async (_url, requestOptions) => {
    requests.push(JSON.parse(requestOptions.body));
    const body = responses.shift();
    if (typeof body === 'function') return body(requestOptions);
    if (body instanceof Error) throw body;
    if (body?.fetchError) throw body.fetchError;
    return {
      ok: body?.ok !== false,
      status: body?.status || (body?.ok === false ? 500 : 200),
      json: async () => body?.json === undefined ? body : body.json
    };
  });
  let setTimer = options.setTimeout || setTimeout;
  const context = {
    chrome: {
      runtime,
      storage: {
        local: { get: (_keys, callback) => callback({}) },
        session
      },
      alarms: {
        create() {},
        onAlarm: { addListener() {} }
      }
    },
    URL,
    AbortController,
    setTimeout: setTimer,
    clearTimeout,
    fetch: (...args) => fetchImpl(...args)
  };
  vm.createContext(context);
  context.importScripts = (...scripts) => scripts.forEach(script => {
    const source = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
    vm.runInContext(source, context, { filename: script });
  });
  let backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  if (options.timeoutMs) backgroundSource = backgroundSource.replace('const API_TIMEOUT_MS = 90000;', `const API_TIMEOUT_MS = ${options.timeoutMs};`);
  vm.runInContext(backgroundSource, context);
  return {
    requests,
    sessionData,
    setFetch(fetch) { fetchImpl = fetch; },
    setTimer(timer) { setTimer = timer; context.setTimeout = timer; },
    send(message) {
      const tracked = ['generateMessage', 'researchRecipient', 'generateDeepMessage'].includes(message.action);
      const requestId = message.requestId || (tracked ? `test-req-${++nextRequestId}` : undefined);
      return new Promise(resolve => onMessage({ ...message, requestId }, {}, resolve));
    }
  };
}

test('Deep Mode researches with bounded non-LinkedIn search, then generates in a separate call', async () => {
  const researchUrl = 'https://example.com/paper';
  const searchResults = {
    person_evidence: [{ claim: 'Published NLP research.', source_urls: [researchUrl] }],
    company_evidence: [],
    notes: []
  };
  const report = {
    identity: { confidence: 'high', rationale: 'Company and role match.', source_urls: [researchUrl] },
    person_findings: [{ claim: 'Published NLP research.', confidence: 'high', source_urls: [researchUrl] }],
    company_findings: [],
    connections: [{
      recipient_interest: 'NLP',
      user_experience: 'Built an NLP chatbot.',
      relevance: 'high',
      explanation: 'A possible conversation topic.',
      source_urls: [researchUrl]
    }],
    limitations: [],
    source_assessments: [{
      url: researchUrl,
      source_type: 'research_publication',
      credibility: 'high',
      relevance: 'high',
      publication_date: '2025'
    }]
  };
  const background = createBackground('test-key', [
    { content: [{ type: 'text', text: JSON.stringify(searchResults), citations: [{
      type: 'web_search_result_location',
      url: researchUrl,
      title: 'Research paper',
      cited_text: 'Rahul Sharma, AI Research Engineer at ABC Technologies, published NLP research.\nContact: rahul@example.com'
    }] }] },
    { content: [{ type: 'text', text: JSON.stringify(report) }] },
    { content: [{ type: 'text', text: JSON.stringify({ variations: [
      'Hi Rahul, I read your NLP paper and built an NLP chatbot.',
      'Hi Rahul, I would enjoy discussing your NLP research; I have built an NLP chatbot.',
      'Hello Rahul, your NLP research caught my attention, and I have also worked on an NLP chatbot project.'
    ] }) }] },
    { content: [{ type: 'text', text: JSON.stringify({
      selectedIndex: 0,
      rankings: [
        { index: 0, score: 5, reason: 'Personal and factual.' },
        { index: 1, score: 4, reason: 'Relevant and natural.' },
        { index: 2, score: 4, reason: 'Relevant but more formal.' }
      ],
      rewriteRequired: false,
      rewriteInstructions: ''
    }) }] }
  ]);
  const profileData = {
    name: 'Rahul Sharma',
    headline: 'AI Research Engineer',
    company: 'ABC Technologies',
    profileUrl: 'https://www.linkedin.com/in/rahul-sharma/',
    skills: ['NLP']
  };
  const resumeData = { projects: ['Built an NLP chatbot.'] };

  const research = await background.send({
    action: 'researchRecipient',
    data: { profileData, resumeData, objective: 'Ask about AI internships', researchConsent: true }
  });
  assert.equal(research.success, true, research.error);
  assert.equal(research.researchReport.personFindings.length, 1);
  assert.equal(background.requests[0].tools[0].max_uses, 5);
  assert.deepEqual(background.requests[0].tools[0].blocked_domains, ['linkedin.com']);
  assert.equal(JSON.stringify(background.requests[0]).includes(profileData.profileUrl), false);
  assert.equal(JSON.stringify(background.requests[0]).includes('Built an NLP chatbot.'), false);
  assert.equal(background.requests[1].tools, undefined);
  assert.match(background.requests[1].messages[0].content, /Built an NLP chatbot/);
  assert.equal(JSON.stringify(background.requests[1]).includes('rahul@example.com'), false);
  assert.equal(JSON.stringify(background.requests).includes('test-key'), false);

  const generated = await background.send({
    action: 'generateDeepMessage',
    data: {
      profileData,
      resumeData,
      objective: 'Ask about AI internships',
      settings: {},
      messageType: 'Networking',
      tone: 'Neutral',
      aiConsent: true,
      researchReport: research.researchReport
    }
  });
  assert.equal(generated.success, true);
  assert.match(generated.generatedMessage, /NLP paper/);
  assert.equal(background.requests[2].tools, undefined);
  assert.match(background.requests[2].messages[0].content, /Published NLP research/);
  assert.equal(background.requests.length, 4);
  assert.equal(JSON.stringify(background.requests[3]).includes('three outreach messages together'), true);
});

test('Deep Mode fails clearly without an API key', async () => {
  const background = createBackground('', []);
  const response = await background.send({
    action: 'researchRecipient',
    data: {
      profileData: { name: 'Rahul', headline: 'Engineer', company: 'Example' },
      resumeData: null,
      objective: ''
    }
  });
  assert.equal(response.success, false);
  assert.match(response.error, /requires an Anthropic API key/);
});

test('Quick Mode generates and evaluates three variations in separate batched API calls', async () => {
  const background = createBackground('test-key', [
    { content: [{ type: 'text', text: JSON.stringify({ variations: [
      'Hi Jordan, I enjoy machine learning and would value a conversation.',
      'Hello Jordan, I work on NLP projects and admire your work in machine learning.',
      'Hi Jordan, I am interested in your machine learning work and would enjoy connecting.'
    ] }) }] },
    { content: [{ type: 'text', text: JSON.stringify({
      selectedIndex: 1,
      rankings: [
        { index: 0, score: 4, reason: 'Natural and concise.' },
        { index: 1, score: 5, reason: 'Most relevant and factual.' },
        { index: 2, score: 4, reason: 'Clear and concise.' }
      ],
      rewriteRequired: false,
      rewriteInstructions: ''
    }) }] }
  ]);
  const response = await background.send({
    action: 'generateMessage',
    data: {
      profileData: { name: 'Jordan Lee', headline: 'Machine Learning Engineer', company: 'Example AI', skills: ['NLP'] },
      resumeData: { projects: ['Built an NLP chatbot.'] },
      objective: 'Ask about AI internships',
      settings: {},
      messageType: 'Networking',
      tone: 'Neutral',
      aiConsent: true
    }
  });
  assert.equal(response.success, true, response.error);
  assert.match(response.generatedMessage, /NLP projects/);
  assert.equal(background.requests.length, 2);
  assert.match(background.requests[0].messages[0].content, /three distinct short LinkedIn outreach variations/);
  assert.match(background.requests[1].system, /evaluate three outreach messages together/);
});

function quickRequest(requestId = 'quick-request-0001') {
  return {
    action: 'generateMessage',
    requestId,
    data: {
      profileData: { name: 'Jordan Lee', headline: 'Machine Learning Engineer', company: 'Example AI', skills: ['NLP'] },
      resumeData: { projects: ['Built an NLP chatbot.'] },
      objective: 'Ask about AI internships',
      settings: {},
      messageType: 'Networking',
      tone: 'Neutral',
      aiConsent: true
    }
  };
}

function apiError(status, message) {
  return { ok: false, status, json: { error: { message } } };
}

test('network, invalid-key, rate-limit, and server errors are clear and recoverable', async t => {
  const scenarios = [
    {
      name: 'internet disconnect',
      fetch: async () => { throw new TypeError('Failed to fetch'); },
      expected: /Check your internet connection/
    },
    {
      name: 'invalid API key',
      response: apiError(401, 'invalid x-api-key'),
      expected: /API key/
    },
    {
      name: 'rate limit',
      response: apiError(429, 'rate limit exceeded'),
      expected: /rate limiting/
    },
    {
      name: 'server error',
      response: apiError(503, 'provider details'),
      expected: /temporarily unavailable/
    }
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const background = createBackground('test-key', scenario.response ? [scenario.response] : [], {
        fetch: scenario.fetch
      });
      const response = await background.send(quickRequest());
      assert.equal(response.success, false);
      assert.match(response.error, scenario.expected);
      assert.equal(background.sessionData.latestOperation.status, 'failed');
      assert.equal(JSON.stringify(background.sessionData.latestOperation).includes('test-key'), false);
    });
  }
});

test('request timeout fails clearly and preserves a retryable operation state', async () => {
  const background = createBackground('test-key', [], {
    timeoutMs: 5,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  });
  const response = await background.send(quickRequest('timeout-request-0001'));
  assert.equal(response.success, false);
  assert.match(response.error, /timed out/);
  assert.equal(background.sessionData.latestOperation.status, 'failed');
});

test('invalid AI JSON fails without overwriting prior user data, and retry with a new request ID succeeds', async () => {
  const background = createBackground('test-key', [
    { content: [{ type: 'text', text: 'not JSON' }] },
    { content: [{ type: 'text', text: JSON.stringify({ variations: [
      'Hi Jordan, I would enjoy discussing machine learning with you.',
      'Hello Jordan, I am interested in your machine learning work.',
      'Hi Jordan, your machine learning work caught my attention.'
    ] }) }] },
    { content: [{ type: 'text', text: JSON.stringify({
      selectedIndex: 0,
      rankings: [],
      rewriteRequired: false,
      rewriteInstructions: ''
    }) }] }
  ]);
  background.sessionData.savedResume = { skills: ['Python'] };
  const failed = await background.send(quickRequest('invalid-json-request-0001'));
  assert.equal(failed.success, false);
  assert.match(failed.error, /invalid message variations/);
  assert.deepEqual(background.sessionData.savedResume, { skills: ['Python'] });

  const succeeded = await background.send(quickRequest('retry-request-00001'));
  assert.equal(succeeded.success, true, succeeded.error);
  assert.match(succeeded.generatedMessage, /Jordan/);
  assert.equal(background.sessionData.savedResume.skills[0], 'Python');
  assert.equal(background.sessionData.latestOperation.status, 'completed');
  assert.equal(background.sessionData.latestOperation.result.generatedMessage, succeeded.generatedMessage);
  assert.equal(JSON.stringify(background.sessionData.latestOperation).includes('NLP chatbot'), false);
});

test('duplicate generation clicks with the same request ID do not submit twice', async () => {
  const releaseFetches = [];
  let fetchCount = 0;
  let markSecondFetch;
  const secondFetchStarted = new Promise(resolve => { markSecondFetch = resolve; });
  const background = createBackground('test-key', [], {
    fetch: async (_url, _options) => new Promise(resolve => {
      fetchCount += 1;
      if (fetchCount === 2) markSecondFetch();
      const currentFetch = fetchCount;
      releaseFetches.push(() => resolve({
        ok: true,
        json: async () => ({
          content: [{
            type: 'text',
            text: JSON.stringify(currentFetch === 1
              ? { variations: [
                'Hi Jordan, I would enjoy discussing machine learning with you.',
                'Hello Jordan, your machine learning work caught my attention.',
                'Hi Jordan, I would value a conversation about machine learning.'
              ] }
              : { selectedIndex: 0, rankings: [], rewriteRequired: false, rewriteInstructions: '' })
          }]
        })
      }));
    })
  });
  const first = background.send(quickRequest('duplicate-request-0001'));
  await new Promise(resolve => setTimeout(resolve, 10));
  const duplicate = await background.send(quickRequest('duplicate-request-0001'));
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error, /already in progress/);
  releaseFetches.shift()();
  await secondFetchStarted;
  releaseFetches.shift()();
  const completed = await first;
  assert.equal(completed.success, true, completed.error);
  assert.equal(fetchCount, 2);
});

test('Deep Mode research can be cancelled by request ID', async () => {
  let searchStarted;
  const started = new Promise(resolve => { searchStarted = resolve; });
  const background = createBackground('test-key', [], {
    fetch: async (_url, options) => {
      searchStarted();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
  });
  const requestId = 'deep-cancel-request-001';
  const operation = background.send({
    action: 'researchRecipient',
    requestId,
    data: {
      profileData: { name: 'Jordan Lee', headline: 'Research Engineer', company: 'Example AI' },
      resumeData: null,
      objective: 'Network',
      researchConsent: true
    }
  });
  await started;
  const cancellation = await background.send({ action: 'cancelOperation', requestId });
  assert.equal(cancellation.cancelled, true);
  const result = await operation;
  assert.equal(result.success, false);
  assert.match(result.error, /cancelled/i);
  assert.equal(background.sessionData.latestOperation.status, 'cancelled');
});

test('Deep Mode returns a report with no reliable sources instead of inventing findings', async () => {
  const background = createBackground('test-key', [
    { content: [{ type: 'text', text: JSON.stringify({ person_evidence: [], company_evidence: [], notes: ['No reliable sources found.'] }) }] },
    { content: [{ type: 'text', text: JSON.stringify({
      identity: { confidence: 'low', rationale: 'No matching evidence.', source_urls: [] },
      person_findings: [],
      company_findings: [],
      connections: [],
      source_assessments: [],
      limitations: ['No reliable sources found.']
    }) }] }
  ]);
  const response = await background.send({
    action: 'researchRecipient',
    requestId: 'deep-no-sources-request-001',
    data: {
      profileData: { name: 'Jordan Lee', headline: 'Research Engineer', company: 'Example AI' },
      resumeData: null,
      objective: 'Network',
      researchConsent: true
    }
  });
  assert.equal(response.success, true, response.error);
  assert.equal(response.researchReport.identityConfidence, 'low');
  assert.equal(response.researchReport.personFindings.length, 0);
  assert.equal(response.researchReport.sources.length, 0);
});

test('completed operation can be reconnected by request ID and acknowledged', async () => {
  const background = createBackground('test-key', [
    { content: [{ type: 'text', text: JSON.stringify({ variations: [
      'Hi Jordan, I would enjoy discussing machine learning with you.',
      'Hello Jordan, your machine learning work caught my attention.',
      'Hi Jordan, I would value a conversation about machine learning.'
    ] }) }] },
    { content: [{ type: 'text', text: JSON.stringify({
      selectedIndex: 0,
      rankings: [],
      rewriteRequired: false,
      rewriteInstructions: ''
    }) }] }
  ]);
  const requestId = 'popup-closed-request-001';
  const result = await background.send(quickRequest(requestId));
  assert.equal(result.success, true, result.error);
  const recovered = await background.send({ action: 'getOperationStatus', requestId });
  assert.equal(recovered.operation.status, 'completed');
  assert.equal(recovered.operation.result.generatedMessage, result.generatedMessage);
  assert.equal(JSON.stringify(background.sessionData.latestOperation).includes('Jordan Lee'), false);
  await background.send({ action: 'acknowledgeOperation', requestId });
  assert.equal(background.sessionData.latestOperation, undefined);
});

test('new service-worker instance marks an interrupted request retryable', async () => {
  const sessionData = {
    userApiKey: 'test-key',
    latestOperation: {
      requestId: 'worker-interrupted-0001',
      kind: 'generateMessage',
      status: 'running',
      startedAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000
    }
  };
  const restartedWorker = createBackground('test-key', [], { sessionData });
  const response = await restartedWorker.send({
    action: 'getOperationStatus',
    requestId: 'worker-interrupted-0001'
  });
  assert.equal(response.operation.status, 'failed');
  assert.match(response.operation.error, /service worker stopped/);
});

test('session storage failure is surfaced before an API request starts', async () => {
  const background = createBackground('test-key', [], {
    sessionError: 'QUOTA_BYTES quota exceeded'
  });
  const response = await background.send(quickRequest('session-full-request-001'));
  assert.equal(response.success, false);
  assert.match(response.error, /quota exceeded/i);
  assert.equal(background.requests.length, 0);
});

test('background rejects AI and research requests without operation-specific approval', async () => {
  const background = createBackground('test-key', []);
  const quickData = quickRequest('unapproved-quick-request-001').data;
  quickData.aiConsent = false;
  const quick = await background.send({
    ...quickRequest('unapproved-quick-request-001'),
    data: quickData
  });
  assert.equal(quick.success, false);
  assert.match(quick.error, /Approve this AI request/);

  const research = await background.send({
    action: 'researchRecipient',
    requestId: 'unapproved-research-request-001',
    data: {
      profileData: { name: 'Jordan Lee', headline: 'Research Engineer', company: 'Example AI' },
      resumeData: null,
      objective: 'Network'
    }
  });
  assert.equal(research.success, false);
  assert.match(research.error, /Approve this Deep Mode research request/);
  assert.equal(background.requests.length, 0);
});
