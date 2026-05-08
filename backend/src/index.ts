import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app';
import { ABSOLUTE_DATA_DIR, DATABASE_FILE_PATH, DATABASE_URL } from './config';
import { initializeApp } from './init';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = createApp();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const express = (await import('express')).default;
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

initializeApp()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Data dir: ${ABSOLUTE_DATA_DIR}`);
      console.log(`Database: ${DATABASE_FILE_PATH ?? `non-file datasource (${DATABASE_URL})`}`);
    });
  })
  .catch((err) => {
    console.error('Initialisierung fehlgeschlagen:', err);
    process.exit(1);
  });
