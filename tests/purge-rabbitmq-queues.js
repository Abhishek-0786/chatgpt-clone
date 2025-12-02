/**
 * Purge RabbitMQ Audit Queues
 * This script purges messages from audit/analytics queues
 * Usage: node purge-rabbitmq-queues.js [queue-name]
 * Example: node purge-rabbitmq-queues.js charging_commands
 */

const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

const AUDIT_QUEUES = [
  'charging_commands',
  'charging_events',
  'cms_events',
  'analytics'
];

async function purgeQueue(queueName) {
  try {
    console.log(`🔌 Connecting to RabbitMQ...`);
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Check if queue exists
    const queueInfo = await channel.checkQueue(queueName);
    console.log(`📊 Queue: ${queueName}`);
    console.log(`   Messages: ${queueInfo.messageCount}`);
    console.log(`   Consumers: ${queueInfo.consumerCount}`);

    if (queueInfo.messageCount === 0) {
      console.log(`✅ Queue is already empty`);
      await channel.close();
      await connection.close();
      return;
    }

    // Purge the queue
    const result = await channel.purgeQueue(queueName);
    console.log(`🗑️  Purged ${result.messageCount} message(s) from ${queueName}`);
    
    await channel.close();
    await connection.close();
    console.log(`✅ Done!`);
  } catch (error) {
    console.error(`❌ Error purging queue ${queueName}:`, error.message);
    process.exit(1);
  }
}

async function purgeAllAuditQueues() {
  try {
    console.log(`🔌 Connecting to RabbitMQ...`);
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    console.log(`🗑️  Purging all audit queues...`);
    console.log('');

    let totalPurged = 0;
    for (const queueName of AUDIT_QUEUES) {
      try {
        const queueInfo = await channel.checkQueue(queueName);
        if (queueInfo.messageCount > 0) {
          const result = await channel.purgeQueue(queueName);
          console.log(`✅ ${queueName}: Purged ${result.messageCount} message(s)`);
          totalPurged += result.messageCount;
        } else {
          console.log(`ℹ️  ${queueName}: Already empty`);
        }
      } catch (error) {
        console.warn(`⚠️  ${queueName}: ${error.message}`);
      }
    }

    await channel.close();
    await connection.close();
    
    console.log('');
    console.log(`✅ Done! Total messages purged: ${totalPurged}`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

// Main
const queueName = process.argv[2];

if (queueName) {
  if (AUDIT_QUEUES.includes(queueName)) {
    purgeQueue(queueName);
  } else {
    console.error(`❌ Invalid queue name: ${queueName}`);
    console.error(`   Valid queues: ${AUDIT_QUEUES.join(', ')}`);
    process.exit(1);
  }
} else {
  console.log('🗑️  Purging all audit queues...');
  console.log(`   Queues: ${AUDIT_QUEUES.join(', ')}`);
  console.log('');
  purgeAllAuditQueues();
}

