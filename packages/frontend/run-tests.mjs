/* global process, console */
import { exec } from 'child_process';

const args = process.argv.slice(2).join(' ');
const cmd = `npx playwright test --project=chromium ${args} --reporter=list 2>&1`;

exec(cmd, {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024}, (err, stdout) => {
  const output = stdout || '';
  const lines = output.split('\n').filter(l => {
    return l.indexOf('Debugger') === -1 &&
           l.indexOf('For help, see:') === -1 &&
           l.indexOf('Waiting for the debugger') === -1;
  });
  console.log(lines.slice(-200).join('\n'));
  if (err) console.log('Exit code:', err.code);
});
