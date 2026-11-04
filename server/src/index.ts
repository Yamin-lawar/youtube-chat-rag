import { createApp } from './app.js';
import { config } from './config.js';
import { recoverUnfinishedWork } from './services/ingestion.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT}`);
  recoverUnfinishedWork().catch((error: unknown) => {
    console.error('Could not recover unfinished work:', error);
  });
});
