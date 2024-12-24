const express = require('express')
const router = express.Router()
const axios = require('axios')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card') 
const User = require('../../models/User')
const requireAuth = require('../../middlewares/requireAuth')

const YOCO_SECRET_KEY = keys.yoco.secretKey
const YOCO_API_URL = 'https://payments.yoco.com/api/'
const FRONTEND_URL = 'https://f0b4-41-145-194-61.ngrok-free.app'
const BACKEND_URL = 'https://f627-41-150-34-61.ngrok-free.app'

router.post('/create-payment', requireAuth, async (req, res) => {
  const { amountInCents, currency, description, productCode } = req.body
    
  try {
    const checkoutData = {
      amount: amountInCents,
      currency: currency,
      description: description,
      successUrl: `${FRONTEND_URL}/payment-success`,
      cancelUrl: `${FRONTEND_URL}/payment-cancelled?reason=user_back`,
      backUrl: `${FRONTEND_URL}/payment-cancelled?reason=browser_back`,
      failureUrl: `${FRONTEND_URL}/payment-cancelled`,
      successMessage: 'Payment successful! You will be redirected automatically.',
      returnButton: {
        label: 'Return to Store',
        url: FRONTEND_URL
      },
      mode: 'payment',
      payment_methods: ['card'],
      layout: {
        show_cancel: true,
        cancel_text: 'Cancel Payment',
        show_back: true,
        back_text: 'Go Back'
      },
      metadata: {
        order_id: Date.now().toString(),
        checkoutId: null,
        paymentFacilitator: "yoco-online-checkout",
        description: description,
        productCode: productCode,
        _user: req.user._id
             }
    }

    const response = await axios({
      method: 'post',
      url: `${YOCO_API_URL}checkouts`,
      headers: {
        'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      data: checkoutData
    })

    await Payment.findOneAndUpdate(
      {
        _user: req.user,
        status: 'created',
        productCode: productCode,
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }
      },
      {
        $set: {
          checkoutId: response.data.id,
          orderId: checkoutData.metadata.order_id,
          amount: checkoutData.amount,
          currency: checkoutData.currency,
          metadata: response.data.metadata
        }
      },
      { new: true, upsert: true }
    )
    res.json(response.data)

  } catch (error) {
    console.error('Yoco Error:', error.response?.data || error.message)
    res.status(500).json({ 
      message: error.response?.data?.message || 'Payment failed'
    })
  }
})

// Add body-parser raw configuration to preserve raw body for webhook verification
router.use('/webhook', express.raw({type: 'application/json'}));

router.post('/webhook', async (req, res) => {
  try {
    // Parse the raw body if it hasn't been parsed
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    // Add more detailed logging
    if (!event.type || !event.payload) {
      console.log('Invalid event structure received');
      return res.status(400).json({ error: 'Invalid event structure' });
    }

    switch (event.type) {
      case 'payment.succeeded': {
        const { payload } = event
        const { metadata } = payload
        const { description, _user, productCode } = metadata
        
        const checkoutId = payload.metadata?.checkoutId || 
                           payload.checkoutId ||
                           payload.checkout_id ||
                           payload.id
        
        if (!checkoutId) {
          return res.status(400).json({ error: 'Missing checkoutId' })
        }

        const payment = await Payment.findOne({ checkoutId })
              
        if (payment) {
          payment.status = 'succeeded'  
          payment.productCode = productCode
          payment.paymentId = payload.id
          payment._user = _user
          payment.updatedAt = new Date()
          payment.metadata = {
            ...payment.metadata,
            paymentMethodDetails: payload.paymentMethodDetails,
            mode: payload.mode,
            completedAt: payload.createdDate
          }
          await payment.save()

          // Determine number of cards based on product code
          let cardCount;
          console.log(`productCode:`, productCode);

          switch(productCode) {
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
                purchasedBy: _user,
                purchasedAt: new Date()
              }
            );
          }
        } else {
          console.warn(`Payment record not found for checkoutId: ${checkoutId}`)
        }
        break
      }

      case 'payment.failed': {
        const { payload } = event
        const checkoutId = payload.metadata?.checkoutId

        if (checkoutId) {
          const payment = await Payment.findOne({ checkoutId })
          
          if (payment) {
            payment.status = 'failed'
            payment.errorMessage = payload.failureReason || 'Payment failed'
            payment.updatedAt = new Date()
            await payment.save()
          }
        }
        break
      }

      default: {
        console.log(`Unhandled event type: ${event.type}`)
      }
    }

    // Send 200 status explicitly as mentioned in docs
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    // Still send 200 to prevent retries, but include error
    res.status(200).json({ received: true, error: error.message });
  }
})

router.post('/fetch-purchase-history', requireAuth, async (req, res) => {
  const { ownerId } = req.body
  const payments = await Payment.find({ _user: ownerId })
  console.log(`payments:`, payments)
  res.json(payments)
})

module.exports = router


// curl --location --request POST 'https://payments.yoco.com/api/webhooks' \
// --header 'Content-Type: application/json' \
// --header 'Authorization: Bearer sk_test_36d1b424Q4LLBGB5464497f89b88' \
// --data-raw '{
//   "name": "payment-webhook",
//   "url": "https://f627-41-150-34-61.ngrok-free.app/payment/webhook"
// }'