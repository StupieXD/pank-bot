# pank-bot
Custom Discord bot for Stuniverse


## Server configuration

Pank now stores per-server feature configuration in SQLite. Members with **Manage Server** can use:

- `/config view`
- `/config set-role`
- `/config set-channel`
- `/config set-category`
- `/config set-user`
- `/config reset`

The initial settings prepare Pank for the Anonymous Q&A and Ticket systems, including the moderator role, active and closed ticket categories, ticket log channel, Q&A recipient and identity-override role.

## Interaction infrastructure

Reusable button and modal handlers can be registered by custom-ID prefix through `interactionRouterService.js`. Expiring, user-bound confirmation buttons are available through `confirmationService.js`.
