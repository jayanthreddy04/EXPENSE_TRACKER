import './config/env.js';
import app from './app.js';
import { connectDB } from './db.js';

const PORT = process.env.PORT || 5001;

connectDB()
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
