import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FindUrlsRequest {
  sessionId: string;
  aiPrompt?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, aiPrompt }: FindUrlsRequest = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Get session and tracks
    const { data: session, error: sessionError } = await supabase
      .from('search_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sessionError || !session) {
      throw new Error('Session not found');
    }
    
    const { data: tracks, error: tracksError } = await supabase
      .from('tracks')
      .select('*')
      .eq('session_id', sessionId)
      .order('track_number');
    
    if (tracksError) {
      throw new Error('Failed to fetch tracks');
    }
    
    if (!tracks || tracks.length === 0) {
      throw new Error('No tracks found for this session');
    }
    
    console.log(`Finding YouTube URLs for ${tracks.length} tracks`);
    
    // Build AI prompt with track information
    const trackList = tracks.map(track => 
      `${track.track_number ? `${track.track_number}. ` : ''}${track.title} by ${track.artist}`
    ).join('\n');
    
    const fullPrompt = `${aiPrompt || 'Find YouTube URLs for these tracks:'}\n\nAlbum: ${session.album} by ${session.artist}\nTracks:\n${trackList}\n\nFor each track, find the most accurate YouTube URL. Provide responses in this exact JSON format:\n[{"trackNumber": 1, "title": "Track Name", "urls": ["https://youtube.com/watch?v=..."]}]`;
    
    // Call Gemini API
    const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? ''
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        }
      })
    });
    
    if (!geminiResponse.ok) {
      throw new Error(`Gemini API failed: ${geminiResponse.status}`);
    }
    
    const geminiData = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) {
      throw new Error('No response from AI');
    }
    
    console.log('AI Response:', aiText);
    
    // Parse AI response for JSON
    let aiResults: any[] = [];
    try {
      // Extract JSON from AI response (might be wrapped in markdown)
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiResults = JSON.parse(jsonMatch[0]);
      } else {
        console.warn('No JSON found in AI response, will use manual search');
      }
    } catch (e) {
      console.warn('Failed to parse AI JSON response:', e);
    }
    
    // Store YouTube URLs for each track
    const youtubeUrls: any[] = [];
    
    for (const track of tracks) {
      const aiResult = aiResults.find(r => 
        r.trackNumber === track.track_number || 
        r.title?.toLowerCase().includes(track.title.toLowerCase())
      );
      
      if (aiResult && aiResult.urls && aiResult.urls.length > 0) {
        for (const url of aiResult.urls) {
          if (url.includes('youtube.com') || url.includes('youtu.be')) {
            youtubeUrls.push({
              track_id: track.id,
              url: url,
              title: aiResult.title || track.title,
              quality_score: 85, // AI found URLs get higher score
              verified: false
            });
          }
        }
      } else {
        // Fallback: create a placeholder for manual search
        youtubeUrls.push({
          track_id: track.id,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.title}`)}`,
          title: `Search: ${track.title}`,
          quality_score: 50,
          verified: false
        });
      }
    }
    
    // Insert YouTube URLs
    if (youtubeUrls.length > 0) {
      const { error: urlsError } = await supabase
        .from('youtube_urls')
        .insert(youtubeUrls);
      
      if (urlsError) {
        console.error('Error inserting YouTube URLs:', urlsError);
        throw new Error('Failed to save YouTube URLs');
      }
    }
    
    // Update session with AI prompt
    await supabase
      .from('search_sessions')
      .update({ ai_prompt: fullPrompt })
      .eq('id', sessionId);
    
    console.log(`Stored ${youtubeUrls.length} YouTube URLs`);
    
    return new Response(JSON.stringify({
      success: true,
      sessionId,
      aiPrompt: fullPrompt,
      urlsFound: youtubeUrls.length,
      aiResults: aiResults.length,
      message: `Found ${youtubeUrls.length} YouTube URLs for ${tracks.length} tracks`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error: any) {
    console.error('YouTube URL search error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to find YouTube URLs' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

serve(handler);