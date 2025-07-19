import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Download } from "lucide-react";

interface TrackInfo {
  id: string;
  name: string;
  youtubeUrl?: string;
  selected: boolean;
}

interface TrackTableProps {
  tracks: TrackInfo[];
  onTracksChange: (tracks: TrackInfo[]) => void;
  albumName: string;
}

export const TrackTable = ({ tracks, onTracksChange, albumName }: TrackTableProps) => {
  const toggleTrackSelection = (trackId: string) => {
    const updatedTracks = tracks.map(track =>
      track.id === trackId ? { ...track, selected: !track.selected } : track
    );
    onTracksChange(updatedTracks);
  };

  const toggleAllTracks = () => {
    const allSelected = tracks.every(track => track.selected);
    const updatedTracks = tracks.map(track => ({
      ...track,
      selected: !allSelected
    }));
    onTracksChange(updatedTracks);
  };

  const selectedCount = tracks.filter(track => track.selected).length;
  const allSelected = tracks.length > 0 && selectedCount === tracks.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {albumName}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAllTracks}
              id="select-all"
            />
            <label htmlFor="select-all" className="cursor-pointer">
              Select All ({selectedCount}/{tracks.length})
            </label>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Select</TableHead>
              <TableHead>Track Name</TableHead>
              <TableHead>YouTube URL</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((track) => (
              <TableRow key={track.id}>
                <TableCell>
                  <Checkbox
                    checked={track.selected}
                    onCheckedChange={() => toggleTrackSelection(track.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{track.name}</TableCell>
                <TableCell>
                  {track.youtubeUrl ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground truncate max-w-xs">
                        {track.youtubeUrl}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(track.youtubeUrl, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No URL found</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!track.youtubeUrl}
                    onClick={() => {
                      // Individual track download logic would go here
                      console.log(`Downloading ${track.name}`);
                    }}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};