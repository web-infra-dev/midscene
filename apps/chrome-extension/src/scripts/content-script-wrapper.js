// Content Script Wrapper for Event Recording
// This script bridges the EventRecorder (injected via record-iife.js) with the Chrome Extension

// Check if EventRecorder is available (should be injected by record-iife.js)
if (typeof window.EventRecorder === 'undefined') {
    console.error('EventRecorder not found. Make sure record-iife.js is injected first.');
}

let recorder = null;
let events = [];

// Initialize recorder with callback to send events to extension
function initializeRecorder() {
    if (!window.EventRecorder) {
        console.error('EventRecorder class not available');
        return;
    }

    recorder = new window.EventRecorder((event) => {
        const optimizedEvent = recorder.optimizeEvent(event, events);
        // Add event to local array
        events = optimizedEvent;

        // Send events array to extension popup
        console.log('sending events to extension', events);
        chrome.runtime.sendMessage({
            action: 'events',
            data: events.map(event => ({
                type: event.type,
                timestamp: event.timestamp,
                x: event.x,
                y: event.y,
                value: event.value,
            }))
        }).catch(error => {
            // Silently handle errors (popup might not be open)
            console.debug('Failed to send event to extension:', error);
        });
    });
}

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ping') {
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'start') {
        if (!recorder) {
            initializeRecorder();
        }

        if (recorder) {
            recorder.start();
            events = []; // Clear previous events
            console.log('Event recording started');
            sendResponse({
                success: true
            });
        } else {
            console.error('Failed to initialize recorder');
            sendResponse({
                success: false,
                error: 'Failed to initialize recorder'
            });
        }
    } else if (message.action === 'stop') {
        // biome-ignore lint/complexity/useOptionalChain: <explanation>
        if (recorder && recorder.isActive()) {
            recorder.stop();
            recorder = null;
            console.log('Event recording stopped');
            sendResponse({
                success: true,
                eventsCount: events.length
            });
        } else {
            sendResponse({
                success: false,
                error: 'Recorder not active'
            });
        }
    } else if (message.action === 'getEvents') {
        sendResponse({
            events: events
        });
    } else if (message.action === 'clearEvents') {
        events = [];
        sendResponse({
            success: true
        });
    }

    return true; // Keep message channel open for async response
});

// Initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Content script wrapper loaded');
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    // biome-ignore lint/complexity/useOptionalChain: <explanation>
    if (recorder && recorder.isActive()) {
        recorder.stop();
    }
});