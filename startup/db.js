const mongoose = require('mongoose')
const db = require('../config/keys').keys

const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  writeConcern: {
    w: 'majority',
  },
}

module.exports = () => {
  mongoose
    .connect(db.mongo.url(), mongoOptions)
    .then(() => {
      console.log(`Connected to MongoDB...`)
    })
    .catch((err) => {
      if (err.name === 'MongooseServerSelectionError') {
        console.error('Could not connect to MongoDB. Please check:')
        console.error('1. Your IP address is whitelisted in MongoDB Atlas')
        console.error('2. Your database credentials are correct')
        console.error('3. Your MongoDB Atlas cluster is running')
        console.error('\nDetailed error:', err.message)
      } else {
        console.error('MongoDB connection error:', err)
      }
      process.exit(1)
    })
}
