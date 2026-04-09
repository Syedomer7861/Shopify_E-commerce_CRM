async function verify() {
  console.log('--- Triggering Shopify Sync ---');
  try {
    const res = await fetch('http://localhost:3000/api/sync/shopify', { method: 'POST' });
    const data = await res.json();
    console.log('Sync Result:', JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('--- Checking Order #18788 (Vishal Mhatre) ---');
      // Using run_command to check DB in the next step instead of node script for simplicity
      console.log('Sync successful, checking database next...');
    } else {
      console.log('❌ Sync failed:', data.error);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

verify();
