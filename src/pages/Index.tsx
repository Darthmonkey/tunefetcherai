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

interface TrackInfo {
  id: string;
  name: string;
  youtubeUrl?: string;
  selected: boolean;
  trackNumber?: number;
  artist?: string;
  duration?: number;
}

interface Session {
  id: string;
  artist: string;
  album: string;
  year?: number;
  ai_prompt?: string;
}

const Index = () => {
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [year, setYear] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [manualUrls, setManualUrls] = useState("");
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchingTracks, setSearchingTracks] = useState(false);
  const [findingUrls, setFindingUrls] = useState(false);
  const [processingManual, setProcessingManual] = useState(false);
  const [searchPlaylists, setSearchPlaylists] = useState(false);

  const generatePrompt = () => {
    if (!artist || !album) {
      toast.error("Please enter both artist and album");
      return;
    }

    let prompt = `Find YouTube URLs for all tracks from the album \"${album}\" by ${artist}`;
    if (year) prompt += ` released in ${year}`;
    
    prompt += `\n\nPlease provide accurate, high-quality YouTube links for each track.`;
    
    setAiPrompt(prompt);
    toast.success("AI prompt generated!");
  };

  const generateTrackInfo = async () => {
    if (!artist || !album) {
      toast.error("Please enter both artist and album");
      return;
    }

    setSearchingTracks(true);
    
    try {
      const response = await fetch(`http://localhost:3001/api/musicbrainz-search?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}${year ? `&year=${encodeURIComponent(year)}` : ''}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      
      const formattedTracks: TrackInfo[] = data.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        trackNumber: track.trackNumber,
        artist: track.artist,
        duration: track.duration,
        selected: false, // Default to not selected
      }));

      setTracks(formattedTracks);
      setCurrentSession({
        id: "dummy-session-id", // We are not using sessions anymore, but keeping it for now
        artist,
        album,
        year: year ? parseInt(year) : undefined
      });
      
      toast.success(`Found ${data.totalTracks} tracks from \"${data.release.title}\"!`);
    } catch (error: any) {
      console.error('Error searching MusicBrainz:', error);
      toast.error(error.message || "Failed to find track information");
    } finally {
      setSearchingTracks(false);
    }
  };

  const askAi = async () => {
    if (!currentSession) {
      toast.error("Please generate track information first");
      return;
    }

    setFindingUrls(true);
    
    try {
      const updatedTracks = await Promise.all(
        tracks.map(async (track) => {
          try {
            const response = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(`${track.artist} ${track.name}`)}`);
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
    } catch (error: any) {
      console.error('Error finding YouTube URLs:', error);
      toast.error(error.message || "Failed to get AI response");
    }
    finally {
      setFindingUrls(false);
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
        const trackName = `Manual Download ${Date.now()}`;
        const response = await fetch('http://localhost:3001/api/download', {
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
    } catch (error: any) {
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
              Search Parameters
            </CardTitle>
            <CardDescription>
              Enter the artist and album information to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="artist">Artist</Label>
                <Input
                  id="artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Enter artist name"
                />
              </div>
              <div>
                <Label htmlFor="album">Album</Label>
                <Input
                  id="album"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="Enter album name"
                />
              </div>
              <div>
                <Label htmlFor="year">Year (Optional)</Label>
                <Input
                  id="year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g. 2023"
                  type="number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Track Discovery
              </CardTitle>
              <CardDescription>
                Find tracks using MusicBrainz database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={generateTrackInfo}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!artist || !album || searchingTracks}
              >
                {searchingTracks ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching MusicBrainz...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Find Track Information
                  </>
                )}
              </Button>
              {currentSession && (
                <div className="text-sm text-muted-foreground p-3 bg-secondary rounded-md">
                  Found: {currentSession.album} by {currentSession.artist}
                  {currentSession.year && ` (${currentSession.year})`}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                AI YouTube Search
              </CardTitle>
              <CardDescription>
                Use AI to find YouTube URLs for tracks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={generatePrompt} 
                variant="outline"
                className="w-full"
                disabled={!artist || !album}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate AI Prompt
              </Button>
              <div>
                <Label htmlFor="aiPrompt">AI Prompt</Label>
                <Textarea
                  id="aiPrompt"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="AI prompt will appear here..."
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="searchPlaylists" checked={searchPlaylists} onCheckedChange={setSearchPlaylists} />
                <Label htmlFor="searchPlaylists">Search for playlists</Label>
              </div>
              <Button 
                onClick={askAi}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!currentSession || findingUrls}
              >
                {findingUrls ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Finding URLs...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Find YouTube URLs
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {tracks.length > 0 && (
          <Card className="mb-8 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                Discovered Tracks
              </CardTitle>
              <CardDescription>
                Select tracks to download and manage your collection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrackTable
                tracks={tracks}
                onTracksChange={setTracks}
                albumName={album}
              />
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
