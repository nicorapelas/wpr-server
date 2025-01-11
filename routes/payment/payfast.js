const express = require('express')
const router = express.Router()
const crypto = require('crypto')

const { keys } = require('../../config/keys')
const Payment = require('../../models/Payment')
const Card = require('../../models/Card')
const requireAuth = require('../../middlewares/requireAuth')

const PAYFAST_MERCHANT_ID = '10036574'
const PAYFAST_MERCHANT_KEY = 'jnpximwns54h1'
const PAYFAST_PASS_PHRASE = 'happychappy'
const FRONTEND_URL = keys.payfast.frontendUrl
const BACKEND_URL = keys.payfast.backendUrl
const PAYFAST_URL = 'https://sandbox.payfast.co.za/eng/process'

// Helper function for generating PayFast signature
function generateSignature(data, passPhrase = null) {
  // Remove signature if it exists
  const dataForSignature = { ...data }
  delete dataForSignature.signature

  // Sort keys alphabetically
  const sortedKeys = Object.keys(dataForSignature).sort()

  // Build parameter string
  const pfOutput = sortedKeys
    .map((key) => {
      if (dataForSignature[key] !== '') {
        return `${key}=${encodeURIComponent(
          dataForSignature[key].trim()
        ).replace(/%20/g, '+')}`
      }
      return ''
    })
    .filter((item) => item) // Remove empty strings
    .join('&')

  // Add passphrase if provided
  const getString =
    passPhrase !== null
      ? `${pfOutput}&passphrase=${encodeURIComponent(passPhrase.trim()).replace(
          /%20/g,
          '+'
        )}`
      : pfOutput

  console.log('Final signature string:', getString)
  const signature = crypto.createHash('md5').update(getString).digest('hex')
  console.log('Final generated signature:', signature)

  return signature
}

// Create payment route
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    const { amountInCents, currency, productCode, description } = req.body

    const payfastModifiedAmount = (amountInCents / 100).toFixed(2)
    const paymentData = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${FRONTEND_URL}/payment-success`,
      cancel_url: `${FRONTEND_URL}/payment-cancelled`,
      notify_url: `${BACKEND_URL}/payment/webhook`,
      name_first: 'Bob',
      name_last: 'Smith',
      email_address: 'testbuyer@example.com',
      m_payment_id: Date.now().toString(),
      amount: payfastModifiedAmount,
      item_name: 'Test Item 001',
      item_description: description || 'Purchase of WP001',
      custom_str1: productCode,
    }

    // Generate signature
    const signature = generateSignature(paymentData, PAYFAST_PASS_PHRASE)
    paymentData.signature = signature

    // Create form
    const formFields = Object.entries(paymentData)
      .map(
        ([key, value]) => `<input type="hidden" name="${key}" value="${value}">`
      )
      .join('\n')

    const htmlForm = `
      <form id="payfast-form" action="${PAYFAST_URL}" method="post">
        ${formFields}
      </form>
      <script>document.getElementById('payfast-form').submit();</script>
    `

    res.send(htmlForm)
  } catch (error) {
    console.error('Payment error:', error)
    res.status(500).json({ error: error.message })
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
