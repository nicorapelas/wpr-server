const express = require('express')
const router = express.Router()
const crypto = require('crypto')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = keys.payfast.merchantId
const PAYFAST_MERCHANT_KEY = keys.payfast.merchantKey

const FRONTEND_URL = 'https://www.watchlistpro.site/'
const BACKEND_URL = 'https://coups-1889de9f2619.herokuapp.com'

// Add helper function for signature
function generateSignature(data, passPhrase = null) {
  // Create parameter string
  let pfOutput = Object.keys(data)
    .filter((key) => key !== 'signature')
    .sort()
    .map(
      (key) => `${key}=${encodeURIComponent(data[key]).replace(/%20/g, '+')}`
    )
    .join('&')

  // Add passphrase if it exists
  if (passPhrase !== null) {
    pfOutput = `${pfOutput}&passphrase=${encodeURIComponent(passPhrase)}`
  }

  return crypto.createHash('md5').update(pfOutput).digest('hex')
}

router.post('/create-payment', requireAuth, async (req, res) => {
  console.log('PayFast Credentials:', {
    merchantId: PAYFAST_MERCHANT_ID,
    merchantKey: PAYFAST_MERCHANT_KEY,
  })

  console.log(req.body)
  const { amountInCents, currency, productCode } = req.body
  try {
    // Validate required fields
    if (!amountInCents || !currency || !productCode) {
      console.error('Missing required fields:', {
        amountInCents,
        currency,
        productCode,
      })
      return res.status(400).json({
        message: 'Missing required fields',
      })
    }
    const payfastModifiedAmount = (amountInCents / 100).toFixed(2)

    // Fix URLs by removing extra slashes
    const cancelUrl = `${FRONTEND_URL}payment-cancelled`.replace(
      /([^:]\/)\/+/g,
      '$1'
    )
    const returnUrl = `${FRONTEND_URL}payment-success`.replace(
      /([^:]\/)\/+/g,
      '$1'
    )
    const notifyUrl = `${BACKEND_URL}/payment/webhook`.replace(
      /([^:]\/)\/+/g,
      '$1'
    )

    const paymentData = {
      // Merchant details
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,

      // Buyer details
      name_first: req.user.firstName || 'Unknown',
      name_last: req.user.lastName || 'Unknown',
      email_address: 'jacobscycles@gmail.com',

      // Transaction details
      m_payment_id: Date.now().toString(),
      amount: payfastModifiedAmount,
      item_name: 'Watchlist Pro Subscription',
      item_description: `Purchase of ${productCode}`,
      custom_str1: productCode,
      custom_str2: req.user._id?.toString() || 'unknown',
      custom_str3: currency,

      // Payment options
      payment_method: 'cc',
      subscription_type: '1', // Non-recurring payment
    }

    // Generate signature
    paymentData.signature = generateSignature(paymentData)

    console.log('Payment Data:', paymentData)

    // Create payment record
    await Payment.findOneAndUpdate(
      {
        _user: req.user,
        status: 'created',
        productCode: productCode,
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      {
        $set: {
          orderId: paymentData.m_payment_id,
          amount: amountInCents,
          currency: currency,
          metadata: paymentData,
        },
      },
      { new: true, upsert: true }
    )
    res.json({
      redirectUrl: 'https://www.payfast.co.za/eng/process',
      paymentData,
    })
  } catch (error) {
    console.error('Payfast Error:', error.response?.data || error.message)
    res.status(500).json({
      message: error.response?.data?.message || 'Payment failed',
    })
  }
})

// Add body-parser raw configuration for webhook
router.use('/webhook', express.raw({ type: 'application/json' }))

router.post('/webhook', async (req, res) => {
  try {
    // Parse the raw body
    const pfData =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    // Verify payment data
    if (!pfData.payment_status || !pfData.m_payment_id) {
      return res.status(400).json({ error: 'Invalid webhook data structure' })
    }

    switch (pfData.payment_status) {
      case 'COMPLETE': {
        // Find the payment using m_payment_id
        const payment = await Payment.findOne({ orderId: pfData.m_payment_id })

        if (payment) {
          payment.status = 'succeeded'
          payment.paymentId = pfData.pf_payment_id
          payment.updatedAt = new Date()
          payment.metadata = {
            ...payment.metadata,
            paymentMethodDetails: {
              type: pfData.payment_method,
              last4: pfData.card_last_four || null,
            },
            completedAt: new Date(),
          }
          await payment.save()

          // Determine number of cards based on product code
          let cardCount

          switch (payment.productCode) {
            case 'WP002':
              cardCount = 5
              break
            case 'WP003':
              cardCount = 10
              break
            default: // WP001 and any other cases
              cardCount = 1
          }

          // Find and update multiple cards
          const cards = await Card.find({ status: { $ne: 'sold' } })
            .limit(cardCount)
            .exec()

          if (cards.length < cardCount) {
            console.warn(
              `Insufficient cards available. Requested: ${cardCount}, Found: ${cards.length}`
            )
          }
          // Update only the specific cards found
          if (cards.length > 0) {
            const cardIds = cards.map((card) => card._id)
            await Card.updateMany(
              { _id: { $in: cardIds } },
              {
                status: 'sold',
                purchasedBy: payment._user,
                purchasedAt: new Date(),
              }
            )
          }
        } else {
          console.warn(
            `Payment record not found for order ID: ${pfData.m_payment_id}`
          )
        }
        break
      }
      case 'FAILED':
      case 'CANCELLED': {
        const payment = await Payment.findOne({ orderId: pfData.m_payment_id })

        if (payment) {
          payment.status = 'failed'
          payment.errorMessage = pfData.reason || 'Payment failed'
          payment.updatedAt = new Date()
          await payment.save()
        }
        break
      }
      default: {
        console.log(`Unhandled payment status: ${pfData.payment_status}`)
      }
    }

    // Always return 200 for webhooks
    res.status(200).json({ received: true })
  } catch (error) {
    // Still return 200 to acknowledge receipt
    res.status(200).json({ received: true, error: error.message })
  }
})

// Add the fetch purchase history endpoint
router.post('/fetch-purchase-history', requireAuth, async (req, res) => {
  const { ownerId } = req.body
  const payments = await Payment.find({ _user: ownerId })
  res.json(payments)
})

module.exports = router
