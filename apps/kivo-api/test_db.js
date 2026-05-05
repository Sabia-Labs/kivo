const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://kivo:kivo@localhost:5432/kivo' });
async function run() {
  await client.connect();
  const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'team_capabilities'`);
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}
run();
