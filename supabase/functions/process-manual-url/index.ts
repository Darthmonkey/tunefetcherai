import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ManualUrlRequest {
  url: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url }: ManualUrlRequest = await req.json();
    
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      throw new Error('Please provide a valid YouTube URL');
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    console.log(`Processing manual URL: ${url}`);
    
    // Create manual URL entry
    const { data: manualUrl, error: insertError } = await supabase
      .from('manual_urls')
      .insert({
        url,
        status: 'processing'
      })
      .select()
      .single();
    
    if (insertError || !manualUrl) {
      throw new Error('Failed to create manual URL entry');
    }
    
    try {
      // Extract video title using yt-dlp info
      // In a real implementation:
      // const infoProcess = Deno.run({
      //   cmd: ["yt-dlp", "--get-title", url],
      //   stdout: "piped"
      // });
      // const infoOutput = await infoProcess.output();
      // const title = new TextDecoder().decode(infoOutput).trim();
      
      // For demo, extract title from URL or use placeholder
      let title = 'YouTube Video';
      try {
        const urlObj = new URL(url);
        if (urlObj.searchParams.get('v')) {
          title = `Video ${urlObj.searchParams.get('v')}`;
        }
      } catch (e) {
        // Use default title
      }
      
      // Update with title
      await supabase
        .from('manual_urls')
        .update({ title })
        .eq('id', manualUrl.id);
      
      // Convert to MP3 using yt-dlp
      // Real implementation would run:
      // const convertProcess = Deno.run({
      //   cmd: [
      //     "yt-dlp",
      //     "--extract-audio",
      //     "--audio-format", "mp3",
      //     "--audio-quality", "0",
      //     "--embed-metadata",
      //     "--add-metadata",
      //     "--output", `${manualUrl.id}.%(ext)s`,
      //     url
      //   ]
      // });
      // await convertProcess.status();
      
      // For demo, create placeholder download URL
      const filename = `${title.replace(/[^a-zA-Z0-9\s-_]/g, '')}.mp3`;
      const downloadUrl = `https://example.com/downloads/${manualUrl.id}/${filename}`;
      
      // In real implementation, upload to storage:
      // const { data: uploadData, error: uploadError } = await supabase.storage
      //   .from('audio-downloads')
      //   .upload(`manual/${manualUrl.id}/${filename}`, audioFile);
      
      // Update completion
      await supabase
        .from('manual_urls')
        .update({ 
          status: 'completed',
          download_url: downloadUrl,
          title
        })
        .eq('id', manualUrl.id);
      
      console.log(`Manual URL ${manualUrl.id} processed successfully`);
      
      return new Response(JSON.stringify({
        success: true,
        id: manualUrl.id,
        title,
        downloadUrl,
        message: 'URL processed successfully'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
      
    } catch (conversionError: any) {
      // Update with error
      await supabase
        .from('manual_urls')
        .update({ 
          status: 'failed',
          error_message: conversionError.message
        })
        .eq('id', manualUrl.id);
      
      throw conversionError;
    }
    
  } catch (error: any) {
    console.error('Manual URL processing error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to process manual URL' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

serve(handler);