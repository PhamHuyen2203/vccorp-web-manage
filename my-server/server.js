const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Helper to read and send JSON files
const serveJsonFile = (fileName, res) => {
  const filePath = path.join(__dirname, fileName);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading ${fileName}:`, err);
      return res.status(500).json({ error: `Failed to load data for ${fileName}. Make sure aggregation scripts have run successfully.` });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      console.error(`Error parsing ${fileName}:`, parseErr);
      res.status(500).json({ error: `Corrupt JSON data in ${fileName}.` });
    }
  });
};

// Endpoints
app.get('/api/overview', (req, res) => {
  serveJsonFile('overview_stats.json', res);
});

app.get('/api/campaigns', (req, res) => {
  serveJsonFile('campaign_daily_stats.json', res);
});

app.get('/api/journey', (req, res) => {
  serveJsonFile('journey_stats.json', res);
});

app.get('/api/prediction', (req, res) => {
  serveJsonFile('prediction_metrics.json', res);
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
