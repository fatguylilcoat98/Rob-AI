import React from 'react'
import './CognitivePulse.css'

const CognitivePulse = ({ events }) => {
  return (
    <div className="pulse-events">
      {events.map((event, index) => (
        <div
          key={index}
          className={`pulse-event ${index < 2 ? 'active' : ''} ${index < 3 ? 'processing' : ''}`}
        >
          {event}
        </div>
      ))}
    </div>
  )
}

export default CognitivePulse