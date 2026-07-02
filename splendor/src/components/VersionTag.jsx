/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

import React from 'react'
import './VersionTag.css'

const VersionTag = () => {
  const version = process.env.SPLENDOR_VERSION || 'unknown'

  return (
    <div className="version-tag">
      v{version}
    </div>
  )
}

export default VersionTag