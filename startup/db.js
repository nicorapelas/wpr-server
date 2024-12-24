const mongoose = require('mongoose')
const db = require('../config/keys').keys

const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  writeConcern: {
    w: 'majority'
  }
}

module.exports = () => {
  mongoose
    .connect(db.mongo.url(), mongoOptions)
    .then(() => {
      console.log(`Connected to MongoDB...`)
      
      // Drop the checkoutId index
      mongoose.connection.collections['payments'].dropIndex('checkoutId_1')
        .then(() => console.log('Successfully dropped checkoutId index'))
        .catch(err => {
          // If the index doesn't exist, that's fine
          if (err.code === 27) {
            console.log('Index already dropped or does not exist')
          } else {
            console.error('Error dropping index:', err)
          }
        })
    })
    .catch(err => {
      if (err.name === 'MongooseServerSelectionError') {
        console.error('Could not connect to MongoDB. Please check:');
        console.error('1. Your IP address is whitelisted in MongoDB Atlas');
        console.error('2. Your database credentials are correct');
        console.error('3. Your MongoDB Atlas cluster is running');
        console.error('\nDetailed error:', err.message);
      } else {
        console.error('MongoDB connection error:', err);
      }
      process.exit(1);
    })
}
