// Creates src/environments/environment.ts from environment variables.
// GitHub Actions runs this before the build, with the values taken from the repository secrets.
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_KEY must be set.');
  process.exit(1);
}

writeFileSync('src/environments/environment.ts', `export const environment = {
  supabaseUrl: '${url}',
  supabaseKey: '${key}',
};
`);
console.log('src/environments/environment.ts created.');