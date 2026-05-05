const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://kivo:kivo@localhost:5432/kivo' });
async function run() {
  await client.connect();
  try {
    await client.query('ALTER TABLE "team_capabilities" RENAME COLUMN "description" TO "instructions";');
    console.log('Renamed in team_capabilities');
  } catch (e) { console.error(e.message); }
  try {
    await client.query('ALTER TABLE "team_meta_capabilities" RENAME COLUMN "description" TO "instructions";');
    console.log('Renamed in team_meta_capabilities');
  } catch (e) { console.error(e.message); }
  await client.end();
}
run();
