import mongoose from 'mongoose';

if (!globalThis.__expenseTrackerMongo) {
  globalThis.__expenseTrackerMongo = {
    conn: null,
    promise: null,
  };
}

export async function connectDB() {
  const mongodbUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expense_tracker';

  if (globalThis.__expenseTrackerMongo.conn) {
    return globalThis.__expenseTrackerMongo.conn;
  }

  if (!globalThis.__expenseTrackerMongo.promise) {
    globalThis.__expenseTrackerMongo.promise = mongoose.connect(mongodbUri).catch((err) => {
      globalThis.__expenseTrackerMongo.promise = null;
      throw err;
    });
  }

  globalThis.__expenseTrackerMongo.conn = await globalThis.__expenseTrackerMongo.promise;
  return globalThis.__expenseTrackerMongo.conn;
}
