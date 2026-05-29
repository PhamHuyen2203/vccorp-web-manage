const express = require('express');
const cors = require('cors');

// Load aggregated JSON files directly (forces Vercel to bundle them in the Serverless Function)
const overviewStats = require('./overview_stats.json');
const campaignDailyStats = require('./campaign_daily_stats.json');
const journeyStats = require('./journey_stats.json');
const predictionMetrics = require('./prediction_metrics.json');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Endpoints
app.get('/', (req, res) => {
  res.json({
    status: "online",
    message: "VCCorp Management Dashboard API is running successfully!",
    endpoints: {
      overview: "/api/overview",
      campaigns: "/api/campaigns",
      journey: "/api/journey",
      prediction: "/api/prediction"
    }
  });
});

app.get('/api/overview', (req, res) => {
  res.json(overviewStats);
});

app.get('/api/campaigns', (req, res) => {
  res.json(campaignDailyStats);
});

app.get('/api/journey', (req, res) => {
  res.json(journeyStats);
});

app.get('/api/prediction', (req, res) => {
  res.json(predictionMetrics);
});

// Start server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`VCCorp Management Dashboard Backend Server`);
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`Endpoints available:`);
  console.log(` - Overview:   http://localhost:${PORT}/api/overview`);
  console.log(` - Campaigns:  http://localhost:${PORT}/api/campaigns`);
  console.log(` - Journey:    http://localhost:${PORT}/api/journey`);
  console.log(` - Prediction: http://localhost:${PORT}/api/prediction`);
  console.log(`==================================================`);
});

