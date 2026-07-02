import React from 'react'
import './MemoryCard.css'

const MemoryCard = ({ date, type, reference, warning, content }) => {
  const shortRef = reference && reference.length > 16 ? reference.slice(0, 14) + '…' : reference
  return (
    <div className="memory-card">
      <div className="card-header">
        <span>Memory</span>
        {shortRef && <span className="card-ref">{shortRef}</span>}
      </div>
      {content && (
        <div className="card-content">{content}</div>
      )}
      <div className="card-metadata">
        {date && <>Recorded: {date}<br /></>}
        Type: {type}
      </div>
      {warning && (
        <div className="warning-flag">
          ⚠ {warning}
        </div>
      )}
    </div>
  )
}

export default MemoryCard