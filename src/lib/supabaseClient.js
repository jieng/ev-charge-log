import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lwcuhxlqtenszokpiyoc.supabase.co";
const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3Y3VoeGxxdGVuc3pva3BpeW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTQ4MjcsImV4cCI6MjEwMTQ3MDgyN30.1cn3mOtK1pIdJLT8I-cicXSym7Ku3coLDZirD2qWONY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
