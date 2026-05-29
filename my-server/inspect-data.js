const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://localhost:27020';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('vccorp');
    const collection = db.collection('data_ads_final');

    console.log('Calculating stats...');
    
    // 1. Get min/max timestamp
    const timeStats = await collection.aggregate([
      {
        $group: {
          _id: null,
          minTime: { $min: "$timestamp" },
          maxTime: { $max: "$timestamp" },
          uniqueCampaigns: { $addToSet: "$campaign" }
        }
      }
    ]).toArray();
    
    console.log('Timestamp and Campaign stats:');
    if (timeStats.length > 0) {
      console.log(`Min Timestamp: ${timeStats[0].minTime}`);
      console.log(`Max Timestamp: ${timeStats[0].maxTime}`);
      console.log(`Unique campaigns count: ${timeStats[0].uniqueCampaigns.length}`);
      console.log(`Sample campaigns (first 5):`, timeStats[0].uniqueCampaigns.slice(0, 5));
    }

    // 2. Count clicks, conversions, attributions
    const counts = await collection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          clicks: { $sum: "$click" },
          conversions: { $sum: "$conversion" },
          attributions: { $sum: "$attribution" }
        }
      }
    ]).toArray();

    console.log('\nEvent stats:');
    console.dir(counts, { depth: null });

    // 3. See if we have other collections (e.g. for ML predictions, models, etc.)
    const collections = await db.listCollections().toArray();
    console.log('\nAll Collections:');
    collections.forEach(c => console.log(` - ${c.name}`));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
