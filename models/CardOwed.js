const mongoose = require('mongoose')
const Schema = mongoose.Schema

const CardOwedSchema = new Schema({
  owedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  numberOfCards: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

module.exports = mongoose.model('CardOwed', CardOwedSchema)
