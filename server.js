import express from 'express';
import http from 'http';
import https from 'https';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { youtubeDl } from 'youtube-dl-exec';
import fs from 'fs';

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
app.post('/api/download', async (req, res) => {
    const { url: videoUrl, name: trackName } = req.body;
    console.log(`[Server] Download request for: ${trackName} (${videoUrl})`);

    if (!videoUrl) {
        console.warn('[Server] Download request missing URL.');
        return res.status(400).json({ error: 'URL is required' });
    }

    const maxRetries = 3;
    const retryDelaySeconds = 5;
    const outputPath = path.join(__dirname, 'temp', `${trackName}.mp3`);

    fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });

    async function downloadWithRetry(url, outputPath, retryCount) {
        try {
            console.log(`[Server] Attempting download (Attempt ${retryCount + 1}/${maxRetries}) from: ${url}`);

            const commandResult = await youtubeDl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                output: outputPath,
            });

            console.log(`[Server] Successfully downloaded audio to: ${outputPath}`);
            res.download(outputPath, `${trackName}.mp3`, (err) => {
                if (err) {
                    console.error('[Server] Error sending file:', err);
                    res.status(500).json({ error: 'Failed to send downloaded file' });
                } else {
                    console.log(`[Server] Successfully sent ${trackName}.mp3`);
                }
            });

            return true;

        } catch (error) {
            console.error(`[Server] Download failed for ${url} (Attempt ${retryCount + 1}/${maxRetries}):`, error);
            if (retryCount < maxRetries) {
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

    if (!downloadSuccessful) {
        res.status(500).json({ error: `Failed to download track after multiple retries.` });
    }
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