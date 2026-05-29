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

    console.log('Aggregating Overview Stats...');

    // 1. Daily trend
    console.log('Starting daily trend aggregation...');
    const dailyPipeline = [
      {
        $project: {
          click: 1,
          conversion: 1,
          attribution: 1,
          day: { $floor: { $divide: ["$timestamp", 86400] } }
        }
      },
      {
        $group: {
          _id: "$day",
          impressions: { $sum: 1 },
          clicks: { $sum: "$click" },
          conversions: { $sum: "$conversion" },
          attributions: { $sum: "$attribution" }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          day: "$_id",
          impressions: 1,
          clicks: 1,
          conversions: 1,
          attributions: 1
        }
      }
    ];

    console.time('DailyTime');
    const dailyTrend = await collection.aggregate(dailyPipeline).toArray();
    console.timeEnd('DailyTime');

    // 2. Hourly trend
    console.log('Starting hourly trend aggregation...');
    const hourlyPipeline = [
      {
        $project: {
          click: 1,
          conversion: 1,
          attribution: 1,
          hour: { $floor: { $mod: [{ $floor: { $divide: ["$timestamp", 3600] } }, 24] } }
        }
      },
      {
        $group: {
          _id: "$hour",
          impressions: { $sum: 1 },
          clicks: { $sum: "$click" },
          conversions: { $sum: "$conversion" },
          attributions: { $sum: "$attribution" }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          hour: "$_id",
          impressions: 1,
          clicks: 1,
          conversions: 1,
          attributions: 1
        }
      }
    ];

    console.time('HourlyTime');
    const hourlyTrend = await collection.aggregate(hourlyPipeline).toArray();
    console.timeEnd('HourlyTime');

    // Combine into overview_stats
    const totalImpressions = 16468027;
    const totalClicks = 5947563;
    const totalConversions = 806196;
    const totalAttributions = 442424;

    const results = {
      summary: {
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        attributedConversions: totalAttributions,
        ctr: parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)),
        cvr: parseFloat(((totalConversions / totalClicks) * 100).toFixed(2)),
        attributionRate: parseFloat(((totalAttributions / totalConversions) * 100).toFixed(2))
      },
      dailyTrend,
      hourlyTrend
    };

    const outputPath = path.join(__dirname, 'overview_stats.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Saved pre-aggregated overview stats to ${outputPath} successfully!`);

  } catch (err) {
    console.error('Error during aggregation:', err);
  } finally {
    await client.close();
  }
}

main();
