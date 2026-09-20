// Runs the UK pipeline, which writes straight into src/data. Kept as a script so `npm run sync` works the same way.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
execFileSync('python3', [join(here, '..', '..', 'pipeline', 'update.py')], { stdio: 'inherit' });
