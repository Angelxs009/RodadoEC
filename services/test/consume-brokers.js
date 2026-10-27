/**
 * Consumidor de prueba de los brokers del agregador: imprime los CloudEvents que el nodo de Autos publica.
 *   node test/consume-brokers.js [segundos]        (por defecto 20)
 * RabbitMQ: exchange booking.events (topic), cola efímera con binding "auto.#"
 * Kafka:    topic topic-ordenes-b2b, desde el inicio
 * Variables: RABBITMQ_URL (amqp://guest:guest@localhost:5672), KAFKA_BROKERS (localhost:9092)
 */
const amqp = require('amqplib');
const { Kafka } = require('kafkajs');

const seconds = Number(process.argv[2] || 20);
const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const kafkaBrokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const counts = { rabbit: 0, kafka: 0 };

async function rabbit() {
  const conn = await amqp.connect(rabbitUrl);
  const ch = await conn.createChannel();
  await ch.assertExchange('booking.events', 'topic', { durable: true });
  const { queue } = await ch.assertQueue('', { exclusive: true });
  await ch.bindQueue(queue, 'booking.events', 'auto.#');
  await ch.consume(queue, (m) => {
    counts.rabbit++;
    const ev = JSON.parse(m.content.toString());
    console.log(`RABBIT  rk=${m.fields.routingKey}  ${ev.type}  id=${ev.id}  auto=${ev.data.auto_id}  specversion=${ev.specversion}  ct=${m.properties.contentType}`);
    ch.ack(m);
  });
  return () => conn.close();
}

async function kafka() {
  const k = new Kafka({ clientId: 'consumer-prueba', brokers: kafkaBrokers });
  const consumer = k.consumer({ groupId: `prueba-${Date.now()}` });
  await consumer.connect();
  await consumer.subscribe({ topic: 'topic-ordenes-b2b', fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      counts.kafka++;
      const ev = JSON.parse(message.value.toString());
      console.log(`KAFKA   key=${message.key}  ${ev.type}  id=${ev.id}  ce_type=${message.headers.ce_type}`);
    },
  });
  return () => consumer.disconnect();
}

(async () => {
  const stops = [];
  stops.push(await rabbit().catch((e) => { console.log('RabbitMQ no disponible:', e.message); return () => {}; }));
  stops.push(await kafka().catch((e) => { console.log('Kafka no disponible:', e.message); return () => {}; }));
  console.log(`Escuchando ${seconds} s…`);
  setTimeout(async () => {
    console.log(`TOTAL  rabbit=${counts.rabbit}  kafka=${counts.kafka}`);
    for (const s of stops) await s().catch(() => {});
    process.exit(0);
  }, seconds * 1000);
})();
