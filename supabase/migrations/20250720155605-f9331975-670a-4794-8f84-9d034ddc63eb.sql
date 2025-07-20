-- Create tables for TuneFetcherAi application

-- Table to store search sessions and track information
CREATE TABLE public.search_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  year INTEGER,
  ai_prompt TEXT,
  musicbrainz_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store individual tracks discovered
CREATE TABLE public.tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  track_number INTEGER,
  duration INTEGER, -- in seconds
  musicbrainz_id TEXT,
  selected BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store YouTube URLs found for tracks
CREATE TABLE public.youtube_urls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  duration INTEGER, -- in seconds
  verified BOOLEAN DEFAULT false,
  quality_score INTEGER, -- AI confidence score 1-100
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store conversion/download jobs
CREATE TABLE public.download_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  track_ids UUID[] NOT NULL, -- array of track IDs to download
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  progress INTEGER DEFAULT 0, -- percentage 0-100
  download_url TEXT, -- presigned URL for downloading zip file
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store manual YouTube URL entries
CREATE TABLE public.manual_urls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  download_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_urls ENABLE ROW LEVEL SECURITY;

-- Create policies (open for now since no auth is implemented yet)
CREATE POLICY "Allow all operations on search_sessions" ON public.search_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on tracks" ON public.tracks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on youtube_urls" ON public.youtube_urls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on download_jobs" ON public.download_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on manual_urls" ON public.manual_urls FOR ALL USING (true) WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_search_sessions_updated_at
  BEFORE UPDATE ON public.search_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_download_jobs_updated_at
  BEFORE UPDATE ON public.download_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_manual_urls_updated_at
  BEFORE UPDATE ON public.manual_urls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for converted audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-downloads', 'audio-downloads', true);

-- Create policies for audio downloads storage
CREATE POLICY "Allow public read access to audio downloads" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'audio-downloads');

CREATE POLICY "Allow public insert access to audio downloads" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'audio-downloads');

CREATE POLICY "Allow public update access to audio downloads" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'audio-downloads');

CREATE POLICY "Allow public delete access to audio downloads" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'audio-downloads');