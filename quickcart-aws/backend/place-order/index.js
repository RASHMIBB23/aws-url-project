// ==========================================================
// Lambda: PlaceOrder
// Trigger: API Gateway POST /order
// Role: validates the incoming order, pushes it to SQS,
//       returns immediately (does NOT wait on DB write)
// ==========================================================

const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqs = new SQSClient({});
const QUEUE_URL = process.env.ORDER_QUEUE_URL; // set in Lambda config

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    // --- basic validation ---
    const { orderId, productId, productName, price, placedAt } = body;
    if (!orderId || !productId || !productName || typeof price !== "number") {
      return response(400, { error: "Missing or invalid order fields." });
    }

    // --- push to SQS (decouples from DB write) ---
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify({
          orderId,
          productId,
          productName,
          price,
          placedAt: placedAt || new Date().toISOString(),
          status: "pending",
        }),
      })
    );

    return response(202, {
      message: "Order accepted and queued for processing.",
      orderId,
    });
  } catch (err) {
    console.error("PlaceOrder error:", err);
    return response(500, { error: "Internal server error." });
  }
};

function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // demo only — restrict in production
    },
    body: JSON.stringify(bodyObj),
  };
}
