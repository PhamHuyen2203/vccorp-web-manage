const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function main() {
  const uri = 'mongodb://localhost:27020';
  const client = new MongoClient(uri);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    const db = client.db('vccorp');
    const collection = db.collection('data_ads_final');

    console.log('Starting heavy aggregation grouping by (campaign, day)...');
    
    // Group by campaign and day (day = floor(timestamp / 86400))
    const pipeline = [
      {
        $project: {
          campaign: 1,
          click: 1,
          conversion: 1,
          attribution: 1,
          cost: 1,
          day: { $floor: { $divide: ["$timestamp", 86400] } }
        }
      },
      {
        $group: {
          _id: { campaign: "$campaign", day: "$day" },
          impressions: { $sum: 1 },
          clicks: { $sum: "$click" },
          conversions: { $sum: "$conversion" },
          attributions: { $sum: "$attribution" },
          cost: { $sum: "$cost" }
        }
      },
      {
        $project: {
          _id: 0,
          campaign: "$_id.campaign",
          day: "$_id.day",
          impressions: 1,
          clicks: 1,
          conversions: 1,
          attributions: 1,
          cost: 1
        }
      },
      {
        $sort: { campaign: 1, day: 1 }
      }
    ];

    console.time('AggregationTime');
    const results = await collection.aggregate(pipeline).toArray();
    console.timeEnd('AggregationTime');

    console.log(`Aggregated ${results.length} campaign-daily records.`);

    // Let's compute campaign total costs to define "cost buckets"
    const campaignCosts = {};
    results.forEach(row => {
      if (!campaignCosts[row.campaign]) {
        campaignCosts[row.campaign] = 0;
      }
      campaignCosts[row.campaign] += row.cost;
    });

    // Let's sort campaign costs to determine percentile boundaries for cost buckets
    const costsArray = Object.values(campaignCosts).sort((a, b) => a - b);
    const len = costsArray.length;
    const lowBoundary = costsArray[Math.floor(len * 0.33)] || 1.0;
    const medBoundary = costsArray[Math.floor(len * 0.66)] || 10.0;
    
    console.log(`Campaign Cost Boundaries:`);
    console.log(`Low-Spend Boundary (33rd percentile): < $${lowBoundary.toFixed(2)}`);
    console.log(`Medium-Spend Boundary (66th percentile): $${lowBoundary.toFixed(2)} - $${medBoundary.toFixed(2)}`);
    console.log(`High-Spend Boundary: > $${medBoundary.toFixed(2)}`);

    // Add cost bucket, CTR, CVR, and Attribution Rate to each campaign-daily record
    const campaignMeta = {};
    Object.keys(campaignCosts).forEach(campaignId => {
      const totalCost = campaignCosts[campaignId];
      let costBucket = 'Low spend';
      if (totalCost > medBoundary) {
        costBucket = 'High spend';
      } else if (totalCost > lowBoundary) {
        costBucket = 'Medium spend';
      }
      campaignMeta[campaignId] = {
        costBucket,
        totalCost
      };
    });

    const enrichedResults = results.map(row => {
      const ctr = row.impressions > 0 ? (row.clicks / row.impressions) : 0;
      const cvr = row.clicks > 0 ? (row.conversions / row.clicks) : 0;
      const attributionRate = row.conversions > 0 ? (row.attributions / row.conversions) : 0;
      
      return {
        ...row,
        ctr: parseFloat(ctr.toFixed(6)),
        cvr: parseFloat(cvr.toFixed(6)),
        attributionRate: parseFloat(attributionRate.toFixed(6)),
        costBucket: campaignMeta[row.campaign].costBucket
      };
    });

    // Save aggregated JSON
    const outputPath = path.join(__dirname, 'campaign_daily_stats.json');
    fs.writeFileSync(outputPath, JSON.stringify(enrichedResults, null, 2));
    console.log(`Saved pre-aggregated campaign daily stats to ${outputPath} successfully!`);

  } catch (err) {
    console.error('Error during aggregation:', err);
  } finally {
    await client.close();
  }
}

main();
