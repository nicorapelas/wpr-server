const mongoose = require('mongoose')
const Schema = mongoose.Schema

const ErrorSchema = new Schema({
  _user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  error: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
})

mongoose.model('Error', ErrorSchema)
