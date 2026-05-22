import { Client } from "pg";

async function check() {
  console.log("Checking databases...");
  
  const adminClient = new Client({
    connectionString: "postgres://kivo:kivo@localhost:5432/kivo_admin"
  });
  
  const kivoClient = new Client({
    connectionString: "postgres://kivo:kivo@localhost:5432/kivo"
  });

  try {
    await adminClient.connect();
    console.log("Connected to kivo_admin!");
    const adminTeamTypes = await adminClient.query("SELECT count(*) FROM team_types;");
    const adminRoles = await adminClient.query("SELECT count(*) FROM agent_roles;");
    const adminCapabilities = await adminClient.query("SELECT count(*) FROM capabilities;");
    console.log(`kivo_admin stats:
- Team Types: ${adminTeamTypes.rows[0].count}
- Agent Roles: ${adminRoles.rows[0].count}
- Capabilities: ${adminCapabilities.rows[0].count}`);
    await adminClient.end();
  } catch (err: any) {
    console.error("Failed to query kivo_admin:", err.message);
  }

  try {
    await kivoClient.connect();
    console.log("Connected to kivo!");
    const kivoTeamTypes = await kivoClient.query("SELECT count(*) FROM team_types;");
    const kivoRoles = await kivoClient.query("SELECT count(*) FROM agent_roles;");
    const kivoCapabilities = await kivoClient.query("SELECT count(*) FROM capabilities;");
    console.log(`kivo stats:
- Team Types: ${kivoTeamTypes.rows[0].count}
- Agent Roles: ${kivoRoles.rows[0].count}
- Capabilities: ${kivoCapabilities.rows[0].count}`);
    await kivoClient.end();
  } catch (err: any) {
    console.error("Failed to query kivo:", err.message);
  }
}

check();
