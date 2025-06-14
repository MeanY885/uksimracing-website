// Simple test script to verify webhook works
const axios = require('axios');

async function testWebhook() {
    const payload = {
        content: "Test News Post\n\nThis is a manual test to verify the webhook integration works correctly!",
        author: "TestUser",
        message_id: "test123",
        channel: "general",
        timestamp: new Date().toISOString(),
        attachments: []
    };

    try {
        const response = await axios.post('http://localhost:2000/webhook/discord', payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': process.env.WEBHOOK_SECRET || 'your-webhook-secret-here'
            }
        });

        console.log('✅ Webhook test successful!');
        console.log('Response:', response.data);
    } catch (error) {
        console.error('❌ Webhook test failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testWebhook();