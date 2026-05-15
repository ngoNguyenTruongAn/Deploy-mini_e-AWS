import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "minie-media-metadata";

const ddb = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-southeast-1",
});

export const handler = async (event) => {
  console.log("Incoming event:", JSON.stringify(event));

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const mediaId = body.mediaId || `media-${Date.now()}`;
    const fileName = body.fileName || "unknown-file";
    const source = body.source || "api-gateway";
    const createdAt = new Date().toISOString();

    const item = {
      mediaId: { S: mediaId },
      fileName: { S: fileName },
      source: { S: source },
      createdAt: { S: createdAt },
    };

    console.log("Preparing DynamoDB PutItem:", {
      tableName: TABLE_NAME,
      mediaId,
      fileName,
      source,
      createdAt,
    });

    const putResult = await ddb.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    console.log("DynamoDB PutItem succeeded:", {
      tableName: TABLE_NAME,
      mediaId,
      fileName,
      source,
      createdAt,
      requestId: putResult.$metadata?.requestId,
      httpStatusCode: putResult.$metadata?.httpStatusCode,
      attempts: putResult.$metadata?.attempts,
      totalRetryDelay: putResult.$metadata?.totalRetryDelay,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "Media metadata saved to DynamoDB",
        data: {
          mediaId,
          fileName,
          source,
          createdAt,
          tableName: TABLE_NAME,
          dynamoDbStatusCode: putResult.$metadata?.httpStatusCode,
          dynamoDbRequestId: putResult.$metadata?.requestId,
        },
      }),
    };
  } catch (error) {
    console.error("Lambda error:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: error.message,
      }),
    };
  }
};