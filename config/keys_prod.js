const keys = {
  mongo: {
    url: function() {
      return process.env.MONGO_URI
    },
    options: {
      useNewUrlParser: true
    }
  },
  JWT: {
    secret: process.env.SECRET_OR_KEY
  },
  payfast: {
    merchantId: process.env.PAYFAST_MERCHANT_ID,
    merchantKey: process.env.PAYFAST_MERCHANT_KEY,
  },
  managment: {
    id: process.env.MANAGMENT_ID
  },
  latestAppVersion: {
    v: process.env.LATEST_APP_VERSION
  }
}

exports.keys = keys
