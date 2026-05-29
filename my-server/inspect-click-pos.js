const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://localhost:27020';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('vccorp');
    const collection = db.collection('data_ads_final');

    console.log('Inspecting click_pos and click_nb across conversions and non-conversions...');

    // 1. click_pos distribution for conversion = 1
    console.log('\n--- click_pos for conversions ---');
    const convClickPos = await collection.aggregate([
      { $match: { conversion: 1 } },
      { $group: { _id: "$click_pos", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 10 }
    ]).toArray();
    console.dir(convClickPos);

    // 2. click_pos distribution for conversion = 0
    console.log('\n--- click_pos for non-conversions ---');
    const nonConvClickPos = await collection.aggregate([
      { $match: { conversion: 0 } },
      { $group: { _id: "$click_pos", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 10 }
    ]).toArray();
    console.dir(nonConvClickPos);

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
