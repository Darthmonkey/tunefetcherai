import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchParams {
  artist: string;
  album: string;
  year?: number;
}

interface Track {
  title: string;
  artist: string;
  trackNumber?: number;
  duration?: number;
  musicbrainzId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, album, year }: SearchParams = await req.json();
    
    console.log(`Searching MusicBrainz for: ${artist} - ${album} (${year || 'no year'})`);
    
    // Search for releases in MusicBrainz
    const searchQuery = `artist:"${artist}" AND release:"${album}"${year ? ` AND date:${year}` : ''}`;
    const encodedQuery = encodeURIComponent(searchQuery);
    
    const releaseSearchUrl = `https://musicbrainz.org/ws/2/release?query=${encodedQuery}&fmt=json&limit=10`;
    
    const releaseResponse = await fetch(releaseSearchUrl, {
      headers: {
        'User-Agent': 'TuneFetcherAi/1.0 (https://github.com/Darthmonkey/tunefetcherai)'
      }
    });
    
    if (!releaseResponse.ok) {
      throw new Error(`MusicBrainz search failed: ${releaseResponse.status}`);
    }
    
    const releaseData = await releaseResponse.json();
    console.log(`Found ${releaseData.releases?.length || 0} releases`);
    
    if (!releaseData.releases || releaseData.releases.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No releases found for the specified artist and album" 
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    // Get the best match (first result)
    const release = releaseData.releases[0];
    console.log(`Selected release: ${release.title} by ${release['artist-credit']?.[0]?.name}`);
    
    // Fetch detailed recording information
    const recordingsUrl = `https://musicbrainz.org/ws/2/release/${release.id}?inc=recordings&fmt=json`;
    
    const recordingsResponse = await fetch(recordingsUrl, {
      headers: {
        'User-Agent': 'TuneFetcherAi/1.0 (https://github.com/Darthmonkey/tunefetcherai)'
      }
    });
    
    if (!recordingsResponse.ok) {
      throw new Error(`Failed to fetch recordings: ${recordingsResponse.status}`);
    }
    
    const recordingsData = await recordingsResponse.json();
    
    // Extract track information
    const tracks: Track[] = [];
    
    if (recordingsData.media) {
      for (const medium of recordingsData.media) {
        if (medium.tracks) {
          for (const track of medium.tracks) {
            tracks.push({
              title: track.title,
              artist: track.recording?.['artist-credit']?.[0]?.name || artist,
              trackNumber: parseInt(track.position) || undefined,
              duration: track.recording?.length ? Math.round(track.recording.length / 1000) : undefined,
              musicbrainzId: track.recording?.id
            });
          }
        }
      }
    }
    
    console.log(`Extracted ${tracks.length} tracks`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Create search session
    const { data: session, error: sessionError } = await supabase
      .from('search_sessions')
      .insert({
        artist,
        album,
        year,
        musicbrainz_data: recordingsData
      })
      .select()
      .single();
    
    if (sessionError) {
      console.error('Error creating session:', sessionError);
      throw new Error('Failed to create search session');
    }
    
    // Insert tracks
    if (tracks.length > 0) {
      const tracksToInsert = tracks.map(track => ({
        session_id: session.id,
        title: track.title,
        artist: track.artist,
        track_number: track.trackNumber,
        duration: track.duration,
        musicbrainz_id: track.musicbrainzId
      }));
      
      const { error: tracksError } = await supabase
        .from('tracks')
        .insert(tracksToInsert);
      
      if (tracksError) {
        console.error('Error inserting tracks:', tracksError);
        throw new Error('Failed to save tracks');
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      sessionId: session.id,
      release: {
        id: release.id,
        title: release.title,
        artist: release['artist-credit']?.[0]?.name,
        date: release.date,
        country: release.country
      },
      tracks,
      totalTracks: tracks.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error: any) {
    console.error('MusicBrainz search error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to search MusicBrainz' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

serve(handler);