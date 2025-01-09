const express = require('express')
const router = express.Router()
const crypto = require('crypto')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = keys.payfast.merchantId
const PAYFAST_MERCHANT_KEY = keys.payfast.merchantKey
const PAYFAST_PASS_PHRASE = keys.payfast.passPhrase
const FRONTEND_URL = keys.payfast.frontendUrl
const BACKEND_URL = keys.payfast.backendUrl

// Add helper function for signature generation
function generateSignature(data, passPhrase = null) {
  // Remove signature if it exists
  delete data.signature

  // Sort keys alphabetically
  const ordered = {}
  Object.keys(data)
    .sort()
    .forEach((key) => {
      ordered[key] = data[key]
    })

  // Add passphrase if provided
  if (passPhrase !== null && passPhrase !== '') {
    ordered['passphrase'] = passPhrase
  }

  // Create parameter string
  const signString = Object.entries(ordered)
    .map(([key, value]) => {
      // Convert all values to strings and trim
      const stringValue = String(value).trim()
      return `${key}=${encodeURIComponent(stringValue)}`
    })
    .join('&')

  // Generate signature
  return crypto.createHash('md5').update(signString).digest('hex')
}

// Create payment route
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    console.log('PayFast Credentials:', {
      merchantId: PAYFAST_MERCHANT_ID,
      merchantKey: PAYFAST_MERCHANT_KEY,
      passPhrase: PAYFAST_PASS_PHRASE,
    })

    const { amountInCents, currency, productCode, description } = req.body
    console.log(req.body)

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
    const paymentData = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${FRONTEND_URL}/payment-success`,
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      notify_url: `${BACKEND_URL}/payment/webhook`,
      name_first: req.user.firstName || 'Unknown',
      name_last: req.user.lastName || 'Unknown',
      email_address: 'jacobscycles@gmail.com',
      m_payment_id: Date.now().toString(),
      amount: payfastModifiedAmount,
      item_name: 'WatchList Pro Subscription',
      item_description: description || 'WatchList Pro Subscription',
      custom_str1: productCode,
      custom_str2: req.user._id,
      custom_str3: currency,
      payment_method: 'cc',
    }

    console.log('Payment Data:', paymentData)

    // Generate signature
    const signature = generateSignature(paymentData, PAYFAST_PASS_PHRASE)
    console.log('Signature:', signature)
    paymentData.signature = signature

    try {
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
    } catch (dbError) {
      console.error('Database Error:', dbError)
      throw new Error('Failed to create payment record')
    }

    res.json({
      redirectUrl: 'https://www.payfast.co.za/eng/process',
      paymentData,
    })
  } catch (error) {
    console.error('Payfast Error Details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    })

    res.status(500).json({
      message: 'Payment initialization failed',
      error: error.message,
      details: error.response?.data,
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
