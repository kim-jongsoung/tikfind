const mongoose = require('mongoose');

const mallSetupSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  businessNumber: {
    type: String,
    trim: true
  },
  businessName: {
    type: String,
    trim: true
  },
  ownerName: {
    type: String,
    trim: true
  },
  contact: {
    type: String,
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  accountNumber: {
    type: String,
    trim: true
  },
  accountHolder: {
    type: String,
    trim: true
  },
  taxConsent: {
    type: Boolean,
    required: true,
    default: false
  }
}, {
  timestamps: true
});

mallSetupSchema.index({ userId: 1 });

const MallSetup = mongoose.model('MallSetup', mallSetupSchema);

module.exports = MallSetup;
