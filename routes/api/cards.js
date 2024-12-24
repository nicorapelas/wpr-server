const express = require('express')
const mongoose = require('mongoose')
const Card = mongoose.model('Card')
const User = mongoose.model('User')
const keys = require('../../config/keys').keys
const requireAuth = require('../../middlewares/requireAuth')
const router = express.Router()

// Get all cards
router.get('/', requireAuth, async (req, res) => {
  try {
    const cards = await Card.find();
    res.json(cards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get available cards
router.get('/available', requireAuth, async (req, res) => {
  try {
    const cards = await Card.findAvailable();
    res.json(cards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark card as used
router.post('/:cardId/use', requireAuth, async (req, res) => {
  try {
    const card = await Card.findById(req.params.cardId);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }
    
    await card.markAsUsed(req.user._id); // Assuming you have user auth
    res.json(card);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new card
router.post('/', requireAuth, async (req, res) => {
  try {
    const card = new Card(req.body);
    const newCard = await card.save();
    res.status(201).json(newCard);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
  
router.post('/batch', async (req, res) => {
  try {
    const { cards } = req.body
    
    // Basic validation
    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'Invalid batch data' })
    }

    // Check for required fields in each card
    const invalidCards = cards.filter(card => 
      !card.product || !card.cardNo || !card.password || !card.batchId
    )
    
    if (invalidCards.length > 0) {
      return res.status(400).json({ 
        error: 'Some cards are missing required fields',
        invalidCards: invalidCards.map(card => card.cardNo)
      })
    }

    // Check for existing cards in the database
    const existingCards = await Card.find({
      cardNo: { $in: cards.map(card => card.cardNo) }
    })

    if (existingCards.length > 0) {
      return res.status(400).json({ 
        error: 'Some cards already exist in the database',
        duplicates: existingCards.map(card => card.cardNo)
      })
    }

    // Create all cards in the batch
    const createdCards = await Card.insertMany(cards)
    
    res.status(201).json(createdCards)
  } catch (error) {
    console.error('Batch creation error:', error)
    res.status(500).json({ error: 'Failed to create card batch' })
  }
})

router.get('/fetch-user-cards', requireAuth, async (req, res) => {
  const cards = await Card.find({ purchasedBy: req.user._id })
  res.json(cards)
})

// Admin route
router.post('/fetch-card-owner', async (req, res) => {
  const { ownerId } = req.body
  console.log(req.body)
  
  const owner = await User.findById({ _id: ownerId })
  console.log(`owner:`, owner)
  
  res.json(owner)
})

module.exports = router;

