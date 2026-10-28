const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureProjectDirectory } = require('./project');

// One writer per project. The lock is created exclusively; it is never removed
// because of its age. It is recovered only when it names a process on this
// host that no longer exists, and that recovery is written to history.
const LOCK = '.taptop/lock';

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function readLock(root) {
  let text;
  try { text = fs.readFileSync(path.join(root, LOCK), 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try { return JSON.parse(text); } catch { return { unreadable: true }; }
}

function lockState(root) {
  const lock = readLock(root);
  if (!lock) return { state: 'free' };
  if (lock.unreadable || !Number.isInteger(lock.pid)) return { state: 'unknown', lock };
  if (lock.host === os.hostname() && !processExists(lock.pid)) return { state: 'abandoned', lock };
  return { state: 'held', lock };
}

function acquireProjectLock(root, operation) {
  ensureProjectDirectory(root, '.taptop/history');
  const file = path.join(root, LOCK);
  const owner = { pid: process.pid, host: os.hostname(), operation, startedAt: new Date().toISOString() };
  const current = lockState(root);
  if (current.state === 'abandoned') {
    fs.appendFileSync(path.join(root, '.taptop/history/recovered-locks.jsonl'), `${JSON.stringify({ recoveredAt: owner.startedAt, previous: current.lock })}\n`);
    fs.rmSync(file, { force: true });
  } else if (current.state !== 'free') {
    const who = current.lock?.operation ? `${current.lock.operation} by process ${current.lock.pid} since ${current.lock.startedAt}` : 'an unreadable lock';
    throw new Error(`PROJECT_LOCKED: another task is writing this project (${who}). Wait for it to finish; run doctor if no task is running.`);
  }
  try { fs.writeFileSync(file, `${JSON.stringify(owner)}\n`, { flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('PROJECT_LOCKED: another task started writing this project at the same moment');
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const lock = readLock(root);
    if (lock && lock.pid === owner.pid && lock.startedAt === owner.startedAt) fs.rmSync(file, { force: true });
  };
}

module.exports = { LOCK, acquireProjectLock, lockState };
