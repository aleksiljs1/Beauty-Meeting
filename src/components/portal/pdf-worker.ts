// The pdf.js worker, bundled as a same-origin file (the site's CSP allows workers only from 'self').
// Importing it is enough: inside a worker it connects itself to the page.
import "pdfjs-dist/build/pdf.worker.mjs";
