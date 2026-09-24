# Diabetes Care Companion — Working Front-End Prototype

A front-end-only prototype built with **HTML, external CSS and JavaScript**. It uses **localStorage** and browser features; it does not require a database, backend, API key, email service or SMS provider.

## Working prototype features

- Patient and healthcare-provider demo roles
- Patient health tracking
- Calendar and reminders
- Browser notification permission
- Automatic reminder checking while the prototype is open
- Sound + on-screen reminder alert
- Test alert button for demonstrations
- Snooze reminder for 10 minutes
- Mark reminders complete
- Patient-created provider review alerts
- Simulated patient-to-provider authorization workflow
- Provider approval/decline of access requests
- Provider review dashboard
- Provider feedback to patient
- Progress report generation
- Print / Save as PDF through the browser
- Kenyan food education section
- LocalStorage persistence

## Demo provider authorization

Use provider code:

`DOC-1024`

To demonstrate the workflow:

1. Enter as a patient.
2. Open **Profile & Access**.
3. Choose **Request / manage access**.
4. Send the request using `DOC-1024`.
5. Sign out.
6. Enter as **Healthcare Provider**.
7. Approve the patient request.
8. Review the patient from the provider dashboard.
9. Return to the patient account to see the connection.

## Testing a reminder

For a presentation, click **Test alert** on Calendar & Reminders. The prototype triggers the same visual, sound and browser-notification behavior without waiting.

You can also create a reminder for a few minutes in the future. Keep the page open so the browser JavaScript timer can detect the due time.

## Important prototype limitation

This is intentionally **not** a production healthcare system. localStorage is not suitable for real medical records, and browser-only JavaScript cannot reliably send real email/SMS when the website is closed. Those capabilities would require a backend or external service, which is intentionally excluded from this prototype.

The prototype does not diagnose, prescribe or automatically make clinical decisions. Provider review and clinical judgment remain with the healthcare professional.
