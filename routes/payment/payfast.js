const express = require('express')
const router = express.Router()
const axios = require('axios')
const crypto = require('crypto')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = '10000100'  // Sandbox merchant ID
const PAYFAST_MERCHANT_KEY = '46f0cd694581a'  // Sandbox merchant key
const PAYFAST_PASSPHRASE = 'jt7NOE43FZPn'  // Optional sandbox passphrase
const FRONTEND_URL = 'https://charming-biscuit-df1d0f.netlify.app'
const BACKEND_URL = 'https://coups-1889de9f2619.herokuapp.com/'
const TEST_EMAIL = 'nicorapelas@gmail.com'

const generateSignature = (data) => {
  // Remove signature and testing parameters
  const dataToSign = { ...data }
  delete dataToSign.signature
  delete dataToSign.testing

  // Get keys and sort them alphabetically
  const sortedKeys = Object.keys(dataToSign).sort()

  // Create parameter string with raw values (no URL encoding)
  const pfOutput = sortedKeys
    .map(key => {
      if (dataToSign[key] !== '') {
        return `${key}=${dataToSign[key].trim()}`
      }
      return null
    })
    .filter(item => item !== null)
    .join('&')

  return crypto.createHash('md5').update(pfOutput).digest('hex')
}

router.post('/create-payment', requireAuth, async (req, res) => {
  const { amountInCents, currency, productCode } = req.body
  
  try {
    // Validate required fields
    if (!amountInCents || !currency || !productCode) {  
      console.error('Missing required fields:', { amountInCents, currency, productCode })
      return res.status(400).json({
        message: 'Missing required fields'
      })
    }

    // Ensure we have a valid email
    if (!req.user.email) {
      return res.status(400).json({
        message: 'User email is required for payment'
      })
    }

    const paymentData = {
      amount: '100.00',
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      email_address: 'test@test.com',
      item_name: 'Test Product',
      m_payment_id: Date.now().toString(),
      merchant_id: '10000100',
      merchant_key: '46f0cd694581a',
      name_first: 'Test',
      name_last: 'User',
      notify_url: `${BACKEND_URL}/payment/webhook`,
      return_url: `${FRONTEND_URL}/payment-success`,  
      testing: 'true'
    }

    // Create payment record
        await Payment.findOneAndUpdate(
      {
        _user: req.user,
        status: 'created',
        productCode: productCode,
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }
      },
      {
        $set: {
          orderId: paymentData.m_payment_id,
          amount: amountInCents,
          currency: currency,
          metadata: paymentData
        }
      },
      { new: true, upsert: true }
    )

    res.json({
      redirectUrl: 'https://sandbox.payfast.co.za/eng/process',  // Use sandbox URL for testing
      paymentData
    })

  } catch (error) {
    console.error('Payfast Error:', error.response?.data || error.message)
    res.status(500).json({
      message: error.response?.data?.message || 'Payment failed'
    })
  }
})

// Add body-parser raw configuration for webhook
router.use('/webhook', express.raw({ type: 'application/json' }));

router.post('/webhook', async (req, res) => {

  try {
    // Parse the raw body
    const pfData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    

    // Verify payment data
    if (!pfData.payment_status || !pfData.m_payment_id) {
      return res.status(400).json({ error: 'Invalid webhook data structure' });
    }

    switch (pfData.payment_status) {
      case 'COMPLETE': {
        // Find the payment using m_payment_id
        const payment = await Payment.findOne({ orderId: pfData.m_payment_id });
        
        if (payment) {
          payment.status = 'succeeded';
          payment.paymentId = pfData.pf_payment_id;
          payment.updatedAt = new Date();
          payment.metadata = {
            ...payment.metadata,
            paymentMethodDetails: {
              type: pfData.payment_method,
              last4: pfData.card_last_four || null
            },
            completedAt: new Date()
          };
          await payment.save();

          // Determine number of cards based on product code
          let cardCount;

          switch(payment.productCode) {
            case 'WP002':
              cardCount = 5;
              break;
            case 'WP003':
              cardCount = 10;
              break;
            default: // WP001 and any other cases
              cardCount = 1;
          }

          // Find and update multiple cards
          const cards = await Card.find({ status: { $ne: 'sold' } })
            .limit(cardCount)
            .exec();

          if (cards.length < cardCount) {
            console.warn(`Insufficient cards available. Requested: ${cardCount}, Found: ${cards.length}`);
          }

          // Update only the specific cards found
          if (cards.length > 0) {
            const cardIds = cards.map(card => card._id);
            await Card.updateMany(
              { _id: { $in: cardIds } },
              {
                status: 'sold',
                purchasedBy: payment._user,
                purchasedAt: new Date()
              }
            );
          }
        } else {
          console.warn(`Payment record not found for order ID: ${pfData.m_payment_id}`);
        }
        break;
      }

      case 'FAILED':
      case 'CANCELLED': {
        const payment = await Payment.findOne({ orderId: pfData.m_payment_id });
        
        if (payment) {
          payment.status = 'failed';
          payment.errorMessage = pfData.reason || 'Payment failed';
          payment.updatedAt = new Date();
          await payment.save();
        }
        break;
      }

      default: {
        console.log(`Unhandled payment status: ${pfData.payment_status}`);
      }
    }

    // Always return 200 for webhooks
    res.status(200).json({ received: true });
  } catch (error) {
    // Still return 200 to acknowledge receipt
    res.status(200).json({ received: true, error: error.message });
  }
});

// Add the fetch purchase history endpoint
router.post('/fetch-purchase-history', requireAuth, async (req, res) => {
  const { ownerId } = req.body;
  const payments = await Payment.find({ _user: ownerId });
  res.json(payments);
});

module.exports = router
