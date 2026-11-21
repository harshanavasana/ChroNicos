import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
globalThis.ResumeData = require('../resume-data.js');
globalThis.chrome = {
  runtime: {
    getURL: path => pathToFileURL(resolve(path) + (path.endsWith('/') ? '/' : '')).href
  }
};
await import('../resume-parser.mjs');

function createPdf() {
  const stream = 'BT /F1 12 Tf 72 720 Td (Skills) Tj 0 -18 Td (Python, NLP) Tj 0 -18 Td (Experience) Tj 0 -18 Td (Research Engineer) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'binary');
}

test('extracts selectable PDF text into local resume sections', async () => {
  const { parseResumePdf } = globalThis.ResumeParser;
  const pdfFile = new File([createPdf()], 'resume.pdf', { type: 'application/pdf' });
  const result = await parseResumePdf(pdfFile);

  assert.deepEqual(result.skills, ['Python', 'NLP']);
  assert.deepEqual(result.experience, ['Research Engineer']);
});

test('rejects unsupported and oversized resume files before parsing', () => {
  const { validateResumeFile } = globalThis.ResumeParser;
  assert.throws(() => validateResumeFile(new File(['resume'], 'resume.docx')), /choose a PDF/);
  assert.throws(() => validateResumeFile(new File(['x'.repeat(4 * 1024 * 1024 + 1)], 'resume.pdf')), /max 4MB/);
});

test('rejects a corrupted PDF without returning partial resume details', async () => {
  const { parseResumePdf } = globalThis.ResumeParser;
  const file = new File(['not a PDF'], 'broken.pdf', { type: 'application/pdf' });
  await assert.rejects(parseResumePdf(file));
});
