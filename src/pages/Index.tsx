import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TrackTable } from "@/components/TrackTable";
import { toast } from "sonner";
import { Loader2, Music, Download, Search, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TrackInfo {
  id: string;
  name: string;
  youtubeUrl?: string;
  selected: boolean;
  trackNumber?: number;
  artist?: string;
  duration?: number;
  downloadStatus?: 'pending' | 'success' | 'failed';
}

const Index = () => {
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [albums, setAlbums] = useState<any[]>([]);
  const [searchingAlbums, setSearchingAlbums] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<any | null>(null);

  const [sortYearOrder, setSortYearOrder] = useState<'asc' | 'desc' | null>(null);

  const [manualUrls, setManualUrls] = useState("");
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchingTracks, setSearchingTracks] = useState(false);
  const [findingUrls, setFindingUrls] = useState(false);
  const [processingManual, setProcessingManual] = useState(false);
  const [searchPlaylists, setSearchPlaylists] = useState(false);

  const searchAlbumsByArtist = async () => {
    if (!artistSearchQuery.trim()) {
      toast.error("Please enter an artist name to search for albums.");
      return;
    }

    setSearchingAlbums(true);
    setAlbums([]); // Clear previous results
    setSelectedAlbum(null); // Clear selected album
    setTracks([]); // Clear tracks

    try {
      const response = await fetch(`http://localhost:3001/api/musicbrainz-albums-by-artist?artist=${encodeURIComponent(artistSearchQuery)}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Album search failed');
      }

      setAlbums(data.albums);
      // Update artistSearchQuery with the canonical artist name from MusicBrainz
      if (data.albums.length > 0 && data.albums[0]['artist-credit'] && data.albums[0]['artist-credit'][0] && data.albums[0]['artist-credit'][0].artist) {
        setArtistSearchQuery(data.albums[0]['artist-credit'][0].artist.name);
      }
      toast.success(`Found ${data.albums.length} albums for "${artistSearchQuery}"!`);
    } catch (error: Error) {
      console.error('Error searching albums:', error);
      toast.error(error.message || "Failed to find albums for artist");
    } finally {
      setSearchingAlbums(false);
    }
  };

  const handleAlbumSelect = async (album: any) => {
    setSelectedAlbum(album);
    setTracks([]); // Clear existing tracks

    // Automatically trigger track info generation and YouTube URL finding
    await generateTrackInfo(album.title, artistSearchQuery, album['first-release-date'] ? new Date(album['first-release-date']).getFullYear().toString() : '');
  };

  const generateTrackInfo = async (albumTitle: string, artistName: string, year?: string) => {
    setSearchingTracks(true);
    
    try {
      const response = await fetch(`http://localhost:3001/api/musicbrainz-search?artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumTitle)}${year ? `&year=${encodeURIComponent(year)}` : ''}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      
      const formattedTracks: TrackInfo[] = data.tracks.map((track: { id: string; name: string; trackNumber?: number; artist?: string; duration?: number; }) => ({
        id: track.id,
        name: track.name,
        trackNumber: track.trackNumber,
        artist: track.artist,
        duration: track.duration,
        selected: false, // Default to not selected
      }));

      setTracks(formattedTracks);
      toast.success(`Found ${data.totalTracks} tracks from "${data.release.title}"!`);
      
      // Automatically find YouTube URLs after tracks are found
      await askAi(formattedTracks, artistName);

    } catch (error: Error) {
      console.error('Error searching MusicBrainz:', error);
      toast.error(error.message || "Failed to find track information");
    } finally {
      setSearchingTracks(false);
    }
  };

  const askAi = async (tracksToProcess: TrackInfo[], artistName: string) => {
    setFindingUrls(true);
    
    try {
      const updatedTracks = await Promise.all(
        tracksToProcess.map(async (track) => {
          try {
            const response = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(`${artistName} ${track.name}`)}`);
            const data = await response.json();
            return { ...track, youtubeUrl: data.url };
          } catch (error) {
            console.error('Error fetching URL for', track.name, error);
            return track; // Return original track if URL fetching fails
          }
        })
      );
      setTracks(updatedTracks);
      toast.success(`Found YouTube URLs for your tracks!`);
    } catch (error: Error) {
      console.error('Error finding YouTube URLs:', error);
      toast.error(error.message || "Failed to get AI response");
    }
    finally {
      setFindingUrls(false);
    }
  };

  const handleDownloadTrack = async (track: TrackInfo) => {
    if (!track.youtubeUrl) {
      toast.error(`No YouTube URL found for ${track.name}`);
      return;
    }

    toast.info(`Starting download for ${track.name}...`);

    try {
      const response = await fetch('http://localhost:3001/api/download-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: track.youtubeUrl, name: track.name }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${track.name}.mp3`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        toast.success(`Downloaded ${track.name}`);
      } else {
        const errorData = await response.json();
        toast.error(`Failed to download ${track.name}: ${errorData.error || response.statusText}`);
      }
    } catch (error: any) {
      console.error('Error downloading track:', error);
      toast.error(error.message || "Failed to download track");
    }
  };

  const handleDownloadMultiple = async (tracksToDownload: TrackInfo[], albumName: string) => {
    toast.info(`Starting download for ${tracksToDownload.length} tracks...`);

    // Set initial download status to pending for selected tracks
    const updatedTracks = tracks.map(track => 
      tracksToDownload.some(t => t.id === track.id) 
        ? { ...track, downloadStatus: 'pending' } 
        : track
    );
    setTracks(updatedTracks);

    try {
      const response = await fetch('http://localhost:3001/api/download-multiple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracks: tracksToDownload, albumName }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.zipUrl) {
          window.open(data.zipUrl, '_blank');
          toast.success(`Downloaded ${albumName}.zip`);
        } else {
          toast.success(`Downloads completed.`);
        }

        // Update status for successful downloads
        const failedTrackIds = data.failedTracks ? data.failedTracks.map((t: any) => t.id) : [];
        const finalTracks = tracks.map(track => 
          tracksToDownload.some(t => t.id === track.id) 
            ? { ...track, downloadStatus: failedTrackIds.includes(track.id) ? 'failed' : 'success' } 
            : track
        );
        setTracks(finalTracks);

        if (failedTrackIds.length > 0) {
          toast.error(`Failed to download some tracks: ${data.failedTracks.map((t: any) => t.trackName).join(', ')}`);
        }

      } else {
        const errorData = await response.json();
        toast.error(`Failed to download tracks: ${errorData.error || response.statusText}`);
        // If all failed, mark all selected as failed
        const finalTracks = tracks.map(track => 
          tracksToDownload.some(t => t.id === track.id) 
            ? { ...track, downloadStatus: 'failed' } 
            : track
        );
        setTracks(finalTracks);
      }
    } catch (error: any) {
      console.error('Error downloading tracks:', error);
      toast.error(error.message || "Failed to download tracks");
      // Mark all selected as failed on network error
      const finalTracks = tracks.map(track => 
        tracksToDownload.some(t => t.id === track.id) 
          ? { ...track, downloadStatus: 'failed' } 
          : track
      );
      setTracks(finalTracks);
    }
  };

  const processManualUrl = async () => {
    const urls = manualUrls.split('\n').filter(url => url.trim());
    
    if (urls.length === 0) {
      toast.error("Please enter at least one YouTube URL");
      return;
    }

    setProcessingManual(true);
    
    try {
      for (const url of urls) {
        const getYouTubeVideoId = (url: string) => {
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
          const match = url.match(regExp);
          if (match && match[2].length === 11) {
            return match[2];
          }
          return null;
        };

        const videoId = getYouTubeVideoId(url);
        const trackName = videoId || `Manual Download ${Date.now()}`; // Fallback if ID not found

        const response = await fetch('http://localhost:3001/api/download-single', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url, name: trackName }),
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${trackName}.mp3`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast.success(`Started download for ${url}`);
        } else {
          const errorData = await response.json();
          toast.error(`Failed to download ${url}: ${errorData.error || response.statusText}`);
        }
      }
      setManualUrls(''); // Clear input
    } catch (error: Error) {
      console.error('Error processing manual URLs:', error);
      toast.error(error.message || "Failed to process URLs");
    } finally {
      setProcessingManual(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Music className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold text-primary">
              TuneFetcher AI
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Discover and download music tracks with AI-powered search
          </p>
        </div>

        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Artist Search
            </CardTitle>
            <CardDescription>
              Enter an artist name to find their albums
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="artistSearch">Artist Name</Label>
              <Input
                id="artistSearch"
                value={artistSearchQuery}
                onChange={(e) => setArtistSearchQuery(e.target.value)}
                placeholder="e.g., Queen"
              />
            </div>
            <Button
              onClick={searchAlbumsByArtist}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!artistSearchQuery.trim() || searchingAlbums}
            >
              {searchingAlbums ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching Albums...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Albums
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {albums.length > 0 && !selectedAlbum && (
          <Card className="mb-8 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                Select an Album
              </CardTitle>
              <CardDescription>
                Click on an album to view its tracks and find YouTube URLs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Album Title</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead 
                        className="cursor-pointer"
                        onClick={() => setSortYearOrder(prev => {
                          if (prev === 'asc') return 'desc';
                          if (prev === 'desc') return null;
                          return 'asc';
                        })}
                      >
                        Year {sortYearOrder === 'asc' && '↑'} {sortYearOrder === 'desc' && '↓'}
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {albums
                      .sort((a, b) => {
                        const yearA = a['first-release-date'] ? new Date(a['first-release-date']).getFullYear() : 0;
                        const yearB = b['first-release-date'] ? new Date(b['first-release-date']).getFullYear() : 0;
                        if (sortYearOrder === 'asc') return yearA - yearB;
                        if (sortYearOrder === 'desc') return yearB - yearA;
                        return 0;
                      })
                      .map((album) => (
                        <TableRow key={album.id}>
                          <TableCell className="font-medium">{album.title}</TableCell>
                          <TableCell>{album.artist}</TableCell>
                          <TableCell>{album['first-release-date'] ? new Date(album['first-release-date']).getFullYear() : 'N/A'}</TableCell>
                          <TableCell>
                            <Button onClick={() => handleAlbumSelect(album)} size="sm">
                              Select
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedAlbum && (
          <Card className="mb-8 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                Selected Album: {selectedAlbum.title}
              </CardTitle>
            <CardDescription>
                Tracks for this album are being fetched and YouTube URLs are being found automatically.
              </CardDescription>
              <p className="text-sm text-muted-foreground mt-2">
                Note: Not all tracks may have a corresponding YouTube URL available.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Some tracks may not be downloadable due to content restrictions (e.g., explicit lyrics).
              </p>
          </CardHeader>
            <CardContent>
              {(searchingTracks || findingUrls) ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 mr-2 animate-spin" />
                  <span className="text-lg text-muted-foreground">
                    {searchingTracks ? "Fetching tracks from MusicBrainz..." : "Finding YouTube URLs..."}
                  </span>
                </div>
              ) : (
                tracks.length > 0 && (
                  <TrackTable
                    tracks={tracks}
                    onTracksChange={setTracks}
                    albumName={selectedAlbum.title}
                    onDownloadTrack={handleDownloadTrack}
                    onDownloadMultiple={handleDownloadMultiple}
                  />
                )
              )}
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-accent" />
              Manual YouTube URLs
            </CardTitle>
            <CardDescription>
              Enter YouTube URLs directly for individual tracks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="manualUrls">YouTube URLs (one per line)</Label>
              <Textarea
                id="manualUrls"
                value={manualUrls}
                onChange={(e) => setManualUrls(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=..."
                rows={4}
              />
            </div>
            <Button 
              onClick={processManualUrl}
              disabled={!manualUrls.trim() || processingManual}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {processingManual ? (
                <>                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing URLs...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Convert & Download URLs
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
