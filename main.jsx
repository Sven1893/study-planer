import React from 'react'
import ReactDOM from 'react-dom/client'
import StudyPlaner from './study-planer.jsx' // Make sure the export name matches your file
import './style.scss'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <StudyPlaner />
    </React.StrictMode>,
)
