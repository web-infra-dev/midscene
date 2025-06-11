# Recorder Form

A user registration form application based on React + Ant Design, integrated with rrweb recording functionality.

## Features

### Form Features
- ✅ Username input (required, minimum 3 characters)
- ✅ Password input (required, minimum 6 characters)
- ✅ Confirm password (required, must match password)
- ✅ Email address (required, email format validation)
- ✅ Phone number (optional, Chinese phone number format validation)
- ✅ Gender selection (dropdown: Male/Female/Other)
- ✅ Date of birth (date picker)
- ✅ Address input (text area, maximum 200 characters)
- ✅ User agreement consent (required checkbox)

### Recording Features
- ✅ Integrated rrweb user operation recording
- ✅ Real-time display of recorded event count
- ✅ Event conversion and processing
- ✅ Support for click, scroll, and input event recording

### UI/UX Features
- ✅ Modern gradient background design
- ✅ Responsive layout, mobile-friendly
- ✅ Ant Design component library, beautiful and user-friendly
- ✅ Form validation and error prompts
- ✅ Successful submission feedback

## Tech Stack

- **React 19** - Frontend framework
- **TypeScript** - Type safety
- **Ant Design 5** - UI component library
- **rrweb** - User behavior recording
- **Rsbuild** - Build tool

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview build results
npm run preview
```

## Project Structure

```
src/
├── App.tsx          # Main application component
├── App.css          # Style file
├── types.d.ts       # TypeScript type declarations
├── index.tsx        # Application entry point
└── env.d.ts         # Environment type declarations
```

## Usage Instructions

1. Recording of user operations starts automatically when the application opens
2. Fill in the form information, all required fields must be completed
3. Password must be at least 6 characters, confirm password must match the password
4. Email must be in valid email format
5. Phone number, if provided, must be in valid Chinese phone number format
6. User agreement must be accepted to submit
7. After successful submission, form data and recorded events will be output to the console

## Recording Events Description

The application records the following types of user operations:
- Page navigation events
- Mouse click events
- Page scroll events
- Form input events

Recorded events are converted to a standard format, containing event type, coordinates, values, timestamps, and other information.
