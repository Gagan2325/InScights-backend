require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const generateRoute = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Rate limiting: 10 generation requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please wait a moment before generating again.' }
});

// ── Middleware
app.use(express.json({ limit: '10mb' })); // 10mb for future PDF support
app.use(morgan('dev'));

// ── Routes
app.use('/api/generate', limiter, generateRoute);

app.get('/',(req, res)=>{
  res.json({
    status: 'ok',
    service: 'Brandcare InScights API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
  
})

// ── Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Brandcare InScights API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`\n🔬 Brandcare InScights API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
