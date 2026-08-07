# v2.6.3 - Ticket Button Compatibility Fix

- Removed Unicode emoji payloads from ticket action buttons.
- Fixed Discord `COMPONENT_INVALID_EMOJI` errors when creating ticket channels.
- Fixed the pinned public ticket panel failing to post.
- Retained clear text labels for Open a Ticket and Close Ticket controls.

# Pank v2.6.2 - Ticket Command Privacy and Public Panel

## Added
- Added the hidden staff-only `/ticketadmin` command group.
- Added `/ticketadmin setup` to create or repair all ticket infrastructure.
- Added `/ticketadmin panel` to create or refresh a pinned public ticket panel.
- Added a public `open-a-ticket` channel with a pinned Open a Ticket button.
- Added a Close Ticket button for ticket creators.

## Changed
- Community members now only see `/ticket open`.
- Moved close, reopen, claim, rename, transcript, audit, delete, reset and case-linking tools to `/ticketadmin`.
- Ticket creation now validates configuration and permissions before creating channels.
- Failed ticket creation now removes partially created channels and returns a clearer error.
- `/config setup-tickets` now creates the public ticket panel and Ticket Staff category as well.

## v2.5.1 - Q&A stability and quiet webhook startup

### Fixed
- Prevented duplicate handling of the same button or modal interaction.
- Made Anonymous Q&A modal acknowledgement safe when an interaction is already deferred.
- Confirmed Q&A reset uses explicit SQLite transactions supported by DatabaseSync.
- Silently skips webhook cache channels that return Missing Permissions.
- Removed repeated webhook permission summaries from startup output.


## v2.5.0 - Anonymous Q&A finalisation

- Added a clear privacy notice to the `/question` form.
- Clarified that questions are never posted publicly and remain anonymous unless the system is abused or a safeguarding concern requires an authorised identity reveal.
- Added a small abuse-tracking notice at the bottom of the form.
- Prevented webhook-cache API calls in channels where Pank does not have Manage Webhooks.
- Prevented duplicate webhook-cache initialisation within the same process.


## Anonymous Q&A administration fixes

- Replaced corrupted Unicode separators in `/qa list` and `/qa audit` with ASCII-safe formatting.
- Kept `/qa list` ordered newest-first.
- Added `/qa delete` for permanently deleting one question and its audit history.
- Added owner-only `/qa reset` for clearing all Q&A records and resetting numbering when safe.
- Clarified that archiving preserves a question and does not reset numbering.

# Changelog

## v2.5.0 Ã¢ÂÂ Anonymous Q&A and Emergency Lockdown

### Added
- Complete Anonymous Q&A submission and administration workflow.
- `/question` modal with five-minute per-user cooldown.
- `/qa list`, `/qa view`, `/qa answer`, `/qa archive`, `/qa reveal`, `/qa audit`, and `/qa export`.
- SQLite-backed anonymous question records and immutable audit events.
- Safeguarding identity reveal restricted to administrators or the configured override role.
- `/lockdown enable`, `/lockdown disable`, and `/lockdown status`.
- Exact per-channel permission snapshots and restoration after lockdown.
- Automatic suspension of Anonymous Q&A while lockdown is active.
- Optional emergency announcement channel configuration.
- `/config setup-tickets` to create and configure `Tickets`, `Closed Tickets`, and `ticket-logs`.
- Automatic private category permissions for moderators and Pank.

### Changed
- Package version increased to 2.5.0.
- Ticket categories are positioned at the top of the channel list where Discord permits.

## Moderator Notes and Unified History

### Added

- `/note` for private moderator notes.
- `/notes` with paginated note history.
- `/history` with a unified paginated moderation timeline.
- `/deletecase` for permanently deleting one case and linked edit history.
- `/resetcases` as an owner-only development reset that restarts case numbering at Case #1.

### Behaviour

- Notes use the existing moderation case system.
- Deleting a warning case also removes that warning because the warning is stored as the case itself.
- Linked reason-edit records are deleted automatically through database cascade rules.
- Deleting or resetting records does not reverse active Discord timeouts or bans.

# Changelog

## v2.4.0 - Timeout Moderation

### Added

- `/timeout` command with duration parsing and role hierarchy checks
- `/untimeout` command for removing active timeouts
- Automatic moderation cases for Pank-issued timeouts
- Timeout expiry storage and case removal tracking
- Duration utility supporting seconds, minutes, hours, days and weeks

## v2.0.0 - Foundation

### Planned

- Modular project structure
- Event loader
- Configuration validation
- Logger
- Message cache
- Bulk purge logging
- GitHub to VPS deployment plan
- Documentation

## Development milestone - Kick and Ban Moderation

- Added `/kick` with hierarchy checks, optional DM and automatic cases.
- Added `/ban` with permanent and temporary bans, optional DM and message deletion.
- Added `/unban`, which updates the latest active ban case rather than creating another case.
- Added `/softban` to clear recent messages while allowing the member to rejoin.
- Added persistent temporary-ban expiry processing on bot startup and every minute.
- Added case viewer support through the existing kick, ban, temporary-ban and softban case styles.

### Fixed

- Replaced corrupted response characters with ASCII-safe `Error:` and `Success:` labels.
- Confirmed `/untimeout` updates the existing timeout case instead of creating a new case.

## v2.4.0 - Channel Moderation

### Added

- `/lock` with persistent storage of the previous `@everyone` send-message permissions.
- `/unlock` with exact restoration of inherited, allowed or denied permission states.
- `/slowmode` with support for seconds, minutes, hours and disabling slowmode.
- `/clearreactions` for removing all reactions from a selected message.
- SQLite-backed `channel_locks` storage so locks survive bot restarts.

### Behaviour

- Channel lock and slowmode changes use the existing channel update logger.
- Commands include moderator and bot permission checks.
- Unlock only operates when Pank has a saved lock state for that channel.

## v2.4.1 - Infrastructure and Configuration

### Added

- SQLite-backed per-server configuration storage.
- `/config view` for viewing Pank's server settings.
- `/config set-role`, `/config set-channel`, `/config set-category` and `/config set-user`.
- `/config reset` for clearing individual settings.
- Shared permission-check helpers for server, member and bot permissions.
- Central button and modal interaction routing by custom-ID prefix.
- Reusable expiring confirmation buttons with user ownership checks.
- Shared ephemeral response helpers.

### Improved

- Added modal submission handling to the central interaction event.
- Preserved compatibility with existing command-level button handlers.
- Replaced repeated webhook permission stack traces with one concise startup warning.
- Added clearer startup progress and completion logging.

### Infrastructure prepared for

- Anonymous Q&A recipient and identity-override configuration.
- Moderator role configuration.
- Active and closed ticket category configuration.
- Ticket transcript/log channel configuration.

### Q&A verification fixes

- Reformatted the Q&A command files for readable review and maintenance.
- Prevented the normal Q&A audit view from exposing the submitter identity.
- Recorded submissions as Pank system actions instead of user-attributed audit entries.
- Added explicit DM delivery success and failure handling.
- Added clear responses when a question is already answered or cannot be archived.
- Corrected the stale duplicate configuration import used by the source-tree verifier.

## v2.5.0 Q&A reset reliability fixes

- Replaced in-memory-style reset behaviour with self-contained Q&A button actions.
- Deferred destructive button responses before database work.
- Added guild-local Anonymous Q&A numbering.
- Resetting one server now always makes its next question #1.
- Deleting the final remaining question also resets that server's numbering to #1.
- Added explicit transaction handling compatible with Node's built-in SQLite API.

## v2.5.2 - Anonymous Q&A status fixes

- Fixed `/qa answer` audit recording by using the internal submission ID.
- Added `/qa skip` with an optional reason.
- Added the `skipped` filter to Q&A list and export commands.
- Added skipped status details to `/qa view`.


## v2.5.3 - Anonymous Q&A data integrity fixes

- Rebuilt the Anonymous Q&A audit table with a verified foreign-key relationship.
- Preserved valid existing audit records and removed orphaned audit rows during migration.
- Made answer, skip and archive status updates atomic with their audit records.
- Added parent-record validation before standalone audit inserts.
- Improved Q&A audit lookups so guild and submission records must match.
- Prevented partial status updates when audit creation fails.

## v2.6.0 - Anonymous Ticket System and Edit Log Accuracy

### Added
- Linked user-facing and staff-only ticket channels.
- `/ticket open`, close, reopen, claim, rename, transcript and audit.
- Automatic anonymous forwarding of moderator messages through Pank.
- Automatic mirroring of user messages into the staff workspace.
- Private moderator attribution and internal ticket transcripts.
- Lockdown-aware ticket creation.

### Changed
- Ticket infrastructure now creates a dedicated Ticket Staff category.
- Message edit logs now show only genuinely added and removed text.
- Discord Markdown is escaped in edit diffs so headings and mentions cannot alter the log layout.


## v2.6.1 - Ticket Administration and Case Linking

### Added
- `/ticket delete` with confirmation and linked-channel cleanup.
- Owner-only `/ticket reset`, which refuses while active tickets exist and resets numbering to #1.
- `/ticket link-case`, `/ticket unlink-case`, and `/ticket create-case`.
- `/caseticket link` and `/caseticket unlink` for linking from outside a ticket.
- Persistent many-to-many links between tickets and moderation cases.
- Linked ticket details in `/case` and linked case details in ticket audits and transcripts.

### Fixed
- Reopened staff channels now return to the Ticket Staff category rather than the user-facing Tickets category.
- Ticket category ordering now keeps Tickets and Ticket Staff above Closed Tickets.
- Ticket deletion and reset remove linked records safely through database foreign keys.
