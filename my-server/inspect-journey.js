const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://localhost:27020';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('vccorp');
    const collection = db.collection('data_ads_final');

    console.log('Analyzing Journey and Funnel fields...');

    // 1. Journey combination distribution
    console.log('\n--- 1. Click / Conversion / Attribution Combinations ---');
    const combinations = await collection.aggregate([
      {
        $group: {
          _id: { click: "$click", conversion: "$conversion", attribution: "$attribution" },
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    console.dir(combinations, { depth: null });

    // 2. click_pos and click_nb distribution and conversion rates
    console.log('\n--- 2. Sample click_nb and click_pos ---');
    const clickStats = await collection.aggregate([
      {
        $group: {
          _id: "$click_nb",
          count: { $sum: 1 },
          conversions: { $sum: "$conversion" }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 10 }
    ]).toArray();
    console.dir(clickStats, { depth: null });

    // 3. time_since_last_click distribution
    console.log('\n--- 3. time_since_last_click and Conversion Rate ---');
    const timeStats = await collection.aggregate([
      {
        $bucket: {
          groupBy: "$time_since_last_click",
          boundaries: [-1, 0, 60, 3600, 86400, 604800, 2671200],
          default: "Other",
          output: {
            count: { $sum: 1 },
            conversions: { $sum: "$conversion" }
          }
        }
      }
    ]).toArray();
    console.dir(timeStats, { depth: null });

    // 4. uid uniqueness and event count per uid (let's sample 10 uids)
    console.log('\n--- 4. User ID uniqueness check ---');
    const userSample = await collection.aggregate([
      { $group: { _id: "$uid", eventCount: { $sum: 1 }, conversions: { $sum: "$conversion" } } },
      { $limit: 10 }
    ]).toArray();
    console.dir(userSample, { depth: null });

    // Check unique uids count
    console.log('Counting unique users (estimating)...');
    const uniqueUidsSample = await collection.aggregate([
      { $sample: { size: 10000 } },
      { $group: { _id: "$uid" } }
    ]).toArray();
    console.log(`In a random sample of 10,000 ads events, we have ${uniqueUidsSample.length} unique uids.`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
