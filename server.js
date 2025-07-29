import http from 'http';
import https from 'https';
import url from 'url';
import ytdl from 'ytdl-core';

const PORT = 3001;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  console.log(`[Server] Request received: ${req.method} ${pathname}`);

  if (pathname === '/api/search' && query.q) {
    const searchQuery = query.q;
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
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ url: videoUrl }));
              console.log(`[Server] Responded with video URL: ${videoUrl}`);
            } else {
              console.warn('[Server] No videoId found in ytInitialData structure.');
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No video found in ytInitialData' }));
            }
          } else {
            console.warn('[Server] ytInitialData not found in HTML or regex failed.');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ytInitialData not found in HTML' }));
          }
        } catch (parseError) {
          console.error('[Server] Error parsing ytInitialData:', parseError);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse YouTube data' }));
        }
      });
    }).on('error', (e) => {
      console.error('[Server] Error fetching data from YouTube:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch data from YouTube' }));
    });
  } else if (pathname === '/api/musicbrainz-search') {
    const { artist, album, year } = query;
    if (!artist || !album) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Artist and album are required' }));
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
        // console.log(`[Server] Raw MusicBrainz Search Data (Step 1): ${searchData}`); // Too verbose
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
                // console.log(`[Server] Raw MusicBrainz Details Data (Step 2): ${detailsData}`); // Too verbose
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
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, release: { title: detailsMbData.title }, totalTracks: tracks.length, tracks }));
                  console.log(`[Server] Found ${tracks.length} tracks from MusicBrainz.`);
                } catch (parseError) {
                  console.error('[Server] Error parsing MusicBrainz details data:', parseError);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: 'Failed to parse MusicBrainz details data' }));
                }
              });
            }).on('error', (e) => {
              console.error('[Server] Error fetching MusicBrainz details:', e);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Failed to fetch MusicBrainz details' }));
            });

          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No matching release found on MusicBrainz (Step 1)' }));
            console.warn('[Server] No matching release found on MusicBrainz (Step 1).');
          }
        } catch (parseError) {
          console.error('[Server] Error parsing MusicBrainz search data:', parseError);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Failed to parse MusicBrainz search data' }));
        }
      });
    }).on('error', (e) => {
      console.error('[Server] Error fetching MusicBrainz search:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Failed to fetch MusicBrainz search' }));
    });
  } else if (pathname === '/api/download' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        try {
            const { url: videoUrl, name: trackName } = JSON.parse(body);
            console.log(`[Server] Download request for: ${trackName} (${videoUrl})`);
            if (videoUrl) {
              res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': `attachment; filename="${trackName}.mp3"`,
              });
              ytdl(videoUrl, { quality: 'highestaudio' }).pipe(res);
              console.log(`[Server] Streaming download for ${trackName}.`);
            } else {
              console.warn('[Server] Download request missing URL.');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'URL is required' }));
            }
        } catch (jsonError) {
            console.error('[Server] Error parsing download request body:', jsonError);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
    });
  } else {
    console.warn(`[Server] 404 Not Found for: ${pathname}`);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});