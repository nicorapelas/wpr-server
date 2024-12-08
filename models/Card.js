const mongoose = require('mongoose')
const Schema = mongoose.Schema

const CardSchema = new Schema({
  batchId: {
    type: String,
    required: true,
    trim: true
  },
  product: {
    type: String,
    required: true,
    trim: true
  },
  cardNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  account: {
    type: String,
    default: "",
    trim: true
  },
  password: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['created', 'used', 'expired'],
    default: 'created'
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

CardSchema.index({ cardNo: 1 })
CardSchema.index({ status: 1 })

CardSchema.methods.markAsUsed = async function(userId) {
  this.status = 'used'
  this.usedBy = userId
  this.usedAt = new Date()
  return await this.save()
}

CardSchema.statics.findAvailable = function() {
  return this.find({ status: 'created' })
}

CardSchema.statics.findByStatus = function(status) {
  return this.find({ status })
}

const Card = mongoose.model('Card', CardSchema)

module.exports = Card
