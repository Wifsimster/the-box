// This file is deprecated - authentication routes are now handled by better-auth
//
// better-auth automatically provides the following endpoints at /api/auth/*:
//
// Authentication:
// - POST /api/auth/sign-up/email - Register with email
// - POST /api/auth/sign-up/username - Register with username (username plugin)
// - POST /api/auth/sign-in/email - Login with email
// - POST /api/auth/sign-in/username - Login with username (username plugin)
// - POST /api/auth/sign-in/anonymous - Guest login (anonymous plugin)
// - POST /api/auth/sign-out - Logout
//
// Session:
// - GET /api/auth/get-session - Get current session
//
// Password Reset:
// - POST /api/auth/forget-password - Request password reset
// - POST /api/auth/reset-password - Complete password reset
//
// Email Verification:
// - POST /api/auth/send-verification-email - Send verification email
// - GET /api/auth/verify-email - Verify email with token
//
// Admin (admin plugin):
// - GET /api/auth/admin/list-users - List all users
// - POST /api/auth/admin/create-user - Create user
// - PATCH /api/auth/admin/set-role - Set user role
// - POST /api/auth/admin/ban-user - Ban user
// - POST /api/auth/admin/unban-user - Unban user
//
// See better-auth documentation for full API reference:
// https://www.better-auth.com/docs/api-reference

import { Router } from 'express'

const router = Router()

// All auth routes are now handled by better-auth at /api/auth/*
// This router is kept for backwards compatibility but does nothing

router.all('*', (_req, res) => {
  res.status(410).json({
    success: false,
    error: {
      code: 'DEPRECATED',
      message: 'This auth endpoint is deprecated. Please use /api/auth/* endpoints provided by better-auth.',
    },
  })
})

export default router
