const mongoose = require('mongoose')
const Schema = mongoose.Schema

const PaymentSchema = new Schema({
  _user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  checkoutId: {
    type: String,
    required: true,
    unique: true
  },
  orderId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'processing', 'succeeded', 'failed', 'cancelled'],
    default: 'created'
  },
  productCode: {
    type: String,
    required: true
  },
  paymentId: String,
  metadata: Object,
  errorMessage: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

module.exports = mongoose.model('Payment', PaymentSchema)