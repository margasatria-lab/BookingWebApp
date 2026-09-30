const { openDb, promoteAdmins } = require('./db');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
const db = openDb();
promoteAdmins(db);
createApp(db).listen(port, () => console.log(`Listening on http://localhost:${port}`));
