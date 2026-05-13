import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "minie-media-metadata";

const ddb = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-southeast-1",
});

async function saveMetadataToDynamoDB(metadata) {
  const createdAt = metadata.createdAt || new Date().toISOString();

  const item = {
    mediaId: { S: metadata.mediaId },
    fileName: { S: metadata.fileName || "unknown-file" },
    source: { S: metadata.source || "unknown-source" },
    createdAt: { S: createdAt },
  };

  if (metadata.bucketName) {
    item.bucketName = { S: metadata.bucketName };
  }

  if (metadata.objectKey) {
    item.objectKey = { S: metadata.objectKey };
  }

  if (metadata.objectSize !== undefined && metadata.objectSize !== null) {
    item.objectSize = { N: String(metadata.objectSize) };
  }

  if (metadata.eventName) {
    item.eventName = { S: metadata.eventName };
  }

  if (metadata.productId !== undefined && metadata.productId !== null) {
    item.productId = { S: String(metadata.productId) };
  }

  if (metadata.sellerId !== undefined && metadata.sellerId !== null) {
    item.sellerId = { S: String(metadata.sellerId) };
  }

  if (metadata.imageUrl) {
    item.imageUrl = { S: metadata.imageUrl };
  }

  if (metadata.cloudinaryPublicId) {
    item.cloudinaryPublicId = { S: metadata.cloudinaryPublicId };
  }

  if (metadata.format) {
    item.format = { S: metadata.format };
  }

  if (metadata.bytes !== undefined && metadata.bytes !== null) {
    item.bytes = { N: String(metadata.bytes) };
  }

  console.log("Preparing DynamoDB PutItem:", {
    tableName: TABLE_NAME,
    mediaId: metadata.mediaId,
    fileName: metadata.fileName,
    source: metadata.source,
    bucketName: metadata.bucketName,
    objectKey: metadata.objectKey,
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
    mediaId: metadata.mediaId,
    source: metadata.source,
    requestId: putResult.$metadata?.requestId,
    httpStatusCode: putResult.$metadata?.httpStatusCode,
    attempts: putResult.$metadata?.attempts,
    totalRetryDelay: putResult.$metadata?.totalRetryDelay,
  });

  return {
    ...metadata,
    createdAt,
    tableName: TABLE_NAME,
    dynamoDbStatusCode: putResult.$metadata?.httpStatusCode,
    dynamoDbRequestId: putResult.$metadata?.requestId,
  };
}

function isS3Event(event) {
  return Array.isArray(event.Records) && event.Records[0]?.eventSource === "aws:s3";
}

function parseS3Event(event) {
  return event.Records.map((record) => {
    const bucketName = record.s3.bucket.name;
    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const objectSize = record.s3.object.size;
    const eventName = record.eventName;

    const fileName = objectKey.split("/").pop() || objectKey;
    const mediaId = `s3-${bucketName}-${objectKey}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, "-");

    return {
      mediaId,
      fileName,
      source: "s3-object-created-event",
      bucketName,
      objectKey,
      objectSize,
      eventName,
      createdAt: new Date().toISOString(),
    };
  });
}

function parseApiGatewayEvent(event) {
  const body = event.body ? JSON.parse(event.body) : {};

  return [
    {
      mediaId: body.mediaId || `media-${Date.now()}`,
      fileName: body.fileName || "unknown-file",
      source: body.source || "api-gateway",
      productId: body.productId,
      sellerId: body.sellerId,
      imageUrl: body.imageUrl,
      cloudinaryPublicId: body.cloudinaryPublicId,
      bytes: body.bytes,
      format: body.format,
      createdAt: new Date().toISOString(),
    },
  ];
}

export const handler = async (event) => {
  console.log("Incoming event:", JSON.stringify(event));

  try {
    const metadataItems = isS3Event(event)
      ? parseS3Event(event)
      : parseApiGatewayEvent(event);

    const results = [];

    for (const metadata of metadataItems) {
      const result = await saveMetadataToDynamoDB(metadata);
      results.push(result);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "Media metadata saved to DynamoDB",
        eventType: isS3Event(event) ? "s3-object-created" : "api-gateway",
        count: results.length,
        data: results,
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