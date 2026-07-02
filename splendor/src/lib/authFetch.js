/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

import { supabase } from './supabaseClient'

class AuthenticationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/**
 * Auth-aware fetch wrapper that automatically handles Supabase JWT tokens
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Response>} - Fetch response
 */
async function authFetch(url, options = {}) {
  // Get current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new AuthenticationError('Not authenticated. Please sign in to continue.')
  }

  // Prepare headers
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${session.access_token}`
  }

  // Only add Content-Type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }

  // Make the request
  const fetchOptions = {
    ...options,
    headers
  }

  let response = await fetch(url, fetchOptions)

  // Handle 401 - attempt token refresh and retry once
  if (response.status === 401) {
    console.log('[AUTH] 401 received, attempting token refresh...')

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

    if (refreshError || !refreshData.session) {
      throw new AuthenticationError('Session expired and refresh failed. Please sign in again.')
    }

    // Retry with new token
    fetchOptions.headers['Authorization'] = `Bearer ${refreshData.session.access_token}`
    response = await fetch(url, fetchOptions)

    // Still 401 after refresh? Give up.
    if (response.status === 401) {
      throw new AuthenticationError('Authentication failed after token refresh. Please sign in again.')
    }
  }

  // Handle 403 - authorization error, don't retry
  if (response.status === 403) {
    throw new AuthorizationError('Access denied. You do not have permission for this action.')
  }

  return response
}

export { authFetch, AuthenticationError, AuthorizationError }