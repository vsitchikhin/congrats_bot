# 📋 Task: Skip Phone Number Request if Known

**User Story:** As a returning user, when I restart the bot, I want it to recognize me and skip asking for my phone number again so I can get to the main functionality faster.

## Requirements

1.  On any user interaction (especially `/start`), the bot must first check if the user's phone number is already stored in the database.
2.  **If the phone number exists:**
    *   The bot should NOT ask for the phone number.
    *   It should display the standard greeting.
    *   It should immediately transition to the state for requesting a child's name (and display the persistent button as per Task #005).
3.  **If the phone number does NOT exist:**
    *   The bot should follow the original flow: greet the user, then ask for their phone number.

## Complexity
🟡 SIMPLE
