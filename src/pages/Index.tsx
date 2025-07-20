import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TrackTable } from "@/components/TrackTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Music, Download, Search, Sparkles } from "lucide-react";

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
  const [downloading, setDownloading] = useState(false);
  const [processingManual, setProcessingManual] = useState(false);

  // Load tracks when session changes
  useEffect(() => {
    if (currentSession) {
      loadTracks();
    }
  }, [currentSession]);

  const loadTracks = async () => {
    if (!currentSession) return;
    
    try {
      const { data: tracksData, error } = await supabase
        .from('tracks')
        .select(`
          *,
          youtube_urls (*)
        `)
        .eq('session_id', currentSession.id)
        .order('track_number');
      
      if (error) throw error;
      
      const formattedTracks: TrackInfo[] = (tracksData || []).map(track => ({
        id: track.id,
        name: track.title,
        trackNumber: track.track_number,
        artist: track.artist,
        duration: track.duration,
        selected: track.selected,
        youtubeUrl: Array.isArray(track.youtube_urls) && track.youtube_urls.length > 0 
          ? track.youtube_urls[0].url 
          : undefined
      }));
      
      setTracks(formattedTracks);
    } catch (error: any) {
      console.error('Error loading tracks:', error);
      toast.error('Failed to load tracks');
    }
  };

  const generatePrompt = () => {
    if (!artist || !album) {
      toast.error("Please enter both artist and album");
      return;
    }

    let prompt = `Find YouTube URLs for all tracks from the album "${album}" by ${artist}`;
    if (year) prompt += ` released in ${year}`;
    
    if (tracks.length > 0) {
      prompt += `\n\nTracks to find:\n${tracks.map(t => 
        `${t.trackNumber ? `${t.trackNumber}. ` : ''}${t.name} by ${t.artist || artist}`
      ).join('\n')}`;
    }
    
    prompt += `\n\nPlease provide accurate, high-quality YouTube links for each track.`;
    
    setAiPrompt(prompt);
    toast.success("AI prompt generated with track information!");
  };

  const generateTrackInfo = async () => {
    if (!artist || !album) {
      toast.error("Please enter both artist and album");
      return;
    }

    setSearchingTracks(true);
    
    try {
      const response = await supabase.functions.invoke('search-musicbrainz', {
        body: {
          artist,
          album,
          year: year ? parseInt(year) : undefined
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to search MusicBrainz');
      }
      
      const data = response.data;
      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }
      
      setCurrentSession({
        id: data.sessionId,
        artist,
        album,
        year: year ? parseInt(year) : undefined
      });
      
      toast.success(`Found ${data.totalTracks} tracks from "${data.release.title}"!`);
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
      const response = await supabase.functions.invoke('find-youtube-urls', {
        body: {
          sessionId: currentSession.id,
          aiPrompt: aiPrompt || undefined
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to find YouTube URLs');
      }
      
      const data = response.data;
      if (!data.success) {
        throw new Error(data.error || 'AI search failed');
      }
      
      // Reload tracks to show the found URLs
      await loadTracks();
      
      toast.success(`AI found ${data.urlsFound} YouTube URLs for your tracks!`);
    } catch (error: any) {
      console.error('Error finding YouTube URLs:', error);
      toast.error(error.message || "Failed to get AI response");
    } finally {
      setFindingUrls(false);
    }
  };

  const downloadSelected = async () => {
    if (!currentSession) {
      toast.error("Please generate track information first");
      return;
    }
    
    const selectedTracks = tracks.filter(track => track.selected);
    
    if (selectedTracks.length === 0) {
      toast.error("Please select at least one track to download");
      return;
    }

    setDownloading(true);
    
    try {
      const response = await supabase.functions.invoke('convert-audio', {
        body: {
          sessionId: currentSession.id,
          trackIds: selectedTracks.map(t => t.id)
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to start conversion');
      }
      
      const data = response.data;
      if (!data.success) {
        throw new Error(data.error || 'Conversion failed');
      }
      
      if (data.downloadUrl) {
        // Open download URL in new tab
        window.open(data.downloadUrl, '_blank');
      }
      
      toast.success(`Started converting ${selectedTracks.length} tracks! ${data.downloadUrl ? 'Download will begin shortly.' : ''}`);
    } catch (error: any) {
      console.error('Error downloading tracks:', error);
      toast.error(error.message || "Failed to start download");
    } finally {
      setDownloading(false);
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
      const results = await Promise.all(
        urls.map(async (url) => {
          const response = await supabase.functions.invoke('process-manual-url', {
            body: { url: url.trim() }
          });
          
          if (response.error) {
            throw new Error(`Failed to process ${url}: ${response.error.message}`);
          }
          
          return response.data;
        })
      );
      
      const successful = results.filter(r => r.success);
      
      if (successful.length > 0) {
        // Open download URLs
        successful.forEach(result => {
          if (result.downloadUrl) {
            window.open(result.downloadUrl, '_blank');
          }
        });
        
        toast.success(`Successfully processed ${successful.length} URL(s)!`);
      }
      
      if (successful.length < results.length) {
        toast.error(`Failed to process ${results.length - successful.length} URL(s)`);
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Music className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              TuneFetcher AI
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Discover and download music tracks with AI-powered search
          </p>
        </div>

        <Card className="mb-8 shadow-music border-primary/10">
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
                  className="border-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <Label htmlFor="album">Album</Label>
                <Input
                  id="album"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="Enter album name"
                  className="border-primary/20 focus:border-primary"
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
                  className="border-primary/20 focus:border-primary"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="shadow-music border-primary/10">
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
                className="w-full bg-gradient-primary hover:opacity-90"
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
                <div className="text-sm text-muted-foreground p-3 bg-secondary/50 rounded-md">
                  Found: {currentSession.album} by {currentSession.artist}
                  {currentSession.year && ` (${currentSession.year})`}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-music border-accent/10">
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
                className="w-full border-accent/20 hover:border-accent"
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
                  className="border-accent/20 focus:border-accent"
                />
              </div>
              <Button 
                onClick={askAi}
                className="w-full bg-gradient-accent hover:opacity-90"
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
          <Card className="mb-8 shadow-music border-primary/10">
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
              <div className="mt-6 flex justify-center">
                <Button 
                  onClick={downloadSelected}
                  disabled={tracks.filter(t => t.selected).length === 0 || downloading}
                  className="bg-gradient-primary hover:opacity-90 px-8 py-3 text-lg"
                  size="lg"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Converting & Preparing Download...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Download Selected Tracks ({tracks.filter(t => t.selected).length})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-music border-accent/10">
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
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ&#10;https://www.youtube.com/watch?v=..."
                rows={4}
                className="border-accent/20 focus:border-accent"
              />
            </div>
            <Button 
              onClick={processManualUrl}
              disabled={!manualUrls.trim() || processingManual}
              className="w-full bg-gradient-accent hover:opacity-90"
            >
              {processingManual ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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