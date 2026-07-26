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

## v2.4.1 - Kick and Ban Moderation

- Added `/kick` with hierarchy checks, optional DM and automatic cases.
- Added `/ban` with permanent and temporary bans, optional DM and message deletion.
- Added `/unban`, which updates the latest active ban case rather than creating another case.
- Added `/softban` to clear recent messages while allowing the member to rejoin.
- Added persistent temporary-ban expiry processing on bot startup and every minute.
- Added case viewer support through the existing kick, ban, temporary-ban and softban case styles.

### Fixed

- Replaced corrupted response characters with ASCII-safe `Error:` and `Success:` labels.
- Confirmed `/untimeout` updates the existing timeout case instead of creating a new case.
