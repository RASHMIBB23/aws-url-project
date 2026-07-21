// ==========================================================
// Lambda: GetOrders
// Trigger: API Gateway GET /orders
// Role: returns recent orders from DynamoDB for the
//       frontend's live status table
// ==========================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.ORDERS_TABLE;

exports.handler = async () => {
  try {
    // Scan is fine for a small demo table.
    // For production/high volume, use a Query with a GSI
    // (e.g. on placedAt) instead of Scan.
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 25,
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(result.Items || []),
    };
  } catch (err) {
    console.error("GetOrders error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to fetch orders." }),
    };
  }
};
