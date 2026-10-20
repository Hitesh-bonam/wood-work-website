// On Windows a test server can outlive the test run that started it and then block the next run's port.
// Each server imports this file, so it stops by itself once the process that started it is gone.
const parent = process.ppid;
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    process.exit(0);
  }
}, 2000);
