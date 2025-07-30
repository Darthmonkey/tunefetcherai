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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;

const app = express();

app.use(express.json());

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle all other requests by serving the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// CORS middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    next();
});

// YouTube search API
app.get('/api/search', (req, res) => {
    const searchQuery = req.query.q;
    const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    console.log(`[Server] Searching YouTube for: ${searchQuery}`);
    console.log(`[Server] Fetching YouTube URL: ${youtubeUrl}`);

    https.get(youtubeUrl, (youtubeRes) => {
        let html = '';
        youtubeRes.on('data', (chunk) => {
            html += chunk;
        });
        youtubeRes.on('end', () => {
            try {
                const ytInitialDataMatch = html.match(/var ytInitialData = ({.*?});/);
                if (ytInitialDataMatch && ytInitialDataMatch[1]) {
                    console.log('[Server] Found ytInitialData in HTML.');
                    const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
                    const contents = ytInitialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;

                    let videoId = null;
                    if (contents) {
                        for (const section of contents) {
                            if (section.itemSectionRenderer && section.itemSectionRenderer.contents) {
                                for (const item of section.itemSectionRenderer.contents) {
                                    if (item.videoRenderer && item.videoRenderer.videoId) {
                                        videoId = item.videoRenderer.videoId;
                                        console.log(`[Server] Found videoId: ${videoId}`);
                                        break;
                                    }
                                }
                            }
                            if (videoId) break;
                        }
                    }

                    if (videoId) {
                        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                        res.json({ url: videoUrl });
                        console.log(`[Server] Responded with video URL: ${videoUrl}`);
                    } else {
                        console.warn('[Server] No videoId found in ytInitialData structure.');
                        res.status(404).json({ error: 'No video found in ytInitialData' });
                    }
                } else {
                    console.warn('[Server] ytInitialData not found in HTML or regex failed.');
                    res.status(404).json({ error: 'ytInitialData not found in HTML' });
                }
            } catch (parseError) {
                console.error('[Server] Error parsing ytInitialData:', parseError);
                res.status(500).json({ error: 'Failed to parse YouTube data' });
            }
        });
    }).on('error', (e) => {
        console.error('[Server] Error fetching data from YouTube:', e);
        res.status(500).json({ error: 'Failed to fetch data from YouTube' });
    });
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
            'User-Agent': 'TuneFetcherAI/1.0 ( your-email@example.com )'
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
                            'User-Agent': 'TuneFetcherAI/1.0 ( your-email@example.com )'
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

app.get('/api/musicbrainz-search', (req, res) => {

    const { artist, album, year } = req.query;
    if (!artist || !album) {
        res.status(400).json({ error: 'Artist and album are required' });
        return;
    }

    // Step 1: Search for releases to get a release ID
    let mbSearchQuery = `artist:${artist} AND release:${album}`;
    if (year) {
        mbSearchQuery += ` AND date:${year}`;
    }
    const mbSearchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(mbSearchQuery)}&fmt=json`;
    console.log(`[Server] MusicBrainz Search URL (Step 1): ${mbSearchUrl}`);

    https.get(mbSearchUrl, {
        headers: {
            'User-Agent': 'TuneFetcherAI/1.0 ( your-email@example.com )'
        }
    }, (searchRes) => {
        let searchData = '';
        searchRes.on('data', (chunk) => { searchData += chunk; });
        searchRes.on('end', () => {
            console.log(`[Server] MusicBrainz Search Response Status (Step 1): ${searchRes.statusCode}`);
            try {
                const searchMbData = JSON.parse(searchData);
                if (searchMbData.releases && searchMbData.releases.length > 0) {
                    const bestRelease = searchMbData.releases[0]; // Take the first result
                    const releaseId = bestRelease.id;
                    console.log(`[Server] Found best matching release ID: ${releaseId} (${bestRelease.title})`);

                    // Step 2: Fetch detailed release information with recordings using the release ID
                    const mbDetailsUrl = `https://musicbrainz.org/ws/2/release/${releaseId}?fmt=json&inc=recordings`;
                    console.log(`[Server] MusicBrainz Details URL (Step 2): ${mbDetailsUrl}`);

                    https.get(mbDetailsUrl, {
                        headers: {
                            'User-Agent': 'TuneFetcherAI/1.0 ( your-email@example.com )'
                        }
                    }, (detailsRes) => {
                        let detailsData = '';
                        detailsRes.on('data', (chunk) => { detailsData += chunk; });
                        detailsRes.on('end', () => {
                            console.log(`[Server] MusicBrainz Details Response Status (Step 2): ${detailsRes.statusCode}`);
                            try {
                                const detailsMbData = JSON.parse(detailsData);
                                const allTracks = detailsMbData.media?.flatMap(mediaItem => Array.isArray(mediaItem.tracks) ? mediaItem.tracks : []) || [];

                                const tracks = allTracks.map((track) => ({
                                    id: track.id,
                                    name: track.title,
                                    trackNumber: track.position ? parseInt(track.position) : undefined,
                                    artist: track['artist-credit']?.[0]?.artist?.name || artist,
                                    duration: track.length ? Math.floor(track.length / 1000) : undefined,
                                }));
                                res.json({ success: true, release: { title: detailsMbData.title }, totalTracks: tracks.length, tracks });
                                console.log(`[Server] Found ${tracks.length} tracks from MusicBrainz.`);
                            } catch (parseError) {
                                console.error('[Server] Error parsing MusicBrainz details data:', parseError);
                                res.status(500).json({ success: false, error: 'Failed to parse MusicBrainz details data' });
                            }
                        });
                    }).on('error', (e) => {
                        console.error('[Server] Error fetching MusicBrainz details:', e);
                        res.status(500).json({ success: false, error: 'Failed to fetch MusicBrainz details' });
                    });

                } else {
                    res.status(404).json({ success: false, error: 'No matching release found on MusicBrainz (Step 1)' });
                    console.warn('[Server] No matching release found on MusicBrainz (Step 1).');
                }
            } catch (parseError) {
                console.error('[Server] Error parsing MusicBrainz search data:', parseError);
                res.status(500).json({ success: false, error: 'Failed to parse MusicBrainz search data' });
            }
        });
    }).on('error', (e) => {
        console.error('[Server] Error fetching MusicBrainz search:', e);
        res.status(500).json({ success: false, error: 'Failed to fetch MusicBrainz search' });
    });
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

    const downloadSuccessful = await downloadWithRetry(videoUrl, outputPath, 0);

    if (downloadSuccessful) {
        res.download(outputPath, `${trackName}.mp3`, (err) => {
            if (err) {
                console.error('[Server] Error sending file:', err);
            }
            rimraf.rimraf(tempDir);
        });
    } else {
        res.status(500).json({ error: `Failed to download track after multiple retries.` });
        rimraf(tempDir);
    }
});

app.post('/api/download-multiple', async (req, res) => {
    const { tracks, albumName } = req.body;
    console.log(`[Server] Multi-download request for album: ${albumName}`);

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ error: 'Tracks array is required' });
    }

    const tempDir = path.join(__dirname, 'temp', `download_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const downloadPromises = tracks.map(track => {
        const outputPath = path.join(tempDir, `${track.name}.mp3`);
        return downloadWithRetry(track.youtubeUrl, outputPath, 0, track.name, track.id);
    });

    async function downloadWithRetry(url, outputPath, retryCount, trackName, trackId) {
        try {
            console.log(`[Server] Attempting download for ${trackName} (Attempt ${retryCount + 1})`);
            await youtubeDl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '0',
                output: outputPath,
            });
            console.log(`[Server] Successfully downloaded ${trackName}`);
            return { success: true, path: outputPath, trackName, trackId };
        } catch (error) {
            console.error(`[Server] Download failed for ${trackName}:`, error);
            if (retryCount < 2) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return await downloadWithRetry(url, outputPath, retryCount + 1, trackName, trackId);
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

        const zipPath = path.join(__dirname, 'temp', `${albumName}.zip`);
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
        successfulDownloads.forEach(result => {
            archive.file(result.path, { name: path.basename(result.path) });
        });
        archive.finalize();

    } catch (error) {
        console.error('[Server] Error during multi-download:', error);
        res.status(500).json({ success: false, error: 'Failed to process downloads', failedTracks: failedDownloads.map(f => ({ trackName: f.trackName, id: f.trackId })) });
        rimraf.rimraf(tempDir);
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