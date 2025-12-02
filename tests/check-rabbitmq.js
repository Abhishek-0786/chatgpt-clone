/**
 * Script to check RabbitMQ queue status
 * Run: node check-rabbitmq.js
 */

const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

async function checkRabbitMQ() {
  try {
    console.log('🔌 Connecting to RabbitMQ...');
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    console.log('✅ Connected to RabbitMQ\n');

    // Check ocpp_messages queue
    const ocppQueue = 'ocpp_messages';
    const queueInfo = await channel.checkQueue(ocppQueue);
    
    console.log('📊 Queue Status:');
    console.log(`   Queue Name: ${ocppQueue}`);
    console.log(`   Messages Ready: ${queueInfo.messageCount}`);
    console.log(`   Consumers: ${queueInfo.consumerCount}`);
    console.log(`   Messages Unacked: ${queueInfo.messageCount} (if any)\n`);

    // Check exchange
    const exchangeName = 'ev_charging_events';
    try {
      const exchangeInfo = await channel.checkExchange(exchangeName);
      console.log('📡 Exchange Status:');
      console.log(`   Exchange Name: ${exchangeName}`);
      console.log(`   Exchange Type: ${exchangeInfo.exchange}\n`);
    } catch (err) {
      console.log(`   ⚠️ Exchange ${exchangeName} not found\n`);
    }

    // Get message count from all queues
    const queues = [
      'ocpp_messages',
      'charging_commands',
      'charging_events',
      'notifications',
      'cms_events',
      'analytics',
      'ev_charging_dlq'
    ];

    console.log('📋 All Queues Status:');
    for (const queueName of queues) {
      try {
        const info = await channel.checkQueue(queueName);
        console.log(`   ${queueName}:`);
        console.log(`      Ready: ${info.messageCount}`);
        console.log(`      Consumers: ${info.consumerCount}`);
      } catch (err) {
        // Queue might not exist yet
        console.log(`   ${queueName}: Not found`);
      }
    }

    await channel.close();
    await connection.close();
    console.log('\n✅ Check complete!');
  } catch (error) {
    console.error('❌ Error checking RabbitMQ:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Make sure RabbitMQ is running:');
      console.error('   - Check Docker: docker ps | grep rabbitmq');
      console.error('   - Or check service: sudo systemctl status rabbitmq-server');
    }
    process.exit(1);
  }
}

checkRabbitMQ();

