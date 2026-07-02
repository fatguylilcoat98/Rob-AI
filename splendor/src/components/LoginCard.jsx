/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import './LoginCard.css'

const LoginCard = ({ onAuthStateChange }) => {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('') // 'success', 'error', or ''

  const showMessage = (text, type = 'error') => {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => {
      setMessage('')
      setMessageType('')
    }, 5000)
  }

  const handleSignIn = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      showMessage('Email and password are required')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (error) {
        showMessage(error.message)
      } else {
        showMessage('Successfully signed in!', 'success')
        onAuthStateChange?.(data.session)
      }
    } catch (error) {
      showMessage('Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (!email || !password || !confirmPassword) {
      showMessage('All fields are required')
      return
    }

    if (password !== confirmPassword) {
      showMessage('Passwords do not match')
      return
    }

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password
      })

      if (error) {
        showMessage(error.message)
      } else {
        if (data.user && !data.session) {
          showMessage('Check your email for a confirmation link!', 'success')
        } else {
          showMessage('Account created successfully!', 'success')
          onAuthStateChange?.(data.session)
        }
      }
    } catch (error) {
      showMessage('Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      showMessage('Enter your email address first')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin
      })

      if (error) {
        showMessage(error.message)
      } else {
        showMessage('Password reset email sent!', 'success')
      }
    } catch (error) {
      showMessage('Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    setMessage('')
    setMessageType('')
    setConfirmPassword('')
  }

  return (
    <div className="login-card">
      <div className="login-header">
        <div className="wordmark">SPLENDOR · THE REMARKABLE AI</div>
        <div className="section-label">AUTHENTICATE</div>
      </div>

      {message && (
        <div className={`auth-message ${messageType}`}>
          {message}
        </div>
      )}

      <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="auth-form">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
          disabled={loading}
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-input"
          disabled={loading}
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />

        {isSignUp && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="auth-input"
            disabled={loading}
            autoComplete="new-password"
          />
        )}

        <button
          type="submit"
          className="auth-button"
          disabled={loading}
        >
          {loading ? 'PROCESSING...' : (isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN')}
        </button>
      </form>

      <div className="auth-footer">
        <button
          type="button"
          onClick={toggleMode}
          className="auth-toggle"
          disabled={loading}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'First time here? Create an account'}
        </button>

        {!isSignUp && (
          <button
            type="button"
            onClick={handleForgotPassword}
            className="forgot-password"
            disabled={loading}
          >
            Forgot password?
          </button>
        )}
      </div>
    </div>
  )
}

export default LoginCard