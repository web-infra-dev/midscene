const fetch = require('node-fetch');

async function testHealth() {
  try {
    console.log('Testing health check...');
    const response = await fetch('http://localhost:5800/status');
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', data);
    console.log('Success!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Test multiple times like the frontend does
let counter = 0;
const interval = setInterval(async () => {
  counter++;
  console.log(`\n--- Test ${counter} ---`);
  await testHealth();

  if (counter >= 5) {
    clearInterval(interval);
    console.log('\nTest completed');
    process.exit(0);
  }
}, 2000);
