const mongoose = require('mongoose');

const messageTemplateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    content: {
        type: String,
        required: true,
        maxlength: 500
    },
    order: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

messageTemplateSchema.index({ userId: 1, order: 1 });

const MessageTemplate = mongoose.model('MessageTemplate', messageTemplateSchema);

module.exports = MessageTemplate;
