/**
 * Step modules index - re-exports all step functions
 */

// Utilities
const utils = require('./utils');

// Step modules
const { performLogin, handleOTP } = require('./login');
const { dropEnrolledCourses } = require('./dropCourses');
const { solveCaptcha, solveGeminiCaptcha } = require('./captcha');
const { handlePaymentFlow } = require('./payment');
const { solveAntiBotModules } = require('./antiBotModules');
const { startDropout, selectDropoutReason, getAuthToken, completeFinalDropout } = require('./dropout');

module.exports = {
    // Utils
    ...utils,

    // Login
    performLogin,
    handleOTP,

    // Courses
    dropEnrolledCourses,

    // CAPTCHA
    solveCaptcha,
    solveGeminiCaptcha,

    // Payment
    handlePaymentFlow,

    // Anti-bot
    solveAntiBotModules,

    // Dropout
    startDropout,
    selectDropoutReason,
    getAuthToken,
    completeFinalDropout
};
