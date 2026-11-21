import * as pdfjsLib from './node_modules/pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  'node_modules/pdfjs-dist/build/pdf.worker.mjs'
);

async function parseResumePdf(file) {
  validateResumeFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    standardFontDataUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/standard_fonts/'),
    cMapUrl: chrome.runtime.getURL('node_modules/pdfjs-dist/cmaps/'),
    useWorkerFetch: false,
    useSystemFonts: true
  });
  try {
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = '';
      let previousY = null;
      const pageLines = [];

      content.items.forEach(item => {
        if (!('str' in item)) return;
        const y = item.transform?.[5];
        if (line && y !== undefined && previousY !== null && Math.abs(y - previousY) > 2) {
          pageLines.push(line);
          line = '';
        }
        line = line ? `${line} ${item.str}` : item.str;
        previousY = y ?? previousY;
        if (item.hasEOL) {
          pageLines.push(line);
          line = '';
          previousY = null;
        }
      });
      if (line) pageLines.push(line);
      pages.push(pageLines.join('\n'));
      page.cleanup();
    }

    const text = pages.join('\n');
    if (!text.trim()) {
      throw new Error('No selectable text was found. This may be a scanned PDF; OCR is not supported yet.');
    }
    const resume = ResumeData.parseResumeText(text);
    if (!ResumeData.hasResumeDetails(resume)) {
      throw new Error('Could not identify resume sections. Use headings such as Summary, Skills, Experience, Projects, or Education.');
    }
    return resume;
  } finally {
    await loadingTask.destroy();
  }
}

function validateResumeFile(file) {
  if (!file?.name?.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please choose a PDF file.');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('File too large — max 4MB.');
  }
}

globalThis.ResumeParser = { parseResumePdf, validateResumeFile };
