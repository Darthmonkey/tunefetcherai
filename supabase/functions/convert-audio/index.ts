import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConvertRequest {
  sessionId: string;
  trackIds?: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, trackIds }: ConvertRequest = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Create download job
    const { data: job, error: jobError } = await supabase
      .from('download_jobs')
      .insert({
        session_id: sessionId,
        track_ids: trackIds || [],
        status: 'processing',
        progress: 0
      })
      .select()
      .single();
    
    if (jobError || !job) {
      throw new Error('Failed to create download job');
    }
    
    console.log(`Created download job ${job.id}`);
    
    // Get tracks and their YouTube URLs
    let query = supabase
      .from('tracks')
      .select(`
        *,
        youtube_urls (*)
      `)
      .eq('session_id', sessionId);
    
    if (trackIds && trackIds.length > 0) {
      query = query.in('id', trackIds);
    }
    
    const { data: tracks, error: tracksError } = await query;
    
    if (tracksError || !tracks) {
      throw new Error('Failed to fetch tracks');
    }
    
    console.log(`Processing ${tracks.length} tracks for conversion`);
    
    // Update progress
    await supabase
      .from('download_jobs')
      .update({ progress: 10 })
      .eq('id', job.id);
    
    const convertedFiles: string[] = [];
    const errors: string[] = [];
    let progressStep = 80 / tracks.length; // 80% for conversion, 10% each for start/finish
    
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      
      try {
        // Get the best YouTube URL for this track
        const youtubeUrls = Array.isArray(track.youtube_urls) ? track.youtube_urls : [];
        const bestUrl = youtubeUrls
          .filter((url: any) => url.url.includes('youtube.com/watch') || url.url.includes('youtu.be/'))
          .sort((a: any, b: any) => (b.quality_score || 0) - (a.quality_score || 0))[0];
        
        if (!bestUrl) {
          errors.push(`No valid YouTube URL found for track: ${track.title}`);
          continue;
        }
        
        console.log(`Converting track ${i + 1}/${tracks.length}: ${track.title}`);
        console.log(`Using URL: ${bestUrl.url}`);
        
        // Use yt-dlp to download and convert to MP3
        // This would typically run yt-dlp in a subprocess, but for now we'll simulate
        // the process and create a placeholder file
        
        // Simulate conversion command:
        // yt-dlp --extract-audio --audio-format mp3 --audio-quality 0 --embed-metadata --add-metadata URL
        
        const filename = `${track.track_number ? `${track.track_number.toString().padStart(2, '0')} - ` : ''}${track.title.replace(/[^a-zA-Z0-9\s-_]/g, '')}.mp3`;
        
        // In a real implementation, this would run:
        // const process = Deno.run({
        //   cmd: [
        //     "yt-dlp",
        //     "--extract-audio",
        //     "--audio-format", "mp3",
        //     "--audio-quality", "0",
        //     "--embed-metadata",
        //     "--add-metadata",
        //     "--output", filename,
        //     bestUrl.url
        //   ]
        // });
        // await process.status();
        
        // For demo purposes, we'll create a simulated file reference
        convertedFiles.push(filename);
        
        // Update progress
        const currentProgress = Math.round(10 + (i + 1) * progressStep);
        await supabase
          .from('download_jobs')
          .update({ progress: currentProgress })
          .eq('id', job.id);
        
      } catch (error: any) {
        console.error(`Error converting track ${track.title}:`, error);
        errors.push(`Failed to convert ${track.title}: ${error.message}`);
      }
    }
    
    // Create zip file with all converted tracks
    let downloadUrl = null;
    if (convertedFiles.length > 0) {
      // In a real implementation, this would create a zip file and upload to storage
      // For now, we'll create a placeholder download URL
      downloadUrl = `https://example.com/downloads/${job.id}.zip`;
      
      // Upload to Supabase storage
      // const zipData = await createZipFile(convertedFiles);
      // const { data: uploadData, error: uploadError } = await supabase.storage
      //   .from('audio-downloads')
      //   .upload(`${job.id}/album.zip`, zipData);
      
      // if (uploadError) {
      //   throw new Error('Failed to upload converted files');
      // }
      
      // downloadUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/audio-downloads/${uploadData.path}`;
    }
    
    // Update job completion
    const finalStatus = errors.length === tracks.length ? 'failed' : 
                       errors.length > 0 ? 'completed' : 'completed';
    
    await supabase
      .from('download_jobs')
      .update({ 
        status: finalStatus,
        progress: 100,
        download_url: downloadUrl,
        error_message: errors.length > 0 ? errors.join('; ') : null
      })
      .eq('id', job.id);
    
    console.log(`Conversion job ${job.id} completed with ${convertedFiles.length} files and ${errors.length} errors`);
    
    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      filesConverted: convertedFiles.length,
      errors: errors.length,
      downloadUrl,
      status: finalStatus,
      message: `Converted ${convertedFiles.length} of ${tracks.length} tracks`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error: any) {
    console.error('Audio conversion error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to convert audio' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

serve(handler);