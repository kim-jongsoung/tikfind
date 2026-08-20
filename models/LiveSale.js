const mongoose = require('mongoose');

const liveSaleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  liveDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

liveSaleSchema.index({ userId: 1, liveDate: -1 });

const LiveSale = mongoose.model('LiveSale', liveSaleSchema);

module.exports = LiveSale;
