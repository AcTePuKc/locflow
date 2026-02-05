# Changelog

All notable changes to the **LocFlow** extension will be documented in this file.

## [0.1.0] - Initial Release

- **Smart Tag Profiles**: Toggle between `Raw` and `Normalized` tag sets via status bar or shortcut.
- **Smart Wrapping**: Automatically wraps selected text with color tags and appends a reset tag.
- **Performance Optimization**: Implemented debouncing (300ms) and optimized logic for large TSV files (up to 65k+ lines).
- **Visual Highlighting**:
  - Formatting tags highlighted in blue.
  - Game variables/placeholders highlighted in orange with underlines.
- **Visible Character Counter**: Real-time counter in the status bar that ignores tags to show actual string length.
- **Context Menu Integration**: Added an organized sub-menu for quick color insertion.
- **Hover Support**: Added tooltips explaining tags when hovering over them.
