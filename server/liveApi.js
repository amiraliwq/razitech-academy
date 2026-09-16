import express from 'express';
import liveSessionsRouter from './liveSessionsModule.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'razitech-live-api' }));
app.use('/api', liveSessionsRouter);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`RaziTech live API listening on ${port}`));
