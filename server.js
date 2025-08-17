import express from 'express';
import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { youtubeDl } from 'youtube-dl-exec';
import fs from 'fs';
import archiver from 'archiver';
import * as rimraf from 'rimraf';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import ffmpeg from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;

const app = express();

const USER_AGENT = 'TuneFetcherAI/1.0 ( https://github.com/Darthmonkey/tunefetcherai )';

const MAX_RELEASES_TO_FETCH = 10;

// Helper function to search YouTube for a track and return its URL
async function searchYouTubeForTrack(searchQuery) {
    console.log(`[Server] Searching YouTube for: ${searchQuery} using yt-dlp`);
    try {
        const result = await youtubeDl(`ytsearch:${searchQuery}`, {
            dumpSingleJson: true, // Dumps JSON for the first result
            noWarnings: true,
            callHome: false,
            noCheckCertificates: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            referer: 'https://www.youtube.com/',
        });

        if (result && result.webpage_url) {
            console.log(`[Server] Found YouTube URL for "${searchQuery}": ${result.webpage_url}`);
            return result.webpage_url;
        } else {
            console.warn(`[Server] No YouTube URL found for "${searchQuery}"`);
            return null;
        }
    } catch (error) {
        console.error(`[Server] Error searching YouTube for "${searchQuery}":`, error.message);
        return null;
    }
}

// Refactored and extracted downloadWithRetry function
async function downloadWithRetry(url, outputPath, trackName, trackId = null, retryCount = 0, maxRetries = 3, retryDelaySeconds = 5) {
    try {
        console.log(`[Server] Attempting download for ${trackName} (Attempt ${retryCount + 1}/${maxRetries})`);
        await youtubeDl(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: '0',
            output: outputPath,
            ffmpegLocation: ffmpeg,
        });
        console.log(`[Server] Successfully downloaded ${trackName}`);
        return { success: true, path: outputPath, trackName, trackId };
    } catch (error) {
        console.error(`[Server] Download failed for ${trackName}:`, error);
        if (retryCount < maxRetries - 1) {
            console.log(`[Server] Retrying in ${retryDelaySeconds} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryDelaySeconds * 1000));
            return await downloadWithRetry(url, outputPath, trackName, trackId, retryCount + 1, maxRetries, retryDelaySeconds);
        }
        return { success: false, trackName, trackId, error: error.message };
    }
}

// Helper function to fetch detailed release information
const fetchReleaseDetails = (releaseId) => {
    return new Promise((resolve, reject) => {
        const mbDetailsUrl = `https://musicbrainz.org/ws/2/release/${releaseId}?fmt=json&inc=recordings`;
        https.get(mbDetailsUrl, { headers: { 'User-Agent': USER_AGENT } }, (detailsRes) => {
            let detailsData = '';
            detailsRes.on('data', (chunk) => { detailsData += chunk; });
            detailsRes.on('end', () => {
                if (detailsRes.statusCode !== 200) {
                    return reject(new Error(`MusicBrainz details API returned status ${detailsRes.statusCode}`));
                }
                try {
                    const detailsMbData = JSON.parse(detailsData);
                    const allTracks = detailsMbData.media?.flatMap(mediaItem => Array.isArray(mediaItem.tracks) ? mediaItem.tracks : []) || [];
                    const tracks = allTracks.map((track) => ({
                        id: track.id,
                        name: track.title,
                        trackNumber: track.position ? parseInt(track.position) : undefined,
                        artist: track['artist-credit']?.[0]?.artist?.name,
                        duration: track.length ? Math.floor(track.length / 1000) : undefined,
                    }));
                    resolve({
                        id: detailsMbData.id,
                        title: detailsMbData.title,
                        'first-release-date': detailsMbData['first-release-date'],
                        artist: detailsMbData['artist-credit']?.[0]?.artist?.name,
                        tracks: tracks,
                        totalTracks: tracks.length,
                        disambiguation: detailsMbData.disambiguation,
                        format: detailsMbData.media?.[0]?.format, // Get format of the first medium
                    });
                } catch (parseError) {
                    reject(new Error(`Error parsing MusicBrainz details data: ${parseError.message}`));
                }
            });
        }).on('error', (e) => {
            reject(new Error(`Error fetching MusicBrainz details: ${e.message}`));
        });
    });
};

// Helper function to fetch album tracks by release group ID
const fetchAlbumTracks = async (releaseGroupId) => {
    const releaseGroupUrl = `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}?fmt=json&inc=releases`;
    console.log(`[Server] Fetching release group details: ${releaseGroupUrl}`);

    const releaseGroupResponse = await new Promise((resolve, reject) => {
        https.get(releaseGroupUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`MusicBrainz release group API returned status ${res.statusCode}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Error parsing release group data: ${e.message}`));
                }
            });
        }).on('error', (e) => {
            reject(new Error(`Error fetching release group: ${e.message}`));
        });
    });

    if (!releaseGroupResponse.releases || releaseGroupResponse.releases.length === 0) {
        throw new Error(`No releases found for release group ${releaseGroupId}`);
    }

    // Try to find a suitable release (e.g., a digital album, or the first one available)
    const suitableRelease = releaseGroupResponse.releases.find(r => r.media && r.media.some(m => m.format === 'Digital Media')) || releaseGroupResponse.releases[0];

    if (!suitableRelease) {
        throw new Error(`No suitable release found for release group ${releaseGroupId}`);
    }

    console.log(`[Server] Found suitable release ${suitableRelease.id} for release group ${releaseGroupId}`);
    return await fetchReleaseDetails(suitableRelease.id);
};

// Apply security middleware
app.use(helmet());

// Basic rate limiting to prevent abuse
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again after 15 minutes"
});

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));


// Apply to all requests, unless DISABLE_RATE_LIMIT environment variable is set to 'true'
if (process.env.VITE_DISABLE_RATE_LIMIT !== 'true') {
    app.use(apiLimiter);
} else {
    console.log('Rate limiting is DISABLED for testing purposes.');
}

app.use(express.json());

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle all other requests by serving the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// YouTube search API
app.get('/api/search', async (req, res) => {
    const searchQuery = req.query.q;
    if (!searchQuery) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        const videoUrl = await searchYouTubeForTrack(searchQuery);
        if (videoUrl) {
            res.json({ url: videoUrl });
            console.log(`[Server] Responded with video URL: ${videoUrl}`);
        } else {
            res.status(404).json({ error: 'No video found for the search query' });
        }
    } catch (error) {
        console.error('[Server] Error in /api/search:', error);
        res.status(500).json({ error: 'Failed to search YouTube' });
    }
});

app.get('/api/get-youtube-title', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const title = await youtubeDl(url, { getTitle: true });
        res.json({ title });
    } catch (error) {
        console.error(`[Server] Error fetching title for ${url}:`, error);
        res.status(500).json({ error: 'Failed to fetch YouTube title' });
    }
});

// MusicBrainz search API
app.get('/api/musicbrainz-albums-by-artist', (req, res) => {
    const { artist } = req.query;
    if (!artist) {
        res.status(400).json({ error: 'Artist is required' });
        return;
    }

    // Step 1: Search for the artist to get their MusicBrainz ID
    const artistSearchUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artist)}&fmt=json`;
    console.log(`[Server] MusicBrainz Artist Search URL: ${artistSearchUrl}`);

    https.get(artistSearchUrl, {
        headers: {
            'User-Agent': 'TuneFetcherAI/1.0 ( https://github.com/Darthmonkey/tunefetcherai )'
        }
    }, (artistSearchRes) => {
        let artistSearchData = '';
        artistSearchRes.on('data', (chunk) => { artistSearchData += chunk; });
        artistSearchRes.on('end', () => {
            console.log(`[Server] MusicBrainz Artist Search Response Status: ${artistSearchRes.statusCode}`);
            try {
                const artistMbData = JSON.parse(artistSearchData);
                if (artistMbData.artists && artistMbData.artists.length > 0) {
                    const artistId = artistMbData.artists[0].id; // Take the first result
                    console.log(`[Server] Found artist ID: ${artistId} (${artistMbData.artists[0].name})`);

                    // Step 2: Search for release-groups (albums) by artist ID
                    const mbSearchUrl = `https://musicbrainz.org/ws/2/release-group/?artist=${artistId}&fmt=json&type=album`;
                    console.log(`[Server] MusicBrainz Album Search by Artist ID URL: ${mbSearchUrl}`);

                    https.get(mbSearchUrl, {
                        headers: {
                            'User-Agent': 'TuneFetcherAI/1.0 ( https://github.com/Darthmonkey/tunefetcherai )'
                        }
                    }, (albumSearchRes) => {
                        let albumSearchData = '';
                        albumSearchRes.on('data', (chunk) => { albumSearchData += chunk; });
                        albumSearchRes.on('end', () => {
                            console.log(`[Server] MusicBrainz Album Search by Artist ID Response Status: ${albumSearchRes.statusCode}`);
                            try {
                                const albumMbData = JSON.parse(albumSearchData);
                                if (albumMbData['release-groups'] && albumMbData['release-groups'].length > 0) {
                                    const albums = albumMbData['release-groups'].map((rg) => ({
                                        id: rg.id,
                                        title: rg.title,
                                        'first-release-date': rg['first-release-date'],
                                        artist: artistMbData.artists[0].name, // Explicitly add the resolved artist name
                                        'artist-credit': rg['artist-credit']
                                    }));
                                    res.json({ success: true, albums });
                                    console.log(`[Server] Found ${albums.length} albums for artist ID: ${artistId}.`);
                                } else {
                                    res.status(404).json({ success: false, error: 'No albums found for this artist.' });
                                    console.warn(`[Server] No albums found for artist ID: ${artistId}.`);
                                }
                            } catch (parseError) {
                                console.error('[Server] Error parsing MusicBrainz album search data:', parseError);
                                res.status(500).json({ success: false, error: 'Failed to parse MusicBrainz album search data' });
                            }
                        });
                    }).on('error', (e) => {
                        console.error('[Server] Error fetching MusicBrainz album search by Artist ID:', e);
                        res.status(500).json({ success: false, error: 'Failed to fetch MusicBrainz album search by Artist ID' });
                    });

                } else {
                    res.status(404).json({ success: false, error: 'Artist not found on MusicBrainz.' });
                    console.warn(`[Server] Artist not found on MusicBrainz: ${artist}.`);
                }
            } catch (parseError) {
                console.error('[Server] Error parsing MusicBrainz artist search data:', parseError);
                res.status(500).json({ success: false, error: 'Failed to parse MusicBrainz artist search data' });
            }
        });
    }).on('error', (e) => {
        console.error('[Server] Error fetching MusicBrainz artist search:', e);
        res.status(500).json({ success: false, error: 'Failed to fetch MusicBrainz artist search' });
    });
});

app.get('/api/musicbrainz-search', async (req, res) => {
    const { artist, album, year } = req.query;
    if (!artist || !album) {
        return res.status(400).json({ success: false, error: 'Artist and album are required' });
    }

    // Helper function to fetch detailed release information
    const fetchReleaseDetails = (releaseId) => {
        return new Promise((resolve, reject) => {
            const mbDetailsUrl = `https://musicbrainz.org/ws/2/release/${releaseId}?fmt=json&inc=recordings`;
            https.get(mbDetailsUrl, { headers: { 'User-Agent': USER_AGENT } }, (detailsRes) => {
                let detailsData = '';
                detailsRes.on('data', (chunk) => { detailsData += chunk; });
                detailsRes.on('end', () => {
                    if (detailsRes.statusCode !== 200) {
                        return reject(new Error(`MusicBrainz details API returned status ${detailsRes.statusCode}`));
                    }
                    try {
                        const detailsMbData = JSON.parse(detailsData);
                        const allTracks = detailsMbData.media?.flatMap(mediaItem => Array.isArray(mediaItem.tracks) ? mediaItem.tracks : []) || [];
                        const tracks = allTracks.map((track) => ({
                            id: track.id,
                            name: track.title,
                            trackNumber: track.position ? parseInt(track.position) : undefined,
                            artist: track['artist-credit']?.[0]?.artist?.name,
                            duration: track.length ? Math.floor(track.length / 1000) : undefined,
                        }));
                        resolve({
                            id: detailsMbData.id,
                            title: detailsMbData.title,
                            'first-release-date': detailsMbData['first-release-date'],
                            artist: detailsMbData['artist-credit']?.[0]?.artist?.name,
                            tracks: tracks,
                            totalTracks: tracks.length,
                            disambiguation: detailsMbData.disambiguation,
                            format: detailsMbData.media?.[0]?.format, // Get format of the first medium
                        });
                    } catch (parseError) {
                        reject(new Error(`Error parsing MusicBrainz details data: ${parseError.message}`));
                    }
                });
            }).on('error', (e) => {
                reject(new Error(`Error fetching MusicBrainz details: ${e.message}`));
            });
        });
    };

    // Helper function to fetch album tracks by release group ID
    const fetchAlbumTracks = async (releaseGroupId) => {
        const releaseGroupUrl = `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}?fmt=json&inc=releases`;
        console.log(`[Server] Fetching release group details: ${releaseGroupUrl}`);

        const releaseGroupResponse = await new Promise((resolve, reject) => {
            https.get(releaseGroupUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`MusicBrainz release group API returned status ${res.statusCode}`));
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Error parsing release group data: ${e.message}`));
                    }
                });
            }).on('error', (e) => {
                reject(new Error(`Error fetching release group: ${e.message}`));
            });
        });

        if (!releaseGroupResponse.releases || releaseGroupResponse.releases.length === 0) {
            throw new Error(`No releases found for release group ${releaseGroupId}`);
        }

        // Try to find a suitable release (e.g., a digital album, or the first one available)
        const suitableRelease = releaseGroupResponse.releases.find(r => r.media && r.media.some(m => m.format === 'Digital Media')) || releaseGroupResponse.releases[0];

        if (!suitableRelease) {
            throw new Error(`No suitable release found for release group ${releaseGroupId}`);
        }

        console.log(`[Server] Found suitable release ${suitableRelease.id} for release group ${releaseGroupId}`);
        return await fetchReleaseDetails(suitableRelease.id);
    };

    try {
        // Step 1: Search for releases
        let mbSearchQuery = `artist:${artist} AND release:${album}`;
        if (year) {
            mbSearchQuery += ` AND date:${year}`;
        }
        const mbSearchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(mbSearchQuery)}&fmt=json`;
        console.log(`[Server] MusicBrainz Search URL (Step 1): ${mbSearchUrl}`);

        const searchResponse = await new Promise((resolve, reject) => {
            https.get(mbSearchUrl, { headers: { 'User-Agent': USER_AGENT } }, (searchRes) => {
                let searchData = '';
                searchRes.on('data', (chunk) => { searchData += chunk; });
                searchRes.on('end', () => {
                    if (searchRes.statusCode !== 200) {
                        return reject(new Error(`MusicBrainz search API returned status ${searchRes.statusCode}`));
                    }
                    try {
                        resolve(JSON.parse(searchData));
                    } catch (parseError) {
                        reject(new Error(`Error parsing MusicBrainz search data: ${parseError.message}`));
                    }
                });
            }).on('error', (e) => {
                reject(new Error(`Error fetching MusicBrainz search: ${e.message}`));
            });
        });

        if (!searchResponse.releases || searchResponse.releases.length === 0) {
            return res.status(404).json({ success: false, error: 'No matching releases found on MusicBrainz.' });
        }

        // Step 2: Fetch detailed information for multiple releases concurrently
        const releaseDetailPromises = searchResponse.releases
            .slice(0, MAX_RELEASES_TO_FETCH) // Limit to a few releases
            .map(release => fetchReleaseDetails(release.id).catch(error => {
                console.warn(`[Server] Failed to fetch details for release ${release.id}: ${error.message}`);
                return null; // Return null for failed fetches
            }));

        const detailedReleases = (await Promise.all(releaseDetailPromises)).filter(Boolean); // Filter out nulls

        if (detailedReleases.length === 0) {
            return res.status(404).json({ success: false, error: 'No detailed release information could be retrieved.' });
        }

        res.json({ success: true, releases: detailedReleases });

    } catch (error) {
        console.error('[Server] Error in musicbrainz-search API:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to search MusicBrainz' });
    }
});


// Download API
app.post('/api/download-single', async (req, res) => {
    const { url: videoUrl, name: trackName } = req.body;
    console.log(`[Server] Download request for: ${trackName} (${videoUrl})`);

    if (!videoUrl) {
        console.warn('[Server] Download request missing URL.');
        return res.status(400).json({ error: 'URL is required' });
    }

    const maxRetries = 3;
    const retryDelaySeconds = 5;
    const tempDir = path.join(__dirname, 'temp', `download_${Date.now()}`);
    const outputPath = path.join(tempDir, `${trackName}.mp3`);

    fs.mkdirSync(tempDir, { recursive: true });

    async function downloadWithRetry(url, outputPath, retryCount) {
        try {
            console.log(`[Server] Attempting download (Attempt ${retryCount + 1}/${maxRetries}) from: ${url}`);

            await youtubeDl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '0',
                output: outputPath,
                ffmpegLocation: ffmpeg,
            });

            console.log(`[Server] Successfully downloaded audio to: ${outputPath}`);
            return true;

        } catch (error) {
            console.error(`[Server] Download failed for ${url} (Attempt ${retryCount + 1}/${maxRetries}):`, error);
            if (retryCount < maxRetries - 1) {
                console.log(`[Server] Retrying in ${retryDelaySeconds} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelaySeconds * 1000));
                return await downloadWithRetry(url, outputPath, retryCount + 1);
            } else {
                console.error(`[Server] Max retries reached for ${url}. Download failed.`);
                return false;
            }
        }
    }

    const downloadSuccessful = await downloadWithRetry(videoUrl, outputPath, trackName);

    if (downloadSuccessful.success) {
        res.download(outputPath, `${trackName}.mp3`, (err) => {
            if (err) {
                console.error('[Server] Error sending file:', err);
            }
            rimraf.rimraf(tempDir);
        });
    } else {
        res.status(500).json({ error: `Failed to download track after multiple retries.` });
        rimraf.rimraf(tempDir);
    }
});

app.post('/api/download-multiple', async (req, res) => {
    const { tracks, albumName, artistName } = req.body;
    console.log(`[Server] Multi-download request for album: ${albumName}`);

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ error: 'Tracks array is required' });
    }

    const tempDir = path.join(__dirname, 'temp', `download_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const downloadPromises = tracks.map(track => {
        const outputPath = path.join(tempDir, `${track.name}.mp3`);
        return downloadWithRetry(track.youtubeUrl, outputPath, track.name, track.id);
    });

    // Refactored and extracted downloadWithRetry function
    async function downloadWithRetry(url, outputPath, trackName, trackId = null, retryCount = 0, maxRetries = 3, retryDelaySeconds = 5) {
        try {
            console.log(`[Server] Attempting download for ${trackName} (Attempt ${retryCount + 1}/${maxRetries})`);
            await youtubeDl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '0',
                output: outputPath,
                ffmpegLocation: ffmpeg,
            });
            console.log(`[Server] Successfully downloaded ${trackName}`);
            return { success: true, path: outputPath, trackName, trackId };
        } catch (error) {
            console.error(`[Server] Download failed for ${trackName}:`, error);
            if (retryCount < maxRetries - 1) {
                console.log(`[Server] Retrying in ${retryDelaySeconds} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelaySeconds * 1000));
                return await downloadWithRetry(url, outputPath, trackName, trackId, retryCount + 1, maxRetries, retryDelaySeconds);
            }
            return { success: false, trackName, trackId, error: error.message };
        }
    }

    try {
        const results = await Promise.all(downloadPromises);
        const successfulDownloads = results.filter(r => r.success);
        const failedDownloads = results.filter(r => !r.success);

        if (successfulDownloads.length === 0) {
            res.status(200).json({ success: false, message: 'All downloads failed', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })) });
            rimraf.rimraf(tempDir);
            return;
        }

        const zipPath = path.join(__dirname, 'temp', `${artistName || albumName}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`[Server] Zip archive created: ${zipPath}`);
            res.json({ success: true, message: 'Downloads completed', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })), zipUrl: `/api/download-zip/${path.basename(zipPath)}` });
            // Clean up the temp directory after the response is sent and the file is served
            rimraf.rimraf(tempDir);
        });

        archive.on('error', (err) => {
            console.error('[Server] Archiver error:', err);
            res.status(500).json({ success: false, error: 'Failed to create archive', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })) });
            rimraf.rimraf(tempDir);
        });

        archive.pipe(output);
        const zipFolderName = albumName;
        successfulDownloads.forEach(result => {
            archive.file(result.path, { name: `${zipFolderName}/${path.basename(result.path)}` });
        });
        archive.finalize();

    } catch (error) {
        console.error('[Server] Error during multi-download:', error);
        res.status(500).json({ success: false, error: 'Failed to process downloads', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })) });
        rimraf.rimraf(tempDir);
    }
});

app.post('/api/download/albums', async (req, res) => {
    const { albumIds } = req.body;
    console.log(`[Server] Multi-album download request for album IDs: ${albumIds}`);

    if (!albumIds || !Array.isArray(albumIds) || albumIds.length === 0) {
        return res.status(400).json({ error: 'albumIds array is required' });
    }

    const mainTempDir = path.join(__dirname, 'temp', `multi_album_download_${Date.now()}`);
    fs.mkdirSync(mainTempDir, { recursive: true });

    let allTracksToDownload = [];
    let albumNames = {};

    try {
        for (const albumId of albumIds) {
            const albumDetails = await fetchAlbumTracks(albumId);
            if (albumDetails && albumDetails.tracks) {
                console.log(`[Server] Found ${albumDetails.tracks.length} tracks for album ${albumDetails.title} (${albumId})`);
                albumNames[albumId] = albumDetails.title; // Store album title for zipping
                for (const track of albumDetails.tracks) {
                    // For each track, we need to find its YouTube URL
                    // This will involve calling the YouTube search logic
                    // For now, we'll just add a placeholder
                    allTracksToDownload.push({
                        albumId: albumId,
                        albumName: albumDetails.title,
                        artistName: albumDetails.artist || '',
                        trackName: track.name,
                        trackId: track.id,
                        youtubeUrl: null // This will be populated later
                    });
                }
            }
        }

        // Now, for each track, find its YouTube URL
        for (const track of allTracksToDownload) {
            const searchQuery = `${track.artistName} - ${track.trackName}`;
            track.youtubeUrl = await searchYouTubeForTrack(searchQuery);
            if (track.youtubeUrl === null) {
                console.warn(`[Server] No YouTube URL found for track: ${track.artistName} - ${track.trackName}`);
            }
        }

        console.log(`[Server] Total tracks initially collected: ${allTracksToDownload.length}`);
        const tracksWithYoutubeUrl = allTracksToDownload.filter(track => track.youtubeUrl !== null);
        console.log(`[Server] Tracks with YouTube URL found: ${tracksWithYoutubeUrl.length}`);
        const tracksWithoutYoutubeUrl = allTracksToDownload.filter(track => track.youtubeUrl === null);
        if (tracksWithoutYoutubeUrl.length > 0) {
            console.warn('[Server] Tracks without YouTube URL:');
            tracksWithoutYoutubeUrl.forEach(track => console.warn(`- ${track.artistName} - ${track.trackName}`));
        }

        const tracksToDownload = allTracksToDownload.filter(track => track.youtubeUrl !== null);

        if (tracksToDownload.length === 0) {
            res.status(404).json({ success: false, error: 'No tracks with YouTube URLs found for download.' });
            rimraf.rimraf(mainTempDir);
            return;
        }

        const downloadPromises = tracksToDownload.map(track => {
            const trackTempDir = path.join(mainTempDir, track.albumName);
            fs.mkdirSync(trackTempDir, { recursive: true });
            const outputPath = path.join(trackTempDir, `${track.trackName}.mp3`);
            return downloadWithRetry(track.youtubeUrl, outputPath, track.trackName, track.trackId);
        });

        const results = await Promise.all(downloadPromises);
        const successfulDownloads = results.filter(r => r.success);
        const failedDownloads = results.filter(r => !r.success);

        if (successfulDownloads.length === 0) {
            res.status(200).json({ success: false, message: 'All downloads failed', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })) });
            rimraf.rimraf(mainTempDir);
            return;
        }

        const zipFileName = `TuneFetcher_Albums_${Date.now()}.zip`;
        const zipPath = path.join(__dirname, 'temp', zipFileName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`[Server] Multi-album zip archive created: ${zipPath}`);
            res.json({ success: true, message: 'Multi-album downloads completed', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })), zipUrl: `/api/download-zip/${zipFileName}` });
            rimraf.rimraf(mainTempDir);
        });

        archive.on('error', (err) => {
            console.error('[Server] Multi-album archiver error:', err);
            res.status(500).json({ success: false, error: 'Failed to create multi-album archive', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })) });
            rimraf.rimraf(mainTempDir);
        });

        archive.pipe(output);
        successfulDownloads.forEach(result => {
            // Add files to zip, organizing by album name
            const albumNameForZip = albumNames[result.albumId] || 'Unknown Album';
            archive.file(result.path, { name: `${albumNameForZip}/${path.basename(result.path)}` });
        });
        archive.finalize();

    } catch (error) {
        console.error('[Server] Error during multi-album download:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to process multi-album downloads' });
        rimraf.rimraf(mainTempDir);
    }
});

app.get('/api/download-zip/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'temp', filename);

    res.download(filePath, (err) => {
        if (err) {
            console.error('[Server] Error sending zip file:', err);
            // Only send a response if headers haven't been sent yet
            if (!res.headersSent) {
                if (err.code === 'ENOENT') {
                    return res.status(404).send('File not found.');
                } else {
                    return res.status(500).send('Error downloading file.');
                }
            }
        }
        // Clean up the file after sending, regardless of success or failure
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                console.error('[Server] Error deleting temporary zip file:', unlinkErr);
            }
            // Temporarily remove directory cleanup to isolate ERR_HTTP_HEADERS_SENT
            // rimraf.rimraf(path.dirname(filePath)); 
        });
    });
});

// 404 handler
app.use((req, res) => {
    console.warn(`[Server] 404 Not Found for: ${req.originalUrl}`);
    res.status(404).send('Not Found');
});

const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
