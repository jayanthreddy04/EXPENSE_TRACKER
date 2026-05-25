import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: 'General', trim: true },
    date: { type: Date, default: Date.now },
    description: { type: String, trim: true },
    receiptImage: { type: String },
    source: {
      type: String,
      enum: ['manual', 'receipt'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Expense', expenseSchema);
