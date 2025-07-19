import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Music, Download, Sparkles, Search, Settings } from "lucide-react";
import { TrackTable } from "@/components/TrackTable";
import { useToast } from "@/hooks/use-toast";

interface TrackInfo {
  id: string;
  name: string;
  youtubeUrl?: string;
  selected: boolean;
}

const Index = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useState({
    artist: "",
    album: "",
    song: "",
    playlist: "",
    downloadDir: ""
  });
  
  const [aiPrompt, setAiPrompt] = useState("");
  const [manualUrls, setManualUrls] = useState("");
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const generatePrompt = () => {
    const { artist, album, song, playlist } = searchParams;
    
    let prompt = "";
    if (song && artist) {
      prompt = `Please provide YouTube URLs for the Song: '${song}' by ${artist}. Return only the URL and track name for each result.`;
    } else if (playlist) {
      prompt = `Please provide YouTube URLs for all songs in the Playlist: '${playlist}'. Return only the URL and track name for each track.`;
    } else if (artist && album) {
      prompt = `Please provide YouTube URLs for all songs by the Artist: '${artist}', in the Album: '${album}'. Return only the URL and track name for each track.`;
    } else if (artist) {
      prompt = `Please provide YouTube URLs for the most popular songs by the Artist: '${artist}'. Return only the URL and track name for each track.`;
    }
    
    setAiPrompt(prompt);
  };

  const generateTrackInfo = async () => {
    setIsGenerating(true);
    try {
      // Mock MusicBrainz API call - in real implementation this would call the actual API
      const mockTracks: TrackInfo[] = [
        { id: "1", name: "Sample Track 1", selected: false },
        { id: "2", name: "Sample Track 2", selected: false },
        { id: "3", name: "Sample Track 3", selected: false },
      ];
      
      setTracks(mockTracks);
      toast({
        title: "Track Information Generated",
        description: `Found ${mockTracks.length} tracks`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate track information",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const askAi = async () => {
    setIsAsking(true);
    try {
      // Mock AI response - in real implementation this would call Gemini API
      const updatedTracks = tracks.map(track => ({
        ...track,
        youtubeUrl: `https://youtube.com/watch?v=mock-${track.id}`
      }));
      
      setTracks(updatedTracks);
      toast({
        title: "AI Search Complete",
        description: `Found YouTube URLs for ${updatedTracks.length} tracks`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setIsAsking(false);
    }
  };

  const downloadSelected = () => {
    const selectedTracks = tracks.filter(track => track.selected);
    if (selectedTracks.length === 0) {
      toast({
        title: "No Tracks Selected",
        description: "Please select tracks to download",
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Download Started",
      description: `Starting download of ${selectedTracks.length} tracks`,
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Music className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">TuneFetcherAi</h1>
          </div>
          <p className="text-muted-foreground">
            AI-powered music discovery and download tool
          </p>
        </div>

        {/* Search Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Parameters
            </CardTitle>
            <CardDescription>
              Enter artist, album, song, or playlist information to discover tracks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="artist">Artist</Label>
                <Input
                  id="artist"
                  value={searchParams.artist}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, artist: e.target.value }))}
                  placeholder="Enter artist name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="album">Album</Label>
                <Input
                  id="album"
                  value={searchParams.album}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, album: e.target.value }))}
                  placeholder="Enter album name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="song">Song</Label>
                <Input
                  id="song"
                  value={searchParams.song}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, song: e.target.value }))}
                  placeholder="Enter song name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist">Playlist</Label>
                <Input
                  id="playlist"
                  value={searchParams.playlist}
                  onChange={(e) => setSearchParams(prev => ({ ...prev, playlist: e.target.value }))}
                  placeholder="Enter playlist name"
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Label htmlFor="downloadDir" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Download Directory (Optional)
              </Label>
              <Input
                id="downloadDir"
                value={searchParams.downloadDir}
                onChange={(e) => setSearchParams(prev => ({ ...prev, downloadDir: e.target.value }))}
                placeholder="Leave empty for default location (/music)"
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Prompt Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Prompt
            </CardTitle>
            <CardDescription>
              Generate and customize the AI prompt for track discovery
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={generatePrompt} variant="outline">
                Generate Prompt
              </Button>
              <Button 
                onClick={generateTrackInfo} 
                variant="secondary"
                disabled={isGenerating}
              >
                {isGenerating ? "Generating..." : "Generate Track Information"}
              </Button>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="aiPrompt">AI Prompt (Editable)</Label>
              <Textarea
                id="aiPrompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="AI prompt will appear here after generation"
                rows={4}
              />
            </div>
            
            <Button 
              onClick={askAi} 
              className="w-full"
              disabled={!aiPrompt || isAsking}
            >
              {isAsking ? "Asking AI..." : "Ask AI"}
            </Button>
          </CardContent>
        </Card>

        {/* Track Information Table */}
        {tracks.length > 0 && (
          <TrackTable 
            tracks={tracks}
            onTracksChange={setTracks}
            albumName={searchParams.album || "Discovered Tracks"}
          />
        )}

        {/* Manual URL Entry */}
        <Card>
          <CardHeader>
            <CardTitle>Manual URL Download</CardTitle>
            <CardDescription>
              Enter YouTube URLs manually (one per line)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={manualUrls}
              onChange={(e) => setManualUrls(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              rows={6}
            />
          </CardContent>
        </Card>

        {/* Download Section */}
        <div className="flex justify-center">
          <Button 
            onClick={downloadSelected}
            size="lg" 
            className="flex items-center gap-2"
            disabled={tracks.filter(t => t.selected).length === 0}
          >
            <Download className="h-5 w-5" />
            Download Selected Tracks ({tracks.filter(t => t.selected).length})
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
