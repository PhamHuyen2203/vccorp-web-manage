const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://localhost:27020';
  const client = new MongoClient(uri);

  try {
    console.log('Connecting to MongoDB on', uri);
    await client.connect();
    console.log('Connected successfully!');

    // List all databases
    const adminDb = client.db().admin();
    const dbsList = await adminDb.listDatabases();
    console.log('\nDatabases:');
    dbsList.databases.forEach(db => console.log(` - ${db.name} (size: ${db.sizeOnDisk} bytes)`));

    // For each database (excluding system ones), list collections and show a sample doc
    for (const dbInfo of dbsList.databases) {
      if (['admin', 'config', 'local'].includes(dbInfo.name)) continue;
      
      console.log(`\n================ Database: ${dbInfo.name} ================`);
      const db = client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();
      
      for (const col of collections) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`\nCollection: ${col.name} (Documents: ${count})`);
        
        const sample = await db.collection(col.name).findOne();
        if (sample) {
          console.log('Sample Document Keys and Types:');
          const schema = {};
          for (const key in sample) {
            schema[key] = {
              type: typeof sample[key],
              valueSample: typeof sample[key] === 'object' ? JSON.stringify(sample[key]).substring(0, 100) : sample[key]
            };
          }
          console.dir(schema, { depth: null });
        } else {
          console.log('Collection is empty.');
        }
      }
    }

  } catch (err) {
    console.error('Error connecting or querying database:', err);
  } finally {
    await client.close();
  }
}

main();
