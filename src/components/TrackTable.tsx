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
import { ExternalLink, Download, Loader } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

interface TrackTableProps {
  tracks: TrackInfo[];
  onTracksChange: (tracks: TrackInfo[]) => void;
  albumName: string;
  artistName: string;
  onDownloadTrack: (track: TrackInfo) => void;
  onDownloadMultiple: (tracks: TrackInfo[], albumName: string, artistName: string) => Promise<void>;
}

export const TrackTable = ({ tracks, onTracksChange, albumName, artistName, onDownloadTrack, onDownloadMultiple }: TrackTableProps) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadSelected = async () => {
    const selectedTracks = tracks.filter(track => track.selected);
    if (selectedTracks.length === 0) {
      toast.error("No tracks selected for download.");
      return;
    }

    setIsDownloading(true);
    try {
      await onDownloadMultiple(selectedTracks, albumName, artistName);
    } catch (error) {
      // Error is handled in the parent component
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleTrackSelection = (trackId: string) => {
    const updatedTracks = tracks.map(track =>
      track.id === trackId ? { ...track, selected: !track.selected } : track
    );
    onTracksChange(updatedTracks);
  };

  const toggleAllTracks = () => {
    const selectableTracks = tracks.filter(track => track.youtubeUrl);
    const allSelectableSelected = selectableTracks.length > 0 && selectableTracks.every(track => track.selected);

    const updatedTracks = tracks.map(track => {
      if (track.youtubeUrl) {
        return { ...track, selected: !allSelectableSelected };
      }
      return track; // Keep non-selectable tracks as they are
    });
    onTracksChange(updatedTracks);
  };

  const selectableTracks = tracks.filter(track => track.youtubeUrl);
  const selectedCount = selectableTracks.filter(track => track.selected).length;
  const totalSelectableTracks = selectableTracks.length;
  const allSelectableSelected = totalSelectableTracks > 0 && selectedCount === totalSelectableTracks;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {albumName}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={allSelectableSelected}
              onCheckedChange={toggleAllTracks}
              id="select-all"
              disabled={totalSelectableTracks === 0}
            />
            <label htmlFor="select-all" className="cursor-pointer">
              Select All ({selectedCount}/{totalSelectableTracks})
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
              <TableRow key={track.id} className={track.downloadStatus === 'failed' ? 'bg-red-100' : ''}>
                <TableCell>
                  <Checkbox
                    checked={track.selected}
                    onCheckedChange={() => toggleTrackSelection(track.id)}
                    disabled={!track.youtubeUrl}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {track.trackNumber && <span className="text-muted-foreground mr-2">{track.trackNumber}.</span>}
                  {track.name}
                  {track.artist && track.artist !== albumName && (
                    <div className="text-sm text-muted-foreground">by {track.artist}</div>
                  )}
                  {track.duration && (
                    <div className="text-xs text-muted-foreground">
                      {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                    </div>
                  )}
                </TableCell>
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
                    disabled={!track.youtubeUrl || isDownloading}
                    onClick={() => onDownloadTrack(track)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {selectedCount > 0 && (
          <div className="mt-4 text-right">
            <Button onClick={handleDownloadSelected} disabled={isDownloading}>
              {isDownloading ? (
                <><Loader className="h-4 w-4 animate-spin mr-2" /> Downloading...</>
              ) : (
                `Download Selected (${selectedCount})`
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};