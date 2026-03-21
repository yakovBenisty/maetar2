import { MongoClient, Db } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.MONGODB_DB || 'pkuda_db';

const globalWithMongo = global as typeof globalThis & { _mongoClient?: MongoClient };

export async function getDb(): Promise<Db> {
  if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(MONGO_URI);
    await globalWithMongo._mongoClient.connect();
  }
  return globalWithMongo._mongoClient.db(DB_NAME);
}
