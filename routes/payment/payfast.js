const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const payfast = require('@payfast/core')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = '10036591'
const PAYFAST_MERCHANT_KEY = 'q9xcwypuj3aed'
const PAYFAST_PASS_PHRASE = 'happyChappy123'
const FRONTEND_URL = keys.payfast.frontendUrl
const BACKEND_URL = keys.payfast.backendUrl

// Define the field order at the top level so both functions can use it
const PAYFAST_FIELD_ORDER = [
  'merchant_id',
  'merchant_key',
  'return_url',
  'cancel_url',
  'notify_url',
  'name_first',
  'name_last',
  'email_address',
  'm_payment_id',
  'amount',
  'item_name',
  'item_description',
  'custom_str1',
]

// Add this debug function
function debugPaymentData(data, hideSignature = false) {
  // Create a copy to avoid modifying original data
  const debugData = { ...data }

  // Always hide sensitive data
  if (debugData.merchant_key) debugData.merchant_key = '***'
  if (debugData.passphrase) debugData.passphrase = '***'

  // Optionally hide signature
  if (hideSignature && debugData.signature) {
    delete debugData.signature
  }

  return debugData
}

function generateSignature(data, passPhrase) {
  const stringParts = [
    `merchant_id=${data.merchant_id}`,
    `merchant_key=${data.merchant_key}`,
    `return_url=${encodeURIComponent(data.return_url)}`,
    `cancel_url=${encodeURIComponent(data.cancel_url)}`,
    `notify_url=${encodeURIComponent(data.notify_url)}`,
    `name_first=${data.name_first}`,
    `name_last=${data.name_last}`,
    `email_address=${encodeURIComponent(data.email_address)}`,
    `m_payment_id=${data.m_payment_id}`,
    `amount=${data.amount}`,
    `item_name=${data.item_name}`,
    `item_description=${data.item_description}`,
    `custom_str1=${data.custom_str1}`,
  ]

  // Add passphrase without URL encoding
  if (passPhrase) {
    stringParts.push(`passphrase=${passPhrase}`)
  }

  const pfOutput = stringParts.join('&')
  stringParts.forEach((part) => console.log(part))
  const signature = crypto.createHash('md5').update(pfOutput).digest('hex')

  return signature
}

// Add this function to generate the query string
function generateQueryString(data) {
  const stringParts = PAYFAST_FIELD_ORDER.map(
    (field) => `${field}=${encodeURIComponent(data[field])}`
  )

  // Add passphrase with URL encoding if it exists
  if (data.passphrase) {
    stringParts.push(`passphrase=${encodeURIComponent(data.passphrase)}`)
  }

  return stringParts.join('&')
}

function generateUniquePaymentId() {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')
  return `${timestamp}${random}`
}

// Create payment route
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    const { amountInCents, currency, productCode } = req.body

    if (!amountInCents || !currency || !productCode) {
      return res.status(400).json({ message: 'Missing required fields' })
    }

    const payfastModifiedAmount = (amountInCents / 100).toFixed(2)

    const paymentData = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${FRONTEND_URL}/payment-success`,
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      notify_url: `${BACKEND_URL}/payment/webhook`,
      name_first: 'Test',
      name_last: 'User',
      email_address: 'faghmeea@payfast.io',
      m_payment_id: generateUniquePaymentId(),
      amount: payfastModifiedAmount,
      item_name: 'WatchList Pro',
      item_description: 'WatchList Pro Subscription',
      custom_str1: productCode,
      passphrase: PAYFAST_PASS_PHRASE,
    }

    // Generate signature
    const signature = generateSignature(paymentData, PAYFAST_PASS_PHRASE)

    paymentData.signature = signature
\
    // Create query string
    const queryString = generateQueryString(paymentData)

    try {
      await Payment.findOneAndUpdate(
        {
          _user: req.user._id,
          status: 'created',
          productCode,
          createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
        },
        {
          $set: {
            orderId: paymentData.m_payment_id,
            amount: amountInCents,
            currency,
            metadata: paymentData,
          },
        },
        { new: true, upsert: true }
      )
    } catch (dbError) {
      console.error('Database Error:', dbError)
      return res
        .status(500)
        .json({ message: 'Failed to create payment record' })
    }

    res.json({
      redirectUrl: 'https://sandbox.payfast.co.za/eng/process',
      paymentData,
    })
  } catch (error) {
    console.error('Payment Error:', error)
    res.status(500).json({
      message: 'Payment initialization failed',
      error: error.message,
    })
  }
})

// Configure body-parser for webhook
router.use('/webhook', express.raw({ type: 'application/json' }))

router.post('/webhook', async (req, res) => {
  try {
    const pfData =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    if (!pfData.payment_status || !pfData.m_payment_id) {
      return res.status(400).json({ error: 'Invalid webhook data structure' })
    }

    const payment = await Payment.findOne({ orderId: pfData.m_payment_id })

    switch (pfData.payment_status) {
      case 'COMPLETE':
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

          let cardCount = 1
          switch (payment.productCode) {
            case 'WP002':
              cardCount = 5
              break
            case 'WP003':
              cardCount = 10
              break
          }

          const cards = await Card.find({ status: { $ne: 'sold' } })
            .limit(cardCount)
            .exec()
          if (cards.length < cardCount) {
            console.warn(
              `Insufficient cards available. Requested: ${cardCount}, Found: ${cards.length}`
            )
          }
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

      case 'FAILED':
      case 'CANCELLED':
        if (payment) {
          payment.status = 'failed'
          payment.errorMessage = pfData.reason || 'Payment failed'
          payment.updatedAt = new Date()
          await payment.save()
        }
        break

      default:
        console.log(`Unhandled payment status: ${pfData.payment_status}`)
    }

    res.status(200).json({ received: true })
  } catch (error) {
    // Log error but still acknowledge receipt
    console.error('Webhook Error:', error)
    res.status(200).json({ received: true, error: error.message })
  }
})

// Fetch purchase history
router.post('/fetch-purchase-history', requireAuth, async (req, res) => {
  try {
    const { ownerId } = req.body
    const payments = await Payment.find({ _user: ownerId })
    res.json(payments)
  } catch (error) {
    console.error('Error fetching purchase history:', error)
    res.status(500).json({
      message: 'Failed to fetch purchase history',
      error: error.message,
    })
  }
})

module.exports = router
