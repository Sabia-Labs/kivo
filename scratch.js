const fs = require('fs');

let code = fs.readFileSync('apps/kivo-web/app/teams/[id]/requests/[requestId]/page.tsx', 'utf8');

// replace suggestedCapabilities with requestCapabilities
code = code.replace(/suggestedCapabilities/g, 'requestCapabilities');
code = code.replace(/setSuggestedCapabilities/g, 'setRequestCapabilities');

// request.responseStatusCode with request.resolution
code = code.replace(/request.responseStatusCode === 200/g, 'request.resolution === "success"');
code = code.replace(/request.responseStatusCode !== 200/g, 'request.resolution !== "success"');

// request.responseMetadata with request.response
code = code.replace(/request.responseMetadata/g, 'request.response');

// "created" status should be "open", "processing" should be "in_progress", "responded" should be "completed"
code = code.replace(/request\.status === "created"/g, 'request.status === "open"');
code = code.replace(/request\.status === "processing"/g, 'request.status === "in_progress"');
code = code.replace(/request\.status === "responded"/g, 'request.status === "completed"');

// status strings in UI
code = code.replace(/handleUpdateDraft\("created"\)/g, 'handleUpdateDraft("open")');
code = code.replace(/status === "created"/g, 'status === "open"');

fs.writeFileSync('apps/kivo-web/app/teams/[id]/requests/[requestId]/page.tsx', code);
