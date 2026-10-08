import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { ABSOLUTE_DATA_DIR, DATABASE_FILE_PATH, DATABASE_URL } from './config.js';
import { initializeApp } from './init.js';
import { recoverInterruptedPdfs } from './services/pdfRecovery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Route errors are answered by the error middleware; this backstop keeps a rejection from
// fire-and-forget work (e.g. background PDF generation) from ending the process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const app = createApp();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

initializeApp()
  .then(async () => {
    const recovered = await recoverInterruptedPdfs();
    if (recovered > 0) {
      console.warn(`Marked ${recovered} interrupted PDF generation(s) as failed; retry them.`);
    }
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Data dir: ${ABSOLUTE_DATA_DIR}`);
      console.log(`Database: ${DATABASE_FILE_PATH ?? `non-file datasource (${DATABASE_URL})`}`);
    });
  })
  .catch((err) => {
    console.error('Initialization failed:', err);
    process.exit(1);
  });
