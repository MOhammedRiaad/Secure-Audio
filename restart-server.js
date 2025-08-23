const { exec } = require('child_process');
const path = require('path');

console.log('Stopping any running Node.js processes...');

// Windows command to find and kill Node.js processes
const killCommand = 'taskkill /F /IM node.exe';

exec(killCommand, (error, stdout, stderr) => {
  if (error) {
    console.log(`No Node.js processes were running or error: ${error.message}`);
  } else {
    console.log('Successfully stopped running Node.js processes');
  }
  
  // Wait a moment for processes to terminate
  setTimeout(() => {
    console.log('Starting the server...');
    const serverProcess = exec('node start-server.js', {
      cwd: __dirname,
      windowsHide: true
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
    });
  }, 2000);
});
