// ==========================================================
// Lambda: ProcessOrder
// Trigger: SQS (event source mapping on OrderQueue)
// Role: writes the order to DynamoDB with an idempotency
//       check, so duplicate SQS deliveries don't double-write
// Failure: after 3 failed attempts, SQS redrive policy sends
//          the message to the Dead Letter Queue automatically
// ==========================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.ORDERS_TABLE; // set in Lambda config

exports.handler = async (event) => {
  for (const record of event.Records) {
    const order = JSON.parse(record.body);

    try {
      // --- idempotency check: has this orderId already been written? ---
      const existing = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { orderId: order.orderId },
        })
      );

      if (existing.Item) {
        console.log(`Order ${order.orderId} already processed — skipping.`);
        continue;
      }

      // --- write order to DynamoDB ---
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...order,
            status: "completed",
            processedAt: new Date().toISOString(),
          },
        })
      );

      console.log(`Order ${order.orderId} processed successfully.`);
    } catch (err) {
      console.error(`Failed to process order ${order.orderId}:`, err);
      // Throwing here tells SQS this message failed.
      // After maxReceiveCount (e.g. 3) retries, SQS auto-moves
      // it to the configured Dead Letter Queue.
      throw err;
    }
  }
};
