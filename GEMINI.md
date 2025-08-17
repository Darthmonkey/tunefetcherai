# Gemini CLI Session Context

This file is used to maintain context across sessions with the Gemini CLI agent. Please update it as we progress through tasks.

## Proposed Changes:

### Major Upgrade Plan: Multi-Album Download & Improved Download Management UI

**1. Backend Modifications (`server.js`):**
    *   **New API Endpoint:** Create `POST /api/download/albums` to accept an array of album IDs.
    *   **Batch Download Logic:** Modify existing download logic to iterate through multiple albums, fetch tracks, and initiate downloads for all.
    *   **Single Archive Creation:** Utilize `archiver` to zip all downloaded tracks from selected albums into one file.
    *   **Enhanced Status Tracking:** Implement a more sophisticated server-side state management for multi-album downloads, providing overall and individual track/album progress.
    *   **Long-Running Operations:** Address potential timeouts and long-running operations for large downloads.

**2. Frontend Modifications (`src/App.tsx` and components):**
    *   **Album Selection UI:** Add checkboxes or similar controls for selecting multiple albums from search results or a dedicated view.
    *   **"Download Selected Albums" Button:** Implement a button to trigger the new `POST /api/download/albums` endpoint.
    *   **Download Progress UI:**
        *   Display a clear overall progress bar for multi-album downloads.
        *   Show individual progress for each album.
        *   Optionally, show progress for each track within an album.
        *   Provide informative status messages (e.g., "Downloading Album X - Track Y", "Zipping files...").
    *   **Error Handling:** Display user-friendly error messages for multi-album download failures.

**3. Refactoring and Testing:**
    *   Refactor existing download logic for reusability across single and multi-album downloads.
    *   Outline where unit/integration tests would be added for new backend APIs and frontend components.

## In Progress:

*   [List tasks currently being worked on here]

## Completed Actions:

*   Implemented Multi-Album Download and Improved Download Management UI.
*   Improved YouTube search reliability using `yt-dlp`.
*   Fixed `MAX_RELEASES_TO_FETCH` definition.
*   Fixed `undefined` artist name in YouTube search queries.
*   Corrected the download naming convention for artists and albums.
*   Added and verified the 'Refresh' button functionality for MusicBrainz track re-discovery.
*   Disabled track selection checkbox for tracks without a YouTube URL.
*   Hardened web security by adding Helmet and Express-Rate-Limit middleware to `server.js`.
*   Prepared for migration to Raspberry Pi hosting (yt-dlp compatibility, Node.js, resource optimization, environment variables).
*   Created `start-tunefetcher-pi.sh` for Raspberry Pi deployment.
*   Implemented conditional rate limiting bypass for testing in `server.js` and added a development mode indicator in the frontend.
*   Renamed `start-app.ps1` to `start-tunefetcher-win.ps1`.
*   Updated album track description for clarity and ensured all related notes are correctly bullet-pointed.
*   Implemented one-click track discovery and URL generation.
*   Added a "Download All" button with default selection.
*   Completed thorough testing of the "Manual YouTube URLs" button.
*   Allowed users to edit the file name before downloading.
*   Allowed users to choose the output folder for the downloaded file.

## Key Decisions/Notes:

*   [Add any important decisions or notes here]

## Potential Future Updates:

*   [Add ideas for future updates here, but do not implement unless expressly instructed]

*   Allow selection of multiple albums to download all their tracks into a single .zip file.
