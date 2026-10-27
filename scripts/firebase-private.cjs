// Never let Firebase's debug logger record a Secret Manager payload.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cliRoot = path.join(root, '.local/firebase-cli/node_modules/firebase-tools/lib');
const { logger } = require(path.join(cliRoot, 'logger.js'));
logger.silent = true;
require(path.join(cliRoot, 'bin/firebase.js'));
