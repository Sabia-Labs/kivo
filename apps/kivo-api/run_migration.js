const { spawn } = require('child_process');
const child = spawn('npx', ['drizzle-kit', 'generate'], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.write('\r\r\r\r\r\r\r\r\r');
setTimeout(() => { child.stdin.write('\r\r\r\r\r\r\r\r\r'); }, 500);
setTimeout(() => { child.stdin.write('\r\r\r\r\r\r\r\r\r'); }, 1000);
setTimeout(() => { child.stdin.end(); }, 2000);
